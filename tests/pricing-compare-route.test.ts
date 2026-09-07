import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({ requireRole: mocks.requireRole }));

import { ApiError } from "@/lib/errors";
import * as rateLimitModule from "@/lib/services/rate-limit";
import { POST } from "@/app/api/pricing/compare/route";

describe("pricing/compare authorization", () => {
  let limiterSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitModule.clearRateLimits();
    mocks.requireUserId.mockResolvedValue("user-1");
    mocks.requireRole.mockResolvedValue(undefined);
    limiterSpy = vi.spyOn(rateLimitModule, "rateLimitOrThrow");
  });

  afterEach(() => {
    rateLimitModule.clearRateLimits();
    limiterSpy.mockRestore();
  });

  const req = (body: unknown) =>
    new Request("http://localhost/api/pricing/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("returns 401 for unauthenticated callers before any rate limiting", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await POST(req({ action: "compare", tool: "ChatGPT", plan: "Plus", users: 10 }));
    expect(res.status).toBe(401);
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(limiterSpy).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in user without a pricing role", async () => {
    mocks.requireRole.mockRejectedValue(new ApiError("Forbidden", 403));
    const res = await POST(req({ action: "compare", tool: "ChatGPT", plan: "Plus", users: 10 }));
    expect(res.status).toBe(403);
  });

  it("serves an authorized comparison", async () => {
    const res = await POST(req({ action: "compare", tool: "ChatGPT", plan: "Plus", users: 10 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("current");
    expect(body).toHaveProperty("alternatives");
    expect(Array.isArray(body.alternatives)).toBe(true);
  });

  it("rate-limits per userId (60/min) after the role check", async () => {
    for (let i = 0; i < 60; i++) {
      const res = await POST(req({ action: "compare", tool: "ChatGPT", plan: "Plus", users: 10 }));
      expect(res.status).toBe(200);
    }
    const blocked = await POST(req({ action: "compare", tool: "ChatGPT", plan: "Plus", users: 10 }));
    expect(blocked.status).toBe(429);
  });

  it("enforces the limit by user, so another user is not blocked", async () => {
    for (let i = 0; i < 60; i++) {
      await POST(req({ action: "compare", tool: "ChatGPT", plan: "Plus", users: 10 }));
    }
    mocks.requireUserId.mockResolvedValue("user-2");
    const res = await POST(req({ action: "compare", tool: "ChatGPT", plan: "Plus", users: 10 }));
    expect(res.status).toBe(200);
  });

  it("rejects an invalid payload for an authenticated user", async () => {
    const res = await POST(req({ action: "compare", tool: "ChatGPT", plan: "Plus", users: -1 }));
    expect(res.status).toBe(400);
  });
});