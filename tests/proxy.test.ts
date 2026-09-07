import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ decrypt: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ decrypt: mocks.decrypt }));

import { proxy as proxyHandler } from "@/proxy";

function nextRequest(path: string, cookie?: string) {
  return new NextRequest(
    `http://localhost${path}`,
    cookie ? { headers: { cookie: `session=${cookie}` } } : undefined
  );
}

describe("proxy route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decrypt.mockResolvedValue(null);
  });

  it("redirects unauthenticated users away from protected /dashboard routes", async () => {
    const res = await proxyHandler(nextRequest("/dashboard"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location.endsWith("/login")).toBe(true);
  });

  it("redirects unauthenticated users from any nested dashboard route", async () => {
    const res = await proxyHandler(nextRequest("/dashboard/audits"));
    expect(res.status).toBe(307);
    expect((res.headers.get("location") ?? "").endsWith("/login")).toBe(true);
  });

  it("lets an authenticated protected route through", async () => {
    mocks.decrypt.mockResolvedValue({ userId: "u1", expiresAt: new Date() });
    const res = await proxyHandler(nextRequest("/dashboard", "valid-jwt"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("treats a malformed/forged token as unauthenticated", async () => {
    // decrypt() returns null for a bad signature / expired token.
    const res = await proxyHandler(nextRequest("/dashboard", "forged"));
    expect(res.status).toBe(307);
    expect((res.headers.get("location") ?? "").endsWith("/login")).toBe(true);
  });

  it("sends logged-in users away from auth pages", async () => {
    mocks.decrypt.mockResolvedValue({ userId: "u1", expiresAt: new Date() });
    for (const path of ["/login", "/signup"]) {
      const res = await proxyHandler(nextRequest(path, "valid-jwt"));
      expect(res.status).toBe(307);
      expect((res.headers.get("location") ?? "").endsWith("/dashboard")).toBe(true);
    }
  });

  it("leaves public pages open to unauthenticated visitors", async () => {
    for (const path of ["/", "/#features", "/login", "/signup"]) {
      const res = await proxyHandler(nextRequest(path));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });
});