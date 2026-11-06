import "server-only";
import { serverConfig } from "@/config/server";

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/**
 * Server-side check for the Google reCAPTCHA v2 checkbox. Skipped while no
 * secret is configured (local demo); required before real sales. Fails closed
 * on any network or provider error.
 */
export async function verifyHuman(
  token: string,
  ip: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const secret = serverConfig().RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (!token || token.length > 4096) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip !== "unknown") body.set("remoteip", ip);
    const res = await fetchImpl(VERIFY_URL, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
