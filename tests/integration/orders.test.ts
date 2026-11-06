import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";

vi.mock("server-only", () => ({}));

import { editions, kits, orders, outbox, paymentEvidence, webhookInbox } from "../../db/schema";
import { OrderStore } from "@/server/orders/postgres-repository";
import {
  cancelOpenOrder,
  handleNotification,
  reconcile,
  startCheckout,
  type Deps,
} from "@/server/orders/service";
import { MOCK_SELLER_ID, MockPaymentProvider } from "@/server/payments/mock";

/** Disposable database only (spec §18.2): the schema is rebuilt on every run. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("postgres orders", () => {
  const client = postgres(url ?? "", { max: 10, prepare: false, onnotice: () => {} });
  const db = drizzle(client);
  const store = new OrderStore(db);
  let provider: MockPaymentProvider;
  let deps: Deps;
  const input = {
    name: "Ana",
    email: "ana@example.com",
    print: "logo",
    size: "M",
    acceptedTerms: "on" as const,
  };

  const session = () => store.createSession(crypto.randomUUID(), new Date(Date.now() + 3600_000));
  const notify = (remoteId: string) =>
    handleNotification(
      { url: `https://x.test/api/webhooks/payments?data.id=${remoteId}`, headers: new Headers(), body: "" },
      deps,
    );
  async function stock() {
    const [k] = await db.select({ r: kits.stockReserved, s: kits.stockSold }).from(kits);
    return [k.r, k.s];
  }
  async function only() {
    const rows = await db.select().from(orders);
    expect(rows).toHaveLength(1);
    return rows[0];
  }
  async function expireAll() {
    await db.execute(sql`update orders set expires_at = now() - interval '1 hour'`);
  }

  beforeAll(async () => {
    await db.execute(
      sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`,
    );
    await migrate(db, { migrationsFolder: "db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate outbox, payment_evidence, webhook_inbox, orders, visitor_sessions, job_leases, kits cascade`,
    );
    const [ed] = await db.select({ id: editions.id }).from(editions).where(eq(editions.slug, "belem-2026"));
    await db
      .insert(kits)
      .values({ editionId: ed.id, sku: "kit", name: "Kit", priceCents: 9000, stockTotal: 3, active: true });
    provider = new MockPaymentProvider();
    deps = {
      store,
      provider,
      baseUrl: "https://x.test",
      ttlMinutes: 30,
      sellerUserId: MOCK_SELLER_ID,
      applicationId: null,
    };
  });

  afterAll(async () => {
    await client.end();
  });

  it("is unavailable while the kit is inactive", async () => {
    await db.update(kits).set({ active: false });
    expect(await startCheckout(input, "belem-2026", await session(), deps)).toEqual({
      status: "unavailable",
    });
  });

  it("converges double clicks and tabs of one session on one order", async () => {
    const s = await session();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => startCheckout(input, "belem-2026", s, deps)),
    );
    const urls = new Set(
      results.filter((r) => r.status === "redirect").map((r) => (r as { url: string }).url),
    );
    expect(urls.size).toBe(1);
    expect(results.every((r) => r.status === "redirect" || r.status === "in_progress")).toBe(true);
    expect(await db.$count(orders)).toBe(1);
    expect(provider.orders.size).toBe(1);
    expect(await stock()).toEqual([1, 0]);

    expect(await startCheckout({ ...input, size: "G" }, "belem-2026", s, deps)).toMatchObject({
      status: "other_open_order",
    });
  });

  it("never oversells across sessions", async () => {
    const sessions = await Promise.all(Array.from({ length: 8 }, session));
    const results = await Promise.all(sessions.map((s) => startCheckout(input, "belem-2026", s, deps)));
    expect(results.filter((r) => r.status === "redirect")).toHaveLength(3);
    expect(results.filter((r) => r.status === "sold_out")).toHaveLength(5);
    expect(await stock()).toEqual([3, 0]);
  });

  it("pays once from a notification, with evidence and one outbox effect", async () => {
    await startCheckout(input, "belem-2026", await session(), deps);
    const remoteId = (await only()).providerOrderId!;
    provider.setRemote(remoteId, { status: "processed", statusDetail: "accredited", paidCents: 9000 });

    const results = await Promise.all(Array.from({ length: 4 }, () => notify(remoteId)));
    expect(results.every((r) => r.httpStatus === 200)).toBe(true);
    const o = await only();
    expect([o.financialStatus, o.reservationStatus]).toEqual(["paid", "committed"]);
    expect(await stock()).toEqual([0, 1]);
    expect(await db.$count(outbox)).toBe(1);
    expect(await db.$count(paymentEvidence)).toBe(1);
  });

  it("rejects unsigned notices and keeps foreign orders for review", async () => {
    const bad = await handleNotification(
      { url: "https://x.test/api/webhooks/payments", headers: new Headers(), body: "" },
      deps,
    );
    expect(bad.httpStatus).toBe(401);

    await startCheckout(input, "belem-2026", await session(), deps);
    const remoteId = (await only()).providerOrderId!;
    provider.setRemote(remoteId, { status: "processed", paidCents: 9000, userId: "someone-else" });
    await notify(remoteId);
    const o = await only();
    expect([o.financialStatus, o.reservationStatus, o.reviewReason]).toEqual([
      "requires_review",
      "held",
      "seller_mismatch",
    ]);
    expect(await stock()).toEqual([1, 0]);
  });

  it("keeps the inbox row when the provider is down, and the job recovers it", async () => {
    await startCheckout(input, "belem-2026", await session(), deps);
    const remoteId = (await only()).providerOrderId!;
    provider.setRemote(remoteId, { status: "processed", paidCents: 9000 });
    const spy = vi.spyOn(provider, "getOrder").mockRejectedValueOnce(new Error("down"));
    expect((await notify(remoteId)).httpStatus).toBe(200);
    expect((await only()).financialStatus).toBe("unpaid");
    spy.mockRestore();

    await db.execute(sql`update webhook_inbox set next_attempt_at = now()`);
    const report = await reconcile(deps, { holder: "t" });
    expect(report?.inbox).toBe(1);
    expect((await only()).financialStatus).toBe("paid");
    const [row] = await db.select().from(webhookInbox);
    expect(row.processedAt).not.toBeNull();
  });

  it("never creates a second charge after a lost answer", async () => {
    const s = await session();
    provider.nextCreate = { status: "unknown", reason: "TimeoutError" };
    expect(await startCheckout(input, "belem-2026", s, deps)).toEqual({ status: "in_progress" });
    expect((await only()).creationState).toBe("unknown");

    // Same intent again: same idempotency key, so the same remote order.
    const again = await startCheckout(input, "belem-2026", s, deps);
    expect(again.status).toBe("redirect");
    expect(provider.orders.size).toBe(1);
    expect(await stock()).toEqual([1, 0]);
  });

  it("gives the unit back when the provider rejects the creation", async () => {
    provider.nextCreate = { status: "rejected", reason: "http_400" };
    expect(await startCheckout(input, "belem-2026", await session(), deps)).toEqual({
      status: "unavailable",
    });
    const o = await only();
    expect([o.reservationStatus, o.creationState]).toEqual(["released", "rejected"]);
    expect(await stock()).toEqual([0, 0]);
  });

  it("releases an expired hold only after the remote order is canceled", async () => {
    await startCheckout(input, "belem-2026", await session(), deps);
    const remoteId = (await only()).providerOrderId!;

    // Not expired yet: nothing happens.
    expect((await reconcile(deps, { holder: "t" }))?.released).toBe(0);

    await expireAll();
    const report = await reconcile(deps, { holder: "t" });
    expect(report?.released).toBe(1);
    expect(provider.orders.get(remoteId)?.status).toBe("canceled");
    expect((await only()).reservationStatus).toBe("released");
    expect(await stock()).toEqual([0, 0]);
  });

  it("keeps the hold when the payment is still processing after expiry", async () => {
    await startCheckout(input, "belem-2026", await session(), deps);
    const remoteId = (await only()).providerOrderId!;
    provider.setRemote(remoteId, { status: "processing" });
    await expireAll();
    const report = await reconcile(deps, { holder: "t" });
    expect([report?.released, report?.flagged]).toEqual([0, 1]);
    const o = await only();
    expect([o.reservationStatus, o.reviewReason]).toEqual(["held", "processing_after_expiry"]);
    expect(await stock()).toEqual([1, 0]);
  });

  it("recommits stock for a late payment, or flags it when sold out", async () => {
    await db.update(kits).set({ stockTotal: 1 });
    await startCheckout(input, "belem-2026", await session(), deps);
    const remoteId = (await only()).providerOrderId!;
    await expireAll();
    await reconcile(deps, { holder: "t" });
    expect(await stock()).toEqual([0, 0]);

    // Someone else buys the last unit, then the late payment shows up.
    await startCheckout(input, "belem-2026", await session(), deps);
    provider.setRemote(remoteId, { status: "processed", paidCents: 9000 });
    await notify(remoteId);
    const [late] = await db.select().from(orders).where(eq(orders.providerOrderId, remoteId));
    expect([late.financialStatus, late.reservationStatus, late.reviewReason]).toEqual([
      "requires_review",
      "exception",
      "paid_without_stock",
    ]);
  });

  it("lets the buyer cancel an open order to start another", async () => {
    const s = await session();
    await startCheckout(input, "belem-2026", s, deps);
    expect(await cancelOpenOrder(s, deps)).toBe("canceled");
    expect(await stock()).toEqual([0, 0]);
    expect((await startCheckout({ ...input, size: "G" }, "belem-2026", s, deps)).status).toBe("redirect");
  });

  it("runs one reconciliation at a time", async () => {
    expect(await store.acquireLease("reconcile", "a", 60)).toBe(true);
    expect(await reconcile(deps, { holder: "b" })).toBeNull();
    await store.releaseLease("reconcile", "a");
    expect(await reconcile(deps, { holder: "b" })).not.toBeNull();
  });
});
