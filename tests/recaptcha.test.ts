import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const env = { RECAPTCHA_SECRET_KEY: undefined as string | undefined };
vi.mock("@/config/server", () => ({ serverConfig: () => env }));

import { verifyHuman } from "@/server/bot/recaptcha";

describe("recaptcha", () => {
  const answer = (success: boolean) => (async () => Response.json({ success })) as unknown as typeof fetch;

  it("is skipped while no secret is configured", async () => {
    env.RECAPTCHA_SECRET_KEY = undefined;
    expect(await verifyHuman("", "1.2.3.4", answer(false))).toBe(true);
  });

  it("requires a token Google accepts, and fails closed on errors", async () => {
    env.RECAPTCHA_SECRET_KEY = "secret";
    expect(await verifyHuman("", "1.2.3.4", answer(true))).toBe(false);
    expect(await verifyHuman("tok", "1.2.3.4", answer(false))).toBe(false);
    expect(await verifyHuman("tok", "1.2.3.4", answer(true))).toBe(true);
    const down = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await verifyHuman("tok", "1.2.3.4", down)).toBe(false);
  });
});
