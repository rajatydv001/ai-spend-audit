import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

const ipState = { value: "203.0.113.100" };

vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-forwarded-for": ipState.value }),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  resetTokenCreate: vi.fn(),
  resetTokenUpdateMany: vi.fn(),
  resetTokenFindUnique: vi.fn(),
  sessionUpdateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/services/notification-service", () => ({
  sendPasswordResetEmail: mocks.sendEmail,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
    passwordResetToken: {
      create: mocks.resetTokenCreate,
      updateMany: mocks.resetTokenUpdateMany,
      findUnique: mocks.resetTokenFindUnique,
    },
    session: { updateMany: mocks.sessionUpdateMany },
    auditLog: { create: mocks.auditLogCreate },
    $transaction: (cb: (tx: unknown) => unknown) =>
      cb({
        passwordResetToken: {
          updateMany: mocks.resetTokenUpdateMany,
          findUnique: mocks.resetTokenFindUnique,
        },
        user: { update: mocks.userUpdate },
        session: { updateMany: mocks.sessionUpdateMany },
        auditLog: { create: mocks.auditLogCreate },
      }),
  },
}));

import { redirect } from "next/navigation";
import { clearRateLimits } from "@/lib/services/rate-limit";
import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/lib/auth/reset-actions";
import {
  createPasswordResetTokenForUser,
  consumePasswordResetToken,
  hashResetToken,
  generateResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "@/lib/services/password-reset-service";

const requestForm = (email: string) => {
  const form = new FormData();
  form.set("email", email);
  return form;
};

const resetForm = (token: string, password = "new-password-123") => {
  const form = new FormData();
  form.set("token", token);
  form.set("password", password);
  return form;
};

const GENERIC = "If an account exists for that email, we've sent a password reset link.";

beforeEach(() => {
  vi.clearAllMocks();
  clearRateLimits();
  ipState.value = "203.0.113.100";
  mocks.sendEmail.mockResolvedValue({ status: "sent" as const });
});

describe("password-reset service primitives", () => {
  it("hashes the token one-way: stable 64-hex digest, never the raw token", () => {
    const raw = "some-raw-reset-token";
    expect(hashResetToken(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashResetToken(raw)).toBe(hashResetToken(raw));
    expect(hashResetToken(raw)).not.toBe(raw);
    expect(hashResetToken(raw)).not.toContain(raw);
  });

  it("generates a cryptographically random URL-safe token", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it("issues a fresh token, storing only its hash with a short expiry", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });
    mocks.resetTokenCreate.mockImplementation(async ({ data }: { data: { tokenHash: string } }) => ({
      id: "t1",
      ...data,
    }));

    const raw = await createPasswordResetTokenForUser("u1");

    // Invalidates any older outstanding token for the same user first.
    expect(mocks.resetTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    const create = mocks.resetTokenCreate.mock.calls[0]?.[0] as { data: { userId: string; tokenHash: string; expiresAt: Date } };
    expect(create.data.userId).toBe("u1");
    expect(create.data.tokenHash).toBe(hashResetToken(raw));
    expect(create.data.tokenHash).not.toBe(raw);
    expect(create.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(create.data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(PASSWORD_RESET_TOKEN_TTL_MS + 1000);
  });
});

describe("consumePasswordResetToken", () => {
  it("atomically marks used, replaces the password hash, and revokes every session; returns the user id", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.resetTokenFindUnique.mockResolvedValueOnce({ userId: "u1" });
    mocks.userUpdate.mockResolvedValue({ id: "u1" });
    mocks.sessionUpdateMany.mockResolvedValue({ count: 2 });

    const result = await consumePasswordResetToken("raw-token", "my-bcrypt-hash");

    expect(result).toBe("u1");
    // Claim is conditional on unused + unexpired + exact hash.
    expect(mocks.resetTokenUpdateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: hashResetToken("raw-token"),
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "my-bcrypt-hash" },
    });
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("returns null for an unknown, expired, or already-used token and changes nothing", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });

    const result = await consumePasswordResetToken("bad-token", "hash");

    expect(result).toBeNull();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
  });

  it("is single-use: the second redemption of the same token fails", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.resetTokenFindUnique.mockResolvedValueOnce({ userId: "u1" });
    mocks.resetTokenUpdateMany.mockResolvedValueOnce({ count: 0 });

    expect(await consumePasswordResetToken("once", "h1")).toBe("u1");
    expect(await consumePasswordResetToken("once", "h2")).toBeNull();
  });
});

describe("requestPasswordResetAction", () => {
  beforeEach(() => {
    mocks.userFindUnique.mockReset();
    mocks.resetTokenCreate.mockReset();
    mocks.resetTokenUpdateMany.mockReset();
    mocks.sendEmail.mockReset();
    mocks.sendEmail.mockResolvedValue({ status: "sent" as const });
  });

  it("answers identically for an unknown email: generic message, no token, no email, no enumeration", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const res = await requestPasswordResetAction(undefined, requestForm("nobody@example.com"));

    expect(res?.message).toBe(GENERIC);
    expect(mocks.resetTokenCreate).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.password_reset_requested", userId: null }) })
    );
  });

  it("issues a hashed single-use token and emails the reset link for a registered account", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", email: "owner@example.com", passwordHash: "existing-hash" });
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });
    mocks.resetTokenCreate.mockImplementation(async ({ data }: { data: { tokenHash: string } }) => ({
      id: "t1",
      userId: "u1",
      ...data,
    }));

    const res = await requestPasswordResetAction(undefined, requestForm("OWNER@Example.com "));

    expect(res?.message).toBe(GENERIC);
    const raw = mocks.sendEmail.mock.calls[0]?.[0] as { to: string; resetUrl: string };
    expect(raw.to).toBe("owner@example.com");
    expect(raw.resetUrl).toContain("/reset-password?token=");
    const token = raw.resetUrl.split("token=")[1];
    expect(token).toBeTruthy();
    // Persisted hash, not the raw token; raw token only ever went to the email.
    const create = mocks.resetTokenCreate.mock.calls[0]?.[0] as { data: { tokenHash: string } };
    expect(create.data.tokenHash).toBe(hashResetToken(token));
    expect(mocks.resetTokenCreate.mock.calls[0]?.[0].data.tokenHash).not.toBe(token);
  });

  it("recovers legacy accounts that never set a password (passwordHash IS NULL)", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "legacy-1", email: "legacy@example.com", passwordHash: null });
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });
    mocks.resetTokenCreate.mockResolvedValue({ id: "t1" });

    const res = await requestPasswordResetAction(undefined, requestForm("legacy@example.com"));

    expect(res?.message).toBe(GENERIC);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const auditCall = mocks.auditLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { action: string } }).data.action === "auth.password_reset_requested"
    );
    const meta = JSON.parse((auditCall?.[0] as { data: { metadata: string } }).data.metadata);
    expect(meta.reason).toBe("created-nohash");
  });

  it("rate-limits reset requests (3 per email per 15 min) without revealing the limit or the outcome", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", email: "owner@example.com", passwordHash: "h" });
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });
    mocks.resetTokenCreate.mockResolvedValue({ id: "t1" });

    for (let i = 0; i < 3; i++) {
      const res = await requestPasswordResetAction(undefined, requestForm("owner@example.com"));
      expect(res?.message).toBe(GENERIC);
    }
    const blocked = await requestPasswordResetAction(undefined, requestForm("owner@example.com"));
    expect(blocked?.message).toBe(GENERIC);
    expect(mocks.resetTokenCreate).toHaveBeenCalledTimes(3);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
  });

  it("returns a field error for a malformed email and touches nothing", async () => {
    const res = await requestPasswordResetAction(undefined, requestForm("not-an-email"));
    expect(res?.errors?.email?.[0]).toBeDefined();
    expect(res?.message).toBeUndefined();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe("resetPasswordAction", () => {
  it("redeems the token: bcrypt-hashed new password, all sessions revoked, then redirects to login", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValueOnce({ count: 1 });
    mocks.resetTokenFindUnique.mockResolvedValueOnce({ userId: "u1" });
    mocks.userUpdate.mockResolvedValue({ id: "u1" });
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });

    const res = await resetPasswordAction(undefined, resetForm("raw-token", "brand-new-pass"));

    expect(res).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith("/login?reset=1");
    const update = mocks.userUpdate.mock.calls[0]?.[0] as { data: { passwordHash: string } };
    expect(update.data.passwordHash).not.toBe("brand-new-pass");
    await expect(bcrypt.compare("brand-new-pass", update.data.passwordHash)).resolves.toBe(true);
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.password_reset", userId: "u1" }) })
    );
  });

  it("rejects an invalid, expired, or already-used token with a single generic message", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });

    const res = await resetPasswordAction(undefined, resetForm("dead-token"));

    expect(res?.errors?._form?.[0]).toBe("This reset link is invalid or has expired.");
    expect(redirect).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("is rate-limited per IP (10/min) and says so separately from an invalid token", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });

    for (let i = 0; i < 10; i++) {
      const res = await resetPasswordAction(undefined, resetForm("dead-token"));
      expect(res?.errors?._form?.[0]).toBe("This reset link is invalid or has expired.");
    }
    const blocked = await resetPasswordAction(undefined, resetForm("dead-token"));
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many attempts/);
  });

  it("returns a password validation error and never redeems", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });
    const res = await resetPasswordAction(undefined, resetForm("tok", "short"));
    expect(res?.errors?.password?.[0]).toBeDefined();
    expect(mocks.resetTokenUpdateMany).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("never leaks a token or password hash from returned state", async () => {
    mocks.resetTokenUpdateMany.mockResolvedValue({ count: 0 });
    const res = await resetPasswordAction(undefined, resetForm("top-secret-token", "password123"));
    const dumped = JSON.stringify(res);
    expect(dumped).not.toMatch(/top-secret-token|password123|\$2[a-z]\$/);
  });
});