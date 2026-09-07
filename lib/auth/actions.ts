"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/auth/session";
import { rateLimit, trustProxy } from "@/lib/services/rate-limit";
import { createAuditLog } from "@/lib/services/audit-log";
import { createOrganization } from "@/lib/services/organization-service";

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

async function getRequestIp(): Promise<string> {
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

  const rateCheck = await rateLimit(`auth:signup:${await getRequestIp()}`, 5, 15 * 60 * 1000);
  if (!rateCheck.ok) {
    return { errors: { _form: ["Too many signup attempts. Please try again later."] } };
  }

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { name, email, password } = validated.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await createAuditLog({
      userId: "anonymous",
      action: "auth.signup_duplicate",
      entity: "user",
      metadata: JSON.stringify({ email, reason: "email-already-registered" }),
    });
    return { errors: { _form: [GENERIC_SIGNUP_ERROR] } };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let userId: string;
  try {
    const user = await prisma.user.create({
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
    userId = user.id;
  } catch (error) {
    // `email` is unique: a concurrent signup racing with this one surfaces as a
    // unique-constraint violation. Treat it the same as a pre-existing account —
    // never crash, never confirm the email.
    const code = (error as { code?: string } | null)?.code;
    if (code === "P2002") {
      return { errors: { _form: [GENERIC_SIGNUP_ERROR] } };
    }
    throw error;
  }

  // A brand-new account must not land in a dead end: the dashboard and the
  // audit APIs require an organization. Give the user a personal workspace they
  // own. Owning their own org is the explicit, privileged flow that elevates
  // the least-privilege ANALYST role to an in-org ADMIN; platform admin is
  // never minted here. If this fails after the user row exists the request
  // throws (infra failure) rather than silently stranding the user.
  await createOrganization(`${name.trim()} Workspace`, userId);

  await createAuditLog({
    userId,
    action: "user.created",
    entity: "user",
    entityId: userId,
    metadata: JSON.stringify({ email, provider: "email" }),
  });

  await createSession(userId);
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

  const rateCheck = await rateLimit(`auth:login:${await getRequestIp()}`, 10, 60 * 1000);
  if (!rateCheck.ok) {
    return { errors: { _form: ["Too many login attempts. Please try again later."] } };
  }

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, password } = validated.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    await createAuditLog({
      userId: "anonymous",
      action: "auth.login_failed",
      entity: "user",
      metadata: JSON.stringify({ email, reason: "no-account" }),
    });
    return { errors: { _form: ["Invalid email or password"] } };
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    await createAuditLog({
      userId: user.id,
      action: "auth.login_failed",
      entity: "user",
      entityId: user.id,
      metadata: JSON.stringify({ email, reason: "bad-password" }),
    });
    return { errors: { _form: ["Invalid email or password"] } };
  }

  await createAuditLog({
    userId: user.id,
    action: "user.login",
    entity: "user",
    entityId: user.id,
  });

  await createSession(user.id);
  redirect(safeRedirectPath(formData.get("next")) ?? "/dashboard");
}

export async function logoutAction(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
