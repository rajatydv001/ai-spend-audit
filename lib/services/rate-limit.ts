import { ApiError } from "@/lib/errors";

/**
 * Rate limiter with a pluggable backend.
 *
 * Two backends are provided:
 * - `memory` (DEFAULT): a module-level in-process fixed-window store. Correct
 *   for the project's current deployment model (`next start` single Node
 *   process). NOT suitable for serverless / multi-instance deployments where
 *   each instance (or cold start) holds its own independent store and limits
 *   become per-instance instead of global.
 * - `upstash` (OPT-IN): a fixed-window counter over Upstash Redis REST API
 *   (plain `fetch`, no extra client dependency). Enabled ONLY when both
 *   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. This IS an
 *   externally shared, distributed limiter; it is never silently claimed as
 *   such unless those variables are actually configured in the environment.
 *
 * `UPSTASH_REDIS_REST_URL` should point at a Top-level REST token endpoint
 * (e.g. `https://your-db.upstash.io`); the token must permit the `INCR` and
 * `PEXPIRE` commands.
 */

export interface RateLimitBackend {
  check(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ ok: boolean; remaining: number }>;
}

class MemoryRateLimitBackend implements RateLimitBackend {
  readonly store = new Map<string, { count: number; resetAt: number }>();

  async check(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1 };
    }

    if (entry.count >= limit) {
      return { ok: false, remaining: 0 };
    }

    entry.count++;
    return { ok: true, remaining: limit - entry.count };
  }

  clear(): void {
    this.store.clear();
  }
}

class UpstashRateLimitBackend implements RateLimitBackend {
  constructor(
    private readonly url: string,
    private readonly token: string
  ) {}

  async check(key: string, limit: number, windowMs: number) {
    // Fixed-window counter keyed by the bucket the request falls into, so
    // counts reset naturally when a new window starts (no per-client cleanup
    // needed beyond the TTL below).
    const bucket = Math.floor(Date.now() / windowMs);
    const windowKey = `${key}:${bucket}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    // Fail-closed policy: in production, a limiter that cannot be read must
    // deny rather than silently allow (a silent allow is exactly how a
    // distributed limit becomes meaningless). In dev/test the request path is
    // never broken by an unreachable limiter, so the check fails open with a
    // warning instead.
    const onFailure = (reason: string): { ok: boolean; remaining: number } => {
      if (process.env.NODE_ENV === "production") {
        console.error(`[rate-limit] upstash backend ${reason} — failing closed`);
        throw new Error("Rate limiting backend unavailable");
      }
      console.warn(`[rate-limit] upstash backend ${reason} — failing open in dev/test`);
      return { ok: true, remaining: limit - 1 };
    };

    // INCR bumps the counter atomically, then PEXPIRE keeps the key from
    // outliving its window. Sequential on purpose: INCR must create the key
    // before PEXPIRE attaches a TTL to it.
    let incrRes: Response;
    try {
      incrRes = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(["INCR", windowKey]),
      });
    } catch (error) {
      return onFailure(`unavailable (${(error as Error).message})`);
    }
    if (!incrRes.ok) {
      return onFailure(`returned HTTP ${incrRes.status}`);
    }

    // Upstash's REST API replies `{"result": N}`. Earlier code read the body as
    // a bare number, so `{"result": 2}` was treated as the limit itself and
    // every request looked within-limits. Parse the envelope explicitly and
    // treat anything unexpected as a backend failure (fail closed in prod).
    let parsed: unknown;
    try {
      parsed = await incrRes.json();
    } catch {
      return onFailure("returned a non-JSON body");
    }

    let count: number | null = null;
    if (typeof parsed === "number") {
      count = parsed;
    } else if (parsed && typeof parsed === "object") {
      const envelope = parsed as { result?: unknown; error?: string };
      if (typeof envelope.result === "number") {
        count = envelope.result;
      } else if (envelope.error) {
        return onFailure(`returned an error: ${envelope.error}`);
      }
    }
    if (count === null) {
      return onFailure("returned an unexpected body shape");
    }

    // Best-effort TTL cleanup: a missed PEXPIRE leaks a key, it never weakens a
    // limit, so it does not fail closed.
    await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(["PEXPIRE", windowKey, windowMs + 1000]),
    }).catch(() => undefined);

    return { ok: count <= limit, remaining: Math.max(0, limit - count) };
  }
}

/**
 * Thrown by checks when the app is running in production without a distributed
 * limiter. This is fail-closed: rate-limited endpoints are not served with an
 * in-process-only limiter that could silently allow abuse through a second
 * instance. Startup/config validation in lib/env also catches this before it
 * matters, so reaching this backend is a defense-in-depth signal.
 */
class UnavailableRateLimitBackend implements RateLimitBackend {
  async check(): Promise<{ ok: boolean; remaining: number }> {
    throw new Error(
      "Rate limiting unavailable: production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Refusing to run rate-limited endpoints without a distributed limiter."
    );
  }
}

export type BackendSelection = "memory" | "upstash" | "misconfigured";

/**
 * Resolve which backend the environment declares.
 * - Both Upstash env vars set → `upstash` (distributed limiter).
 * - Only ONE of the two set → `misconfigured` in every environment (a partial
 *   config must not silently downgrade to memory).
 * - Neither set → memory in dev/test (the documented development model), but
 *   `misconfigured` in production: a single in-process store does NOT provide a
 *   global limit once more than one instance (or a cold start) exists.
 */
export function selectBackendFromEnv(
  processEnv: Record<string, string | undefined>,
  nodeEnv: string = process.env.NODE_ENV ?? "development"
): BackendSelection {
  const hasUrl = Boolean(processEnv.UPSTASH_REDIS_REST_URL);
  const hasToken = Boolean(processEnv.UPSTASH_REDIS_REST_TOKEN);
  if (hasUrl && hasToken) {
    return "upstash";
  }
  if (hasUrl || hasToken) {
    return "misconfigured";
  }
  return nodeEnv === "production" ? "misconfigured" : "memory";
}

function createBackendFromEnv(): RateLimitBackend {
  const selection = selectBackendFromEnv(process.env);
  if (selection === "upstash") {
    return new UpstashRateLimitBackend(
      process.env.UPSTASH_REDIS_REST_URL!,
      process.env.UPSTASH_REDIS_REST_TOKEN!
    );
  }
  if (selection === "misconfigured") {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[rate-limit] production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN; rate limiting is failing closed"
      );
      return new UnavailableRateLimitBackend();
    }
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are only partially configured — falling back to in-process memory in dev/test"
    );
  }
  return new MemoryRateLimitBackend();
}

let backend: RateLimitBackend | null = null;

export function getRateLimitBackend(): RateLimitBackend {
  if (!backend) backend = createBackendFromEnv();
  return backend;
}

/**
 * Test helper - resets the cached backend so a subsequent call re-reads the
 * environment. Not used in production request paths.
 */
export function resetRateLimitBackendForTests(): void {
  backend = null;
}

/**
 * Fixed-window rate limit check. Delegates to the active backend; see the
 * header comment for the memory vs distributed semantics.
 */
export async function rateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60000
): Promise<{ ok: boolean; remaining: number }> {
  return getRateLimitBackend().check(key, limit, windowMs);
}

/**
 * Like `rateLimit` but throws a consistent ApiError(429) so it composes with the
 * existing `withErrorHandling` / `toApiResponse` pipeline.
 */
export async function rateLimitOrThrow(
  key: string,
  limit: number = 60,
  windowMs: number = 60000,
  message = "Too many requests. Please try again later."
): Promise<{ remaining: number }> {
  const result = await rateLimit(key, limit, windowMs);
  if (!result.ok) {
    throw new ApiError(message, 429);
  }
  return { remaining: result.remaining };
}

/**
 * Whether this deployment sits behind a proxy we trust to set x-forwarded-for /
 * x-real-ip. Off by default: without it, forwarded headers are IGNORED so that a
 * client talking to the app directly cannot spoof their apparent IP and dodge
 * per-client rate limits. Operators behind a real proxy set TRUST_PROXY=1.
 */
export function trustProxy(): boolean {
  const value = process.env.TRUST_PROXY;
  return value === "true" || value === "1";
}

/**
 * Best-effort client IP extraction. Forwarded headers are ONLY honored when
 * TRUST_PROXY=1; otherwise they are ignored and a stable placeholder is used so
 * unauthenticated public endpoints still get a distinct (shared) bucket.
 */
export function getClientIp(request: Request): string {
  if (trustProxy()) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp;
  }
  return "anonymous";
}

/**
 * Test helper - clears all in-memory rate-limit state. No-op against a
 * distributed backend. Not used in production request paths.
 */
export function clearRateLimits(): void {
  const active = getRateLimitBackend();
  if (active instanceof MemoryRateLimitBackend) {
    active.clear();
  }
}