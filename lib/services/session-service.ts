import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  SESSION_DURATION_MS,
  createSession,
  getSession,
  deleteSession,
  type SessionPayload,
} from "@/lib/auth/session";

/**
 * Server-side session records complement the stateless JWT cookie: the JWT
 * proves the holder knew the secret at issuance, and the `Session` row proves
 * the session has not been revoked. Logout (and future "log me out everywhere")
 * works by revoking the row — replaying an old cookie afterwards yields a 401.
 *
 * Privacy: only a one-way hash of the random session id (`sid`) is persisted.
 * The JWT itself (the bearer credential) is never stored in the database.
 */
export function hashSessionToken(sid: string): string {
  return createHash("sha256").update(sid).digest("hex");
}

/**
 * Generates a fresh random session id, persists its record (unrevoked), then
 * signs the JWT and sets the httpOnly cookie. Every authenticated session is
 * therefore revocable server-side.
 */
export async function establishSession(userId: string): Promise<void> {
  const sid = newSessionId();
  const expiresAt = sessionExpiry();
  await persistSessionRecord(prisma, userId, sid, expiresAt);
  await createSession(userId, sid);
}

/** A cryptographically random session id. Only its SHA-256 hash is ever stored. */
export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

/**
 * Persists the revocable server-side session record through the given client.
 *
 * Split out from `establishSession` so signup can commit the session ROW inside
 * the same transaction as the user and workspace, and set the cookie only after
 * that transaction commits. Writing the cookie inside the transaction would let a
 * rollback leave a live cookie pointing at an account that does not exist.
 */
export async function persistSessionRecord(
  client: { session: { create: (args: never) => Promise<unknown> } },
  userId: string,
  sid: string,
  expiresAt: Date
): Promise<void> {
  await (client.session.create as (args: unknown) => Promise<unknown>)({
    data: {
      userId,
      tokenHash: hashSessionToken(sid),
      expiresAt,
    },
  });
}

/**
 * True only when the session id from the cookie matches a live, unrevoked,
 * unexpired server-side record. Anything else (missing row, revoked, expired,
 * malformed sid) is treated as inactive so a stale JWT cannot be replayed.
 */
export async function isSessionActive(payload: SessionPayload | null): Promise<boolean> {
  if (!payload?.sid) return false;
  const record = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(payload.sid) },
    select: { revokedAt: true, expiresAt: true },
  });
  if (!record) return false;
  if (record.revokedAt) return false;
  if (record.expiresAt.getTime() < Date.now()) return false;
  return true;
}

function isValidPayload(payload: SessionPayload | null): payload is SessionPayload {
  return Boolean(payload?.userId && payload.sid);
}

/**
 * Revokes the session authenticated by the current cookie (logout) and clears
 * the cookie. Safe to call when no session exists.
 */
export async function revokeActiveSession(): Promise<void> {
  const payload = await getSession();
  if (isValidPayload(payload)) {
    await prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(payload.sid), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await deleteSession();
}

/**
 * Revokes every session belonging to the user (e.g. "log out everywhere", or a
 * password change should one be introduced). Unused by the current UI but the
 * primitive the existing design needs if that flow is ever added.
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}