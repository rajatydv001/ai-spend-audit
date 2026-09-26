import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";

// Short-lived by design: a leaked/lingering reset URL is useless after this
// window, so a stale "click this reset link" email cannot be abused later.
export const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * One-way hash of the raw reset token. Only this hash is ever persisted (the
 * raw token exists only in the email link, mirroring Session.tokenHash). A DB
 * read of the token column can never recover a usable credential.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Cryptographically random 256-bit token, base64url so it is URL-safe inside a
 * reset link with no extra encoding.
 */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Issues a fresh single-use reset token for the user and invalidates any other
 * outstanding tokens they may hold (at most one active reset per account). The
 * raw token is returned to the caller for delivery; only its hash is stored.
 */
export async function createPasswordResetTokenForUser(userId: string): Promise<string> {
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = generateResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    },
  });
  return token;
}

/**
 * Redeems a reset token atomically: marks it used, sets the new password hash,
 * and revokes every remaining session so an already-stolen session cannot
 * outlive the password rotation. Returns the user id on success, or null if the
 * token is unknown, already used, or expired.
 */
export async function consumePasswordResetToken(
  token: string,
  passwordHash: string
): Promise<string | null> {
  const now = new Date();
  const tokenHash = hashResetToken(token);

  return prisma.$transaction(async (tx) => {
    // The claim and the checks are one condition on a single UPDATE: two
    // concurrent requests cannot both win (updateMany returning 0 rows means
    // the token was absent, already used, or timed out — all the same failure).
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;

    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    if (!row) return null;

    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    });
    await tx.session.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return row.userId;
  });
}