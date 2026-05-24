import { NextResponse } from "next/server";

const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60000
): { ok: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0 };
  }

  entry.count++;
  return { ok: true, remaining: limit - entry.count };
}

export function rateLimitMiddleware(
  request: Request,
  limit?: number,
  windowMs?: number
): NextResponse | null {
  const ip = request.headers.get("x-forwarded-for") || "anonymous";
  const result = rateLimit(ip, limit, windowMs);

  if (!result.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  return null;
}
