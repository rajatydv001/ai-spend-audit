"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/services/rate-limit";
import { createAuditLog } from "@/lib/services/audit-log";
import { sendPasswordResetEmail } from "@/lib/services/notification-service";
import {
  createPasswordResetTokenForUser,
  consumePasswordResetToken,
} from "@/lib/services/password-reset-service";
import { logAuth } from "@/lib/auth/auth-diag";
import { emailKey, getRequestIp } from "@/lib/auth/request";

const RequestResetSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Invalid reset link").max(512),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

// Same message for every outcome (account found, account missing, rate-limited)
// so the endpoint cannot be used to enumerate registered addresses.
const GENERIC_RESET_MESSAGE =
  "If an account exists for that email, we've sent a password reset link.";

export type RequestResetState =
  | { errors?: { email?: string[] }; message?: string }
  | undefined;

export type ResetPasswordState =
  | { errors?: { token?: string[]; password?: string[]; _form?: string[] }; message?: string }
  | undefined;

/**
 * Starts an account recovery. Always answers with the same generic message:
 * whether the email is registered (token issued + emailed), unregistered
 * (nothing happens), or rate-limited (nothing happens) — the caller cannot
 * tell. Registered accounts with a NULL passwordHash (legacy accounts that
 * never set a password) get the same recovery path as everyone else: the reset
 * flow is how they set their first password.
 */
export async function requestPasswordResetAction(
  _state: RequestResetState,
  formData: FormData
): Promise<RequestResetState> {
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = await getRequestIp();

  const ipCheck = await rateLimit(`auth:reset:ip:${ip}`, 5, 15 * 60 * 1000);
  if (!ipCheck.ok) {
    logAuth("reset_request_rate_limited", { status: "rejected", bucket: "ip" }, ip);
    return { message: GENERIC_RESET_MESSAGE };
  }
  const emailCheck = await rateLimit(
    `auth:reset:email:${emailKey(rawEmail)}`,
    3,
    15 * 60 * 1000
  );
  if (!emailCheck.ok) {
    logAuth("reset_request_rate_limited", { status: "rejected", bucket: "email" }, ip);
    return { message: GENERIC_RESET_MESSAGE };
  }

  const validated = RequestResetSchema.safeParse({ email: rawEmail });
  if (!validated.success) {
    logAuth("reset_request_invalid", { reason: "validation" }, ip);
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email } = validated.data;

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    logAuth("reset_request_db_error", { reason: "db-failure" }, ip);
    throw error;
  }

  // No account: still generic, just don't mint a token or send anything.
  if (!user) {
    await createAuditLog({
      userId: "anonymous",
      action: "auth.password_reset_requested",
      entity: "user",
      metadata: JSON.stringify({ email, reason: "no-account", delivery: "none" }),
    });
    logAuth("reset_requested", { reason: "no-account", result: "generic" }, ip);
    return { message: GENERIC_RESET_MESSAGE };
  }

  try {
    const token = await createPasswordResetTokenForUser(user.id);
    const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const { status } = await sendPasswordResetEmail({ to: email, resetUrl });

    await createAuditLog({
      userId: user.id,
      action: "auth.password_reset_requested",
      entity: "user",
      entityId: user.id,
      metadata: JSON.stringify({
        email,
        reason: user.passwordHash ? "created" : "created-nohash",
        delivery: status,
      }),
    });
    logAuth("reset_requested", { reason: "token-issued", delivery: status }, ip);
  } catch (error) {
    logAuth("reset_request_error", { reason: "issue-failure" }, ip);
    throw error;
  }

  return { message: GENERIC_RESET_MESSAGE };
}

/**
 * Redeems a reset token. A token that is missing, expired, or already used all
 * produce the same failure (single-use). On success the new password is hashed
 * exactly like signup/login (bcrypt cost 10), every current session is revoked,
 * and the token can never be redeemed again.
 */
export async function resetPasswordAction(
  _state: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const ip = await getRequestIp();

  const ipCheck = await rateLimit(`auth:reset:confirm:ip:${ip}`, 10, 60 * 1000);
  if (!ipCheck.ok) {
    logAuth("reset_confirm_rate_limited", { status: "rejected", bucket: "ip" }, ip);
    return { errors: { _form: ["Too many attempts. Please try again later."] } };
  }

  const validated = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!validated.success) {
    logAuth("reset_confirm_invalid", { reason: "validation" }, ip);
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { token, password } = validated.data;

  const passwordHash = await bcrypt.hash(password, 10);
  let userId: string | null;
  try {
    userId = await consumePasswordResetToken(token, passwordHash);
  } catch (error) {
    logAuth("reset_confirm_db_error", { reason: "db-failure" }, ip);
    throw error;
  }

  if (!userId) {
    logAuth("reset_confirm_rejected", { reason: "invalid-or-used-token", result: "generic" }, ip);
    return { errors: { _form: ["This reset link is invalid or has expired."] } };
  }

  await createAuditLog({
    userId,
    action: "auth.password_reset",
    entity: "user",
    entityId: userId,
    metadata: JSON.stringify({ delivery: "token-redeemed" }),
  });
  logAuth("reset_confirmed", { reason: "password-reset", result: "success" }, ip);

  redirect(`/login?reset=1`);
}