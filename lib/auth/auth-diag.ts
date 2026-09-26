import "server-only";
import { createHash } from "node:crypto";

// Allow-listed context keys emitted by `logAuth`. Anything not listed here is
// silently dropped by the projection, so a caller can never accidentally write
// a password, hash, token, JWT, or secret into the server log. Emails are also
// intentionally excluded (PII); correlated via ipHash/actor when needed.
const ALLOWED_KEYS = new Set([
  "reason",
  "status",
  "delivery",
  "actor",
  "bucket",
  "field",
  "result",
]);

/**
 * Server-side diagnostic log for authentication events.
 *
 * The public UI stays generic (anti-enumeration) while the operator-facing log
 * distinguishes: validation failures, duplicate signup, rate-limit rejections,
 * password mismatch vs missing password hash, DB failures, and session/cookie
 * creation failures. Never logs passwords, hashes, session tokens, JWTs, or
 * secrets — only allow-listed context values plus an anonymized IP hash.
 */
export function logAuth<T extends Record<string, string>>(
  event: string,
  details?: T,
  ip?: string
): void {
  const projected: Record<string, string> = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (ALLOWED_KEYS.has(key) && typeof value === "string") projected[key] = value;
  }
  if (ip) projected.ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  console.info(`[auth] ${event} ` + JSON.stringify(projected));
}