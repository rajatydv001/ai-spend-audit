"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/services/rate-limit";
import {
  establishSession,
  revokeActiveSession,
  newSessionId,
  sessionExpiry,
  persistSessionRecord,
} from "@/lib/services/session-service";
import { createAuditLog } from "@/lib/services/audit-log";
import { createOrganization } from "@/lib/services/organization-service";
import { withSerializableTransaction } from "@/lib/services/transaction";
import { createSession } from "@/lib/auth/session";
import { logAuth } from "@/lib/auth/auth-diag";
import { emailKey, getRequestIp } from "@/lib/auth/request";

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

/**
 * Which field(s) a P2002 actually collided on, so "this email is taken" is only
 * ever reported for a real User.email collision. A collision on any other
 * target is a transient internal fault, not a duplicate account.
 */
function uniqueTarget(error: unknown): string | null {
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target;
  if (Array.isArray(target)) return target.join(",");
  if (typeof target === "string") return target;
  return null;
}

const AuthSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

const SignupSchema = AuthSchema.extend({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
});

// Deliberately generic so a signup collision does not confirm whether an email
// is already registered (account enumeration). The specific reason is recorded
// only in the internal audit log.
const GENERIC_SIGNUP_ERROR = "We couldn't create your account. Please try again.";

// Rate-limit dimensions. The IP bucket stops a single source from spraying many
// accounts; the account (email) bucket stops one account from being hammered —
// including when the request carries useful forwarded headers but no distinct
// IP (e.g. "anonymous"). Keys never contain the raw email, only its SHA-256.

/**
 * Accepts only same-site, relative redirect targets. This keeps flows like
 * "/login?next=/invite/{token}" working (an invited user lands back on their
 * invitation after signing in) without ever opening an open redirect to an
 * attacker-controlled URL.
 */
function safeRedirectPath(next: FormDataEntryValue | null): string | null {
  if (typeof next !== "string" || next.length === 0) return null;
  if (next.trim() !== next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  if (/[\s\r\n\t]/.test(next)) return null;
  // Block absolute URLs and anything with a scheme/authority like "/\evil".
  if (next.startsWith("/\\")) return null;
  try {
    const url = new URL(next, "http://local.invalid");
    return url.origin === "http://local.invalid" && url.pathname.length > 0 ? next : null;
  } catch {
    return null;
  }
}

export type AuthFormState =
  | {
      errors?: {
        name?: string[];
        email?: string[];
        password?: string[];
        _form?: string[];
      };
      message?: string;
    }
  | undefined;

export async function signupAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const ip = await getRequestIp();
  const ipCheck = await rateLimit(`auth:signup:ip:${ip}`, 5, 15 * 60 * 1000);
  if (!ipCheck.ok) {
    logAuth("signup_rate_limited", { status: "rejected", bucket: "ip" }, ip);
    return { errors: { _form: ["Too many signup attempts. Please try again later."] } };
  }

  if (!validated.success) {
    logAuth("signup_invalid", { reason: "validation" }, ip);
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { name, email, password } = validated.data;

  let existing;
  try {
    existing = await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    logAuth("signup_db_error", { reason: "db-failure" }, ip);
    throw error;
  }
  if (existing) {
    await createAuditLog({
      userId: "anonymous",
      action: "auth.signup_duplicate",
      entity: "user",
      metadata: JSON.stringify({ email, reason: "email-already-registered" }),
    });
    logAuth("signup_rejected", { reason: "duplicate", result: "generic" }, ip);
    return { errors: { _form: [GENERIC_SIGNUP_ERROR] } };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Signup is ALL-OR-NOTHING.
  //
  // The user row used to be committed on its own, before the workspace, the
  // audit trail and the session record existed. Any failure in those later
  // steps therefore left an ORPHANED user with no organization -- and because
  // the email was then already taken, every subsequent retry fell into the
  // duplicate branch above and reported "We couldn't create your account"
  // forever. The account existed but could never be completed, and the error
  // named the wrong cause, so the failure was unrecoverable and undiagnosable.
  //
  // Everything that must exist together is now created in one transaction, so a
  // failure rolls all of it back and the email stays free for a clean retry.
  //
  // Ordering note: the session ROW is written inside the transaction, but the
  // session COOKIE is set only after the commit succeeds. A rollback can never
  // leave a live cookie pointing at an account that does not exist. The cookie
  // write is the only step left outside the transaction, and it is recoverable
  // -- the account is intact, so the user simply signs in.
  const sid = newSessionId();
  const expiresAt = sessionExpiry();

  let userId: string;
  try {
    userId = await withSerializableTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          // Public signup is never allowed to mint an elevated account. The role
          // stays on the least-privilege default (ANALYST); ADMIN is only ever
          // assigned by organization flows that are explicitly privileged.
          role: "ANALYST",
        },
        select: { id: true },
      });

      // A brand-new account must not land in a dead end: the dashboard and the
      // audit APIs require an organization. Give the user a personal workspace
      // they own. Owning their own org is the explicit, privileged flow that
      // elevates the least-privilege ANALYST role to an in-org ADMIN; platform
      // admin is never minted here.
      await createOrganization(`${name.trim()} Workspace`, user.id, tx as never);

      await createAuditLog(
        {
          userId: user.id,
          action: "user.created",
          entity: "user",
          entityId: user.id,
          metadata: JSON.stringify({ email, provider: "email" }),
        },
        tx as never
      );

      await persistSessionRecord(tx as never, user.id, sid, expiresAt);

      return user.id;
    });
  } catch (error) {
    // `email` is unique: a concurrent signup racing with this one surfaces as a
    // unique-constraint violation, which is treated exactly like a pre-existing
    // account -- never crash, never confirm the email.
    //
    // Only a User.email collision actually means "this email is taken". A P2002
    // on any other target (e.g. a workspace slug) is a transient collision, and
    // mislabelling it as a duplicate would send the user down the wrong path
    // while hiding a real fault. Those rethrow; the rollback above has already
    // freed the email, so a retry succeeds.
    if (isUniqueViolation(error) && uniqueTarget(error) === "email") {
      logAuth("signup_rejected", { reason: "unique-race", result: "generic" }, ip);
      return { errors: { _form: [GENERIC_SIGNUP_ERROR] } };
    }
    logAuth(
      "signup_db_error",
      {
        reason: isUniqueViolation(error)
          ? `unique-${uniqueTarget(error) ?? "unknown"}`
          : "signup-failed",
      },
      ip
    );
    throw error;
  }

  // Committed. Only now may the session cookie be issued.
  try {
    await createSession(userId, sid);
  } catch (error) {
    logAuth("signup_session_error", { reason: "cookie-set" }, ip);
    throw error;
  }
  redirect(safeRedirectPath(formData.get("next")) ?? "/dashboard");
}

export async function loginAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = AuthSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const ip = await getRequestIp();
  // Two dimensions, both enforced: a single IP cannot spray many accounts
  // (20/min), and a single account cannot be brute-forced (10 per 15 min) —
  // even by many IPs, and even when no distinct IP is resolvable. Neither
  // bucket is global, so one user's traffic cannot block unrelated users.
  const ipCheck = await rateLimit(`auth:login:ip:${ip}`, 20, 60 * 1000);
  if (!ipCheck.ok) {
    logAuth("login_rate_limited", { status: "rejected", bucket: "ip" }, ip);
    return { errors: { _form: ["Too many login attempts. Please try again later."] } };
  }
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const emailCheck = await rateLimit(
    `auth:login:email:${emailKey(rawEmail)}`,
    10,
    15 * 60 * 1000
  );
  if (!emailCheck.ok) {
    logAuth("login_rate_limited", { status: "rejected", bucket: "email" }, ip);
    return { errors: { _form: ["Too many login attempts. Please try again later."] } };
  }

  if (!validated.success) {
    logAuth("login_invalid", { reason: "validation" }, ip);
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, password } = validated.data;

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    logAuth("login_db_error", { reason: "db-failure" }, ip);
    throw error;
  }
  if (!user?.passwordHash) {
    await createAuditLog({
      userId: "anonymous",
      action: "auth.login_failed",
      entity: "user",
      metadata: JSON.stringify({ email, reason: "no-account" }),
    });
    logAuth("login_rejected", { reason: "no-account", result: "generic" }, ip);
    return { errors: { _form: ["Invalid email or password"] } };
  }

  let passwordValid: boolean;
  try {
    passwordValid = await bcrypt.compare(password, user.passwordHash);
  } catch (error) {
    logAuth("login_db_error", { reason: "verify-failure" }, ip);
    throw error;
  }
  if (!passwordValid) {
    await createAuditLog({
      userId: user.id,
      action: "auth.login_failed",
      entity: "user",
      entityId: user.id,
      metadata: JSON.stringify({ email, reason: "bad-password" }),
    });
    logAuth("login_rejected", { reason: "password-mismatch", result: "generic" }, ip);
    return { errors: { _form: ["Invalid email or password"] } };
  }

  await createAuditLog({
    userId: user.id,
    action: "user.login",
    entity: "user",
    entityId: user.id,
  });

  try {
    await establishSession(user.id);
  } catch (error) {
    logAuth("login_session_error", { reason: "session-creation" }, ip);
    throw error;
  }
  redirect(safeRedirectPath(formData.get("next")) ?? "/dashboard");
}

export async function logoutAction(): Promise<void> {
  // Invalidate the server-side session record first, then clear the cookie, so
  // a replayed old cookie is rejected by requireUserId/getSessionUser.
  try {
    await revokeActiveSession();
  } catch (error) {
    logAuth("logout_error", { reason: "revoke-failure" });
    throw error;
  }
  redirect("/login");
}
