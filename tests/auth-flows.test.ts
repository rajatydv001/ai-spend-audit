import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

const ipState = { value: "203.0.113.100" };

vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-forwarded-for": ipState.value }),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  organizationCreate: vi.fn(),
  auditLogCreate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
      update: mocks.userUpdate,
    },
    organization: { create: mocks.organizationCreate },
    auditLog: { create: mocks.auditLogCreate },
  },
}));

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";
import { clearRateLimits } from "@/lib/services/rate-limit";
import {
  signupAction,
  loginAction,
  logoutAction,
} from "@/lib/auth/actions";
import { requireUserId, getSessionUser } from "@/lib/auth/dal";

const signupForm = (over: Partial<{ name: string; email: string; password: string; next: string }> = {}) => {
  const form = new FormData();
  form.set("name", over.name ?? "Jane Doe");
  form.set("email", over.email ?? "jane@example.com");
  form.set("password", over.password ?? "password123");
  if (over.next !== undefined) form.set("next", over.next);
  return form;
};

const loginForm = (over: Partial<{ email: string; password: string; next: string }> = {}) => {
  const form = new FormData();
  form.set("email", over.email ?? "jane@example.com");
  form.set("password", over.password ?? "password123");
  if (over.next !== undefined) form.set("next", over.next);
  return form;
};

describe("signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
    ipState.value = "203.0.113.100";
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: "u1" });
  });

  it("creates a user with normalized email, bcrypt hash, a personal workspace it owns, and starts a session", async () => {
    mocks.organizationCreate.mockResolvedValue({ id: "org-1" });
    mocks.userUpdate.mockResolvedValue({});

    const res = await signupAction(
      undefined,
      signupForm({ email: "  JANE@Example.COM " })
    );

    expect(res).toBeUndefined(); // redirect() called
    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.createSession).toHaveBeenCalledWith("u1");

    const data = mocks.userCreate.mock.calls[0][0].data;
    expect(data.email).toBe("jane@example.com");
    expect(data.name).toBe("Jane Doe");
    // Least-privilege default at creation...
    expect(data.role).toBe("ANALYST");
    expect(data.role).not.toBe("ADMIN");
    // ...so the initial create carries no organization yet.
    expect(data.organizationId).toBeUndefined();
    expect(data.onboarded).toBeUndefined();

    // Password is stored as a bcrypt hash, never plaintext, never under a
    // "password" key.
    expect(data.passwordHash).toBeDefined();
    expect(data.passwordHash).not.toBe("password123");
    expect(data).not.toHaveProperty("password");
    await expect(bcrypt.compare("password123", data.passwordHash)).resolves.toBe(true);

    // A brand-new account automatically gets a personal workspace it ADMINs so
    // the first-time journey (signup → dashboard → audit) has no dead end.
    expect(mocks.organizationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Jane Doe Workspace" }) })
    );
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ organizationId: "org-1", role: "ADMIN" }),
      })
    );

    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "user.created", entityId: "u1" }) })
    );
  });

  it("rejects a duplicate email without creating a user or session, and without leaking the reason", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "existing" });

    const res = await signupAction(undefined, signupForm());

    expect(res?.errors?._form?.[0]).toMatch(/couldn't create/i);
    // Must not echo "already exists" or confirm the account.
    expect(JSON.stringify(res)).not.toMatch(/already exists|registered/i);
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.signup_duplicate" }) })
    );
  });

  it("returns field validation errors for malformed input without touching the database", async () => {
    const res = await signupAction(
      undefined,
      signupForm({ name: "a", email: "not-an-email", password: "short" })
    );

    expect(res?.errors?.email?.[0]).toBeDefined();
    expect(res?.errors?.name?.[0]).toBeDefined();
    expect(res?.errors?.password?.[0]).toBeDefined();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("handles a concurrent same-email signup (unique-constraint race) as a generic failure", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    const res = await signupAction(undefined, signupForm());
    expect(res?.errors?._form?.[0]).toMatch(/couldn't create/i);
    expect(mocks.auditLogCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "user.created" }) })
    );
  });
});

describe("login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
    ipState.value = "203.0.113.100";
    mocks.userFindUnique.mockResolvedValue(null);
  });

  it("verifies the bcrypt password and creates a session on success", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      email: "jane@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
    });

    const res = await loginAction(undefined, loginForm());

    expect(res).toBeUndefined();
    expect(mocks.createSession).toHaveBeenCalledWith("u1");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "user.login" }) })
    );
  });

  it("rejects a wrong password without creating a session", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      email: "jane@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
    });

    const res = await loginAction(undefined, loginForm({ password: "wrongpass" }));

    expect(res?.errors?._form?.[0]).toBe("Invalid email or password");
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.login_failed" }) })
    );
  });

  it("redirects to a safe `next` path after login so invited users return to their invitation", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      email: "jane@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
    });

    await loginAction(undefined, loginForm({ next: "/invite/tok-abc" }));

    expect(mocks.createSession).toHaveBeenCalledWith("u1");
    expect(redirect).toHaveBeenCalledWith("/invite/tok-abc");
  });

  it("ignores an unsafe `next` (external URL) and lands on the dashboard — no open redirect", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      email: "jane@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
    });

    for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example", "/not ok"]) {
      mocks.createSession.mockClear();
      redirect.mockClear();
      await loginAction(undefined, loginForm({ next: evil }));
      expect(redirect).toHaveBeenCalledWith("/dashboard");
    }
  });

  it("signup also preserves a safe `next` path (e.g. joining an invitation)", async () => {
    mocks.userCreate.mockResolvedValue({ id: "u1" });
    mocks.organizationCreate.mockResolvedValue({ id: "org-1" });
    mocks.userUpdate.mockResolvedValue({});

    await signupAction(undefined, signupForm({ next: "/invite/tok-xyz" }));

    expect(redirect).toHaveBeenCalledWith("/invite/tok-xyz");
  });

  it("uses the same message for an unknown email as for a wrong password (no enumeration)", async () => {
    const unknown = await loginAction(undefined, loginForm({ email: "ghost@example.com" }));

    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      email: "jane@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
    });
    const wrongPw = await loginAction(undefined, loginForm({ password: "wrongpass" }));

    expect(unknown?.errors?._form?.[0]).toBe("Invalid email or password");
    expect(wrongPw?.errors?._form?.[0]).toBe(unknown?.errors?._form?.[0]);
  });

  it("never leaks password material from any returned form state", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", email: "x", passwordHash: "hashed" });
    const res = await loginAction(undefined, loginForm({ password: "password123" }));
    expect(JSON.stringify(res)).not.toMatch(/password123|passwordHash|hashed/);

    const signupRes = await signupAction(undefined, signupForm());
    expect(JSON.stringify(signupRes)).not.toMatch(/password123|password|Hash/);
  });
});

describe("logout", () => {
  it("deletes the session cookie and redirects to /login", async () => {
    await logoutAction();
    expect(mocks.deleteSession).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

describe("session / user identity resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReset();
  });

  it("requireUserId resolves the authenticated user id from the session", async () => {
    mocks.getSession.mockResolvedValue({ userId: "user-1", expiresAt: new Date() });
    await expect(requireUserId()).resolves.toBe("user-1");
  });

  it("requireUserId rejects with 401 when there is no session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireUserId()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("getSessionUser returns null without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("rejects with a centralized ApiError so routes map it consistently", async () => {
    mocks.getSession.mockResolvedValue(null);
    try {
      await requireUserId();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(401);
    }
  });
});

describe("password hashing", () => {
  it("stores a salted hash that verifies only with the correct password", async () => {
    const hash = await bcrypt.hash("s3cret-pass", 10);
    expect(hash).not.toContain("s3cret-pass");
    await expect(bcrypt.compare("s3cret-pass", hash)).resolves.toBe(true);
    await expect(bcrypt.compare("wrong-pass", hash)).resolves.toBe(false);
    // Cost factor is honored (bcrypt format "2b$10$...").
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash.split("$")[2]?.startsWith("10")).toBe(true);
  });
});