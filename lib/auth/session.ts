import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const SESSION_COOKIE = "session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionPayload {
  userId: string;
  sid: string;
  expiresAt: Date;
}

const encodedKey = new TextEncoder().encode(env.SESSION_SECRET);

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, sid: payload.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(payload.expiresAt.getTime()))
    .sign(encodedKey);
}

export async function decrypt(
  session: string | undefined = ""
): Promise<SessionPayload | null> {
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string") return null;
    if (typeof payload.sid !== "string" || payload.sid.length === 0) return null;
    return {
      userId: payload.userId,
      sid: payload.sid,
      expiresAt: new Date(payload.exp ?? (Date.now() + SESSION_DURATION_MS)),
    };
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * Sets the signed, httpOnly session cookie for a newly established session.
 * The caller MUST also persist the session record (see
 * `lib/services/session-service.ts` `establishSession`) so the session can be
 * validated and revoked server-side. Only the random `sid` (not the token, not
 * the JWT) is ever persisted; it is stored as a one-way hash.
 */
export async function createSession(userId: string, sid: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await encrypt({ userId, sid, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session, {
    ...cookieOptions,
    expires: expiresAt,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value;
  return decrypt(cookie);
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}