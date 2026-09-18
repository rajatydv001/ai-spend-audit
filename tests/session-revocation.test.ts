import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    session: {
      create: mocks.sessionCreate,
      findUnique: mocks.sessionFindUnique,
      updateMany: mocks.sessionUpdateMany,
    },
  },
}));

import {
  establishSession,
  revokeActiveSession,
  revokeAllUserSessions,
  isSessionActive,
  hashSessionToken,
} from "@/lib/services/session-service";
import { requireUserId, getSessionUser } from "@/lib/auth/dal";

const live = () => ({
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
});

const payload = (sid: string) => ({ userId: "user-1", sid, expiresAt: new Date() });

describe("session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockReset();
    mocks.sessionFindUnique.mockReset();
    mocks.sessionUpdateMany.mockReset();
  });

  describe("establishSession", () => {
    it("persists a hashed server-side record then signs the cookie with the raw sid", async () => {
      await establishSession("user-1");

      expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
      expect(mocks.createSession).toHaveBeenCalledTimes(1);
      const [userIdArg, sidArg] = mocks.createSession.mock.calls[0] as [string, string];

      expect(userIdArg).toBe("user-1");
      expect(typeof sidArg).toBe("string");
      expect(sidArg.length).toBeGreaterThanOrEqual(32);

      const persisted = mocks.sessionCreate.mock.calls[0]?.[0]?.data;
      expect(persisted?.userId).toBe("user-1");
      expect(persisted?.tokenHash).toBe(hashSessionToken(sidArg));
      // Never stored: the raw session id is not the hash.
      expect(persisted?.tokenHash).not.toBe(sidArg);
      expect(persisted?.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("hashSessionToken", () => {
    it("produces a stable 64-char hex digest that cannot be reversed to the sid", () => {
      const hash = hashSessionToken("some-raw-sid");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hashSessionToken("some-raw-sid")).toBe(hash);
      expect(hashSessionToken("some-other-sid")).not.toBe(hash);
    });
  });

  describe("isSessionActive", () => {
    it("returns true for a live, unrevoked, unexpired record", async () => {
      mocks.sessionFindUnique.mockResolvedValue(live());
      await expect(isSessionActive(payload("sid-live"))).resolves.toBe(true);
    });

    it("returns false when no server-side record exists (session never created / deleted)", async () => {
      mocks.sessionFindUnique.mockResolvedValue(null);
      await expect(isSessionActive(payload("sid-orphaned"))).resolves.toBe(false);
    });

    it("returns false when the record is revoked", async () => {
      mocks.sessionFindUnique.mockResolvedValue({ revokedAt: new Date(), expiresAt: live().expiresAt });
      await expect(isSessionActive(payload("sid-revoked"))).resolves.toBe(false);
    });

    it("returns false when the record has expired", async () => {
      mocks.sessionFindUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });
      await expect(isSessionActive(payload("sid-expired"))).resolves.toBe(false);
    });

    it("returns false for a payload without a sid", async () => {
      const noSid = { userId: "user-1", expiresAt: new Date() } as Parameters<typeof isSessionActive>[0];
      await expect(isSessionActive(noSid)).resolves.toBe(false);
    });

    it("returns false for a null/empty payload", async () => {
      await expect(isSessionActive(null)).resolves.toBe(false);
    });
  });

  describe("revokeActiveSession (logout)", () => {
    it("revokes the current session's record and clears the cookie", async () => {
      mocks.getSession.mockResolvedValue(payload("sid-current"));
      await revokeActiveSession();

      expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
        where: { tokenHash: hashSessionToken("sid-current"), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    });

    it("is a no-op on the DB when there is no session, but still clears the cookie", async () => {
      mocks.getSession.mockResolvedValue(null);
      await revokeActiveSession();
      expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
      expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    });

    it("prevents an old cookie from being replayed after logout", async () => {
      mocks.getSession.mockResolvedValue(payload("sid-old"));
      mocks.sessionFindUnique.mockResolvedValueOnce(live());

      await expect(isSessionActive(payload("sid-old"))).resolves.toBe(true);

      await revokeActiveSession();
      // Simulate the row now being marked revoked: the same cookie must be rejected.
      mocks.sessionFindUnique.mockResolvedValue({ revokedAt: new Date(), expiresAt: live().expiresAt });
      await expect(isSessionActive(payload("sid-old"))).resolves.toBe(false);
    });
  });

  describe("revokeAllUserSessions", () => {
    it("revokes every unrevoked session belonging to the user", async () => {
      await revokeAllUserSessions("user-7");
      expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
        where: { userId: "user-7", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe("protected-route integration (dal)", () => {
    it("requireUserId rejects with 401 when the session has been revoked server-side", async () => {
      mocks.getSession.mockResolvedValue(payload("sid-gone"));
      mocks.sessionFindUnique.mockResolvedValue({ revokedAt: new Date(), expiresAt: live().expiresAt });
      await expect(requireUserId()).rejects.toBeInstanceOf(ApiError);
      await expect(requireUserId()).rejects.toMatchObject({ statusCode: 401 });
    });

    it("getSessionUser resolves null when the session record no longer exists", async () => {
      mocks.getSession.mockResolvedValue(payload("sid-missing"));
      mocks.sessionFindUnique.mockResolvedValue(null);
      await expect(getSessionUser()).resolves.toBeNull();
    });

    it("requireUserId accepts a live session", async () => {
      mocks.getSession.mockResolvedValue(payload("sid-ok"));
      mocks.sessionFindUnique.mockResolvedValue(live());
      await expect(requireUserId()).resolves.toBe("user-1");
    });
  });
});