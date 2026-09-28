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
  sessionCreate: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdateMany: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
}));

// Transactional client used by the default $transaction implementation. It
// delegates to the same flat model mocks so existing assertions still observe
// every call, while letting the atomicity suite override individual models.
const defaultTx = {
  user: {
    create: mocks.userCreate,
    findUnique: mocks.userFindUnique,
    update: mocks.userUpdate,
  },
  organization: { create: mocks.organizationCreate },
  auditLog: { create: mocks.auditLogCreate },
  session: { create: mocks.sessionCreate },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
      update: mocks.userUpdate,
    },
    organization: { create: mocks.organizationCreate },
    auditLog: { create: mocks.auditLogCreate },
    session: {
      create: mocks.sessionCreate,
      findUnique: mocks.sessionFindUnique,
      updateMany: mocks.sessionUpdateMany,
    },
    $transaction: mocks.$transaction,
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

// Signup now commits inside a single transaction. Every describe gets a working
// $transaction passthrough by default; the atomicity suite overrides it with a
// real commit/rollback store.
beforeEach(() => {
  mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(defaultTx)
  );
});

describe("signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
    ipState.value = "203.0.113.100";
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: "u1" });
    // Signup now runs inside one transaction; pass the shared proxy straight
    // through so the flat mocks above still record every call.
    mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(defaultTx)
    );
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
    expect(mocks.createSession).toHaveBeenCalledWith("u1", expect.any(String));
    // A server-side session record is persisted alongside the signed cookie so
    // the session can be validated and revoked. Only a one-way hash is stored.
    expect(mocks.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      })
    );

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
      expect.objectContaining({ data: expect.objectContaining({ action: "user.created", entityId: "u1", userId: "u1" }) })
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
    expect(mocks.organizationCreate).not.toHaveBeenCalled();
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
    // The anonymized audit event must persist (createAuditLog normalizes the
    // "anonymous" sentinel to a NULL actor so the FK never rejects it).
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.signup_duplicate", userId: null }) })
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
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["email"] },
      })
    );

    const res = await signupAction(undefined, signupForm());
    expect(res?.errors?._form?.[0]).toMatch(/couldn't create/i);
    expect(mocks.auditLogCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "user.created" }) })
    );
  });

  it("does not report a non-email unique collision as a duplicate account", async () => {
    // A P2002 on some other target (e.g. a workspace slug) is a transient
    // internal fault, not "this email is taken". Mislabelling it would send the
    // user down the wrong path and mask the real fault.
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["Organization_slug_key"] },
      })
    );

    await expect(signupAction(undefined, signupForm())).rejects.toThrow();
  });
});

/**
 * Regression: signup must be ALL-OR-NOTHING.
 *
 * The user row used to be committed BEFORE the workspace, audit log and session
 * were created. Any failure in those later steps left an orphaned user with no
 * organization — and because the email was then already taken, every retry hit
 * the duplicate branch and showed the generic "We couldn't create your account"
 * message forever. The user was permanently locked out of an account that
 * looked like it had never been created, with an error that named the wrong
 * cause.
 *
 * These tests drive a real in-memory commit/rollback store so the invariant
 * (no half-created account survives a failure) is asserted, not just mocked.
 */
describe("signup atomicity", () => {
  // Minimal committed-state store: mutations land here only when called on the
  // transactional client, and $transaction truncates the store back to its
  // entry snapshot if the callback throws.
  let store: Array<{ id: string; email: string }>;
  let seq: number;

  const txUserCreate = async ({ data }: { data: { id?: string; email: string } }) => {
    if (store.some((u) => u.email === data.email)) {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }
    const row = { id: data.id ?? `u${++seq}`, email: data.email };
    store.push(row);
    return { id: row.id };
  };

  const txUserFindUnique = async ({ where }: { where: { email: string } }) =>
    store.find((u) => u.email === where.email) ?? null;

  const txClient = {
    user: { create: txUserCreate, findUnique: txUserFindUnique, update: vi.fn(async () => ({})) },
    organization: { create: vi.fn<[], Promise<{ id: string }>>(async () => ({ id: "org-1" })) },
    auditLog: { create: vi.fn<[], Promise<unknown>>(async () => ({})) },
    session: { create: vi.fn<[], Promise<unknown>>(async () => ({})) },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
    ipState.value = "203.0.113.99";
    store = [];
    seq = 0;

    mocks.userCreate.mockImplementation(txUserCreate as never);
    mocks.userFindUnique.mockImplementation(txUserFindUnique as never);
    mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = [...store];
      try {
        return await fn(txClient);
      } catch (error) {
        store = snapshot; // rollback
        throw error;
      }
    });
  });

  it("rolls the user row back when workspace creation fails, so a retry can still sign up", async () => {
    mocks.organizationCreate.mockRejectedValue(new Error("organization insert failed"));
    // The transactional client shares the same mocked organization model, so
    // route the failure through it too.
    txClient.organization.create = mocks.organizationCreate;

    await expect(signupAction(undefined, signupForm())).rejects.toThrow(/organization insert failed/);

    // The critical invariant: nothing half-created is left behind.
    expect(store, "a failed signup must not leave a committed user row").toEqual([]);
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();

    // The user's real experience: the retry must succeed instead of being told
    // "we couldn't create your account" forever.
    txClient.organization.create = vi.fn(async () => ({ id: "org-1" }));
    mocks.organizationCreate.mockImplementation(txClient.organization.create as never);
    const res = await signupAction(undefined, signupForm());

    expect(res).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(store).toHaveLength(1);
    // The retry issues a session for the account it just created.
    expect(mocks.createSession).toHaveBeenCalledWith(store[0].id, expect.any(String));
  });

  it("rolls back when the session record cannot be persisted", async () => {
    txClient.organization.create = vi.fn(async () => ({ id: "org-1" }));
    mocks.organizationCreate.mockImplementation(txClient.organization.create as never);
    txClient.session.create = vi.fn<[], Promise<unknown>>(async () => {
      throw new Error("session insert failed");
    });

    await expect(signupAction(undefined, signupForm())).rejects.toThrow(/session insert failed/);
    expect(store, "a failed signup must not leave a committed user row").toEqual([]);
    // The cookie must never be set for a session that was rolled back.
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("commits the workspace and session row before the cookie is set", async () => {
    txClient.organization.create = vi.fn<[], Promise<{ id: string }>>(async () => ({ id: "org-1" }));
    txClient.session.create = vi.fn<[], Promise<unknown>>(async () => undefined);

    await signupAction(undefined, signupForm());

    // Database state is durable: the session row is written through the
    // transactional client...
    expect(txClient.session.create).toHaveBeenCalledTimes(1);
    expect(store).toHaveLength(1);
    // ...and the cookie is set only afterwards, outside the transaction, so a
    // rollback can never leave a live cookie pointing at a missing account.
    const txFinished = mocks.$transaction.mock.invocationCallOrder[0];
    const cookieSet = mocks.createSession.mock.invocationCallOrder[0];
    expect(cookieSet).toBeGreaterThan(txFinished);
    expect(mocks.createSession).toHaveBeenCalledWith(store[0].id, expect.any(String));
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
    expect(mocks.createSession).toHaveBeenCalledWith("u1", expect.any(String));
    expect(mocks.sessionCreate).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "user.login", userId: "u1" }) })
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
    // The wrong-password branch knows the actor's real id, so the audit row
    // keeps it (audit attribution for a known account).
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.login_failed", userId: "u1" }) })
    );
  });

  it("redirects to a safe `next` path after login so invited users return to their invitation", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "u1",
      email: "jane@example.com",
      passwordHash: await bcrypt.hash("password123", 10),
    });

    await loginAction(undefined, loginForm({ next: "/invite/tok-abc" }));

    expect(mocks.createSession).toHaveBeenCalledWith("u1", expect.any(String));
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
      vi.mocked(redirect).mockClear();
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
    // Unknown email is an anonymous event: it must still persist, with a NULL
    // actor (no phantom FK), so the audit trail survives without identifying
    // the email as unknown.
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "auth.login_failed", userId: null }) })
    );
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
    mocks.sessionFindUnique.mockReset();
  });

  it("requireUserId resolves the authenticated user id from a live, unrevoked session", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.getSession.mockResolvedValue({ userId: "user-1", sid: "sid-1", expiresAt: new Date() });
    await expect(requireUserId()).resolves.toBe("user-1");
  });

  it("requireUserId rejects with 401 when there is no session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireUserId()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("requireUserId rejects a revoked session even though the JWT is still valid", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.getSession.mockResolvedValue({ userId: "user-1", sid: "sid-revoked", expiresAt: new Date() });
    await expect(requireUserId()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("requireUserId rejects a session whose server-side record has expired", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
    });
    mocks.getSession.mockResolvedValue({ userId: "user-1", sid: "sid-expired", expiresAt: new Date() });
    await expect(requireUserId()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("getSessionUser returns null without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("getSessionUser returns null when the session has been revoked", async () => {
    mocks.sessionFindUnique.mockResolvedValue({ revokedAt: new Date(), expiresAt: new Date() });
    mocks.getSession.mockResolvedValue({ userId: "user-1", sid: "sid-gone", expiresAt: new Date() });
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("getSessionUser resolves when the session is live", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1", email: "jane@example.com" });
    mocks.getSession.mockResolvedValue({ userId: "user-1", sid: "sid-live", expiresAt: new Date() });
    await expect(getSessionUser()).resolves.toMatchObject({ email: "jane@example.com" });
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