import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeEmail, registrationInputSchema } from "@/domain/registrations/registration";
import { InMemoryRegistrationRepository } from "@/server/registrations/repository";
import { FixedWindowLimiter } from "@/server/rate-limit/fixed-window";
import { editionContentSchema } from "@/content/schema";
import { edition } from "@/content/edition";

describe("registration input", () => {
  it("accepts name, e-mail and the rules checkbox", () => {
    const r = registrationInputSchema.safeParse({
      name: " Ana ",
      email: "Ana@Example.com ",
      acceptedRules: "on",
    });
    expect(r.success).toBe(true);
    expect(r.data?.name).toBe("Ana");
  });

  it("rejects invalid e-mail, markup in names and missing consent", () => {
    expect(
      registrationInputSchema.safeParse({ name: "Ana", email: "nope", acceptedRules: "on" }).success,
    ).toBe(false);
    expect(
      registrationInputSchema.safeParse({ name: "<script>", email: "a@b.co", acceptedRules: "on" }).success,
    ).toBe(false);
    expect(registrationInputSchema.safeParse({ name: "Ana", email: "a@b.co" }).success).toBe(false);
  });

  it("normalizes e-mail case for de-duplication", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });
});

describe("in-memory repository", () => {
  it("stores one registration per e-mail hash and edition", async () => {
    const repo = new InMemoryRegistrationRepository();
    const base = { editionSlug: "belem-2026", name: "Ana", email: "ana@example.com", emailHash: "h1" };
    expect(await repo.createIfAbsent(base)).toBe("created");
    expect(await repo.createIfAbsent({ ...base, name: "Outra" })).toBe("duplicate");
    expect(await repo.createIfAbsent({ ...base, editionSlug: "outra-cidade" })).toBe("created");
    expect(repo.size).toBe(2);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    let now = 0;
    const l = new FixedWindowLimiter(2, 1000, () => now);
    expect([l.consume("k"), l.consume("k"), l.consume("k")]).toEqual([true, true, false]);
    now = 1000;
    expect(l.consume("k")).toBe(true);
  });
});

describe("edition content", () => {
  it("is valid and flagged as synthetic until real data is approved", () => {
    expect(editionContentSchema.safeParse(edition).success).toBe(true);
    expect(edition.synthetic).toBe(true);
  });

  it("rejects milestones out of order", () => {
    const bad = {
      ...edition,
      goalPlan: { ...edition.goalPlan, milestones: [...edition.goalPlan.milestones].reverse() },
    };
    expect(editionContentSchema.safeParse(bad).success).toBe(false);
  });

  it("requires alt text for line-up images", () => {
    const bad = {
      ...edition,
      artists: [{ slug: "x", name: "X", confirmed: true, image: "/lineup/x.png" }],
    };
    expect(editionContentSchema.safeParse(bad).success).toBe(false);
  });

  it("only uses line-up images that exist in public/", () => {
    for (const a of edition.artists) {
      if (a.image) expect(existsSync(join(process.cwd(), "public", a.image))).toBe(true);
    }
    expect(existsSync(join(process.cwd(), "public", edition.kit.image))).toBe(true);
  });
});
