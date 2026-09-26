import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { trustProxy } from "@/lib/services/rate-limit";

/**
 * SHA-256 of the raw email, for rate-limit keys never containing the email
 * itself. Same digest the auth actions use, so buckets are consistent.
 */
export function emailKey(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

/**
 * Best-effort client IP for rate limiting. When the deployment trusts a proxy
 * (TRUST_PROXY=1) the first x-forwarded-for entry wins; otherwise headers are
 * ignored and a stable placeholder is used so unauthenticated traffic shares a
 * single bucket instead of being able to spoof its way out of a limit.
 */
export async function getRequestIp(): Promise<string> {
  const h = await headers();
  if (trustProxy()) {
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = h.get("x-real-ip");
    if (realIp) return realIp;
  }
  return "anonymous";
}