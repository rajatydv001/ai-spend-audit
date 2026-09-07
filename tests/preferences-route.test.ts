import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/services/audit-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/audit-service")>();
  return {
    ...actual,
    getUserPreferences: mocks.getUserPreferences,
    updateUserPreferences: mocks.updateUserPreferences,
  };
});

import { GET, PUT } from "@/app/api/user/preferences/route";
const ctx = { params: Promise.resolve({}) };

const fakePrefs = { currency: "USD", teamSize: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("u1");
  mocks.getUserPreferences.mockResolvedValue(fakePrefs);
  mocks.updateUserPreferences.mockResolvedValue({ ...fakePrefs, currency: "EUR" });
});

describe("GET /api/user/preferences", () => {
  it("returns the signed-in user's preferences", async () => {
    const res = await GET(new Request("http://localhost/api/user/preferences"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakePrefs);
    expect(mocks.getUserPreferences).toHaveBeenCalledWith("u1");
  });
});

describe("PUT /api/user/preferences", () => {
  it("updates and returns preferences", async () => {
    const res = await PUT(
      new Request("http://localhost/api/user/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currency: "EUR" }),
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(mocks.updateUserPreferences).toHaveBeenCalledWith("u1", { currency: "EUR" });
    expect(await res.json()).toEqual({ currency: "EUR", teamSize: 10 });
  });

  it("rejects invalid currency codes with 400", async () => {
    const res = await PUT(
      new Request("http://localhost/api/user/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currency: "not-a-code" }),
      }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(mocks.updateUserPreferences).not.toHaveBeenCalled();
  });

  it("returns 200 for an empty partial body (all fields optional)", async () => {
    const res = await PUT(
      new Request("http://localhost/api/user/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(mocks.updateUserPreferences).toHaveBeenCalledWith("u1", {});
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await GET(new Request("http://localhost/api/user/preferences"), ctx);
    expect(res.status).toBe(401);
  });
});