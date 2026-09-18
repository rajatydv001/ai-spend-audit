import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

const ipState = { value: "203.0.113.200" };

vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-forwarded-for": ipState.value }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  sessionCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    auditLog: { create: mocks.auditLogCreate },
    session: { create: mocks.sessionCreate },
  },
}));

import { loginAction, signupAction } from "@/lib/auth/actions";
import { clearRateLimits } from "@/lib/services/rate-limit";

const loginForm = (email: string, password = "password123") => {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
};

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

async function attemptWrongLogin(email: string): Promise<void> {
  const res = await loginAction(undefined, loginForm(email, "wrong-password"));
  expect(res?.errors?._form?.[0]).toBe("Invalid email or password");
}

describe("auth rate limiting dimensions", () => {
  let passwordHash: string;

  beforeEach(async () => {
    clearRateLimits();
    ipState.value = "203.0.113.200";
    vi.clearAllMocks();
    passwordHash = await hashPassword("password123");
    mocks.userFindUnique.mockImplementation(({ where }: { where: { email: string } }) =>
      where.email.toLowerCase() === "account-a@example.com"
        ? { id: "u-account", email: "account-a@example.com", passwordHash }
        : null
    );
  });

  it("login limit is per-account: hammering one account cannot be escaped by switching IPs", async () => {
    for (let i = 0; i < 10; i++) {
      await attemptWrongLogin("account-a@example.com");
    }
    // Switching IP does not reset the account's own bucket.
    ipState.value = "198.51.100.99";
    const blocked = await loginAction(undefined, loginForm("account-a@example.com"));
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many login/);
  });

  it("login limit does NOT create one global bucket: a different account still works", async () => {
    for (let i = 0; i < 10; i++) {
      await attemptWrongLogin("account-a@example.com");
    }
    const other = await loginAction(undefined, loginForm("account-b@example.com", "password123"));
    expect(other?.errors?._form?.[0]).toBe("Invalid email or password");
    expect(JSON.stringify(other)).not.toMatch(/Too many login/);
  });

  it("login limit is per-IP for spraying: many distinct accounts from one IP are capped", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await loginAction(undefined, loginForm(`spray-${i}@example.com`, "wrong-password"));
      expect(res?.errors?._form?.[0]).toBe("Invalid email or password");
      expect(JSON.stringify(res)).not.toMatch(/Too many login/);
    }
    const blocked = await loginAction(
      undefined,
      loginForm("spray-final@example.com", "wrong-password")
    );
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many login/);
  });

  it("a successful login does not bypass or reset the protection", async () => {
    for (let i = 0; i < 9; i++) {
      await attemptWrongLogin("account-a@example.com");
    }
    // 10th attempt: correct password. Must succeed (count hits the limit, not past it).
    const ok = await loginAction(undefined, loginForm("account-a@example.com", "password123"));
    expect(ok).toBeUndefined();
    expect(mocks.sessionCreate).toHaveBeenCalled();
    // 11th attempt is now over the per-account budget despite the success.
    const blocked = await loginAction(undefined, loginForm("account-a@example.com", "password123"));
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many login/);
  });

  it("email key is normalized before hashing: casing does not create a separate bucket", async () => {
    for (let i = 0; i < 10; i++) {
      await attemptWrongLogin("ACCOUNT-A@EXAMPLE.COM");
    }
    const blocked = await loginAction(undefined, loginForm("account-a@example.com", "whatever"));
    expect(blocked?.errors?._form?.[0]).toMatch(/Too many login/);
  });

  it("signup keeps its per-IP isolation (no shared 'anonymous' bucket in tests)", async () => {
    const empty = () => new FormData();
    for (let i = 0; i < 5; i++) {
      await signupAction(undefined, empty());
    }
    expect((await signupAction(undefined, empty()))?.errors?._form?.[0]).toMatch(/Too many signup/);
    ipState.value = "198.51.100.77";
    expect((await signupAction(undefined, empty()))?.errors?._form).toBeUndefined();
  });
});