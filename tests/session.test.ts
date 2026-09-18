import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { encrypt, decrypt } from "@/lib/auth/session";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "TEST_SESSION_SECRET_0123456789_0123456789_0123456789"
);

describe("session encrypt/decrypt", () => {
  const payload = (overrides: Partial<{ userId: string; sid: string }> = {}) => ({
    userId: "user-1",
    sid: "sid-1",
    expiresAt: new Date(Date.now() + 100000),
    ...overrides,
  });

  it("round-trips a valid session payload", async () => {
    const token = await encrypt(payload());
    expect(token).toBeTruthy();
    const decoded = await decrypt(token);
    expect(decoded?.userId).toBe("user-1");
    expect(decoded?.sid).toBe("sid-1");
  });

  it("returns null for empty/undefined session", async () => {
    expect(await decrypt("")).toBeNull();
    expect(await decrypt(undefined)).toBeNull();
    expect(await decrypt(null as unknown as string)).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    expect(await decrypt("not-a-jwt")).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const other = new SignJWT({ userId: "user-2", sid: "sid-2" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(new Date(Date.now() + 100000))
      .sign(new TextEncoder().encode("a-completely-different-secret-key-0123456789"));
    const token = await other;
    expect(await decrypt(token)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await encrypt({ ...payload(), expiresAt: new Date(Date.now() - 5000) });
    const decoded = await decrypt(token);
    expect(decoded).toBeNull();
  });

  it("returns null when payload lacks a string userId", async () => {
    const token = await new SignJWT({ userId: 123, sid: "sid-3" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(new Date(Date.now() + 100000))
      .sign(SECRET);
    expect(await decrypt(token)).toBeNull();
  });

  it("rejects a token signed by this app but WITHOUT a session id (pre-association legacy format)", async () => {
    const legacy = await new SignJWT({ userId: "user-old" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(new Date(Date.now() + 100000))
      .sign(SECRET);
    expect(await decrypt(legacy)).toBeNull();
  });
});
