import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  getAdminDashboardStats: vi.fn(),
  getAuditVolumeAnalytics: vi.fn(),
  getUserGrowthAnalytics: vi.fn(),
  getAdminAuditLogs: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock("@/lib/services/admin-service", () => ({
  getAdminDashboardStats: mocks.getAdminDashboardStats,
  getAuditVolumeAnalytics: mocks.getAuditVolumeAnalytics,
  getUserGrowthAnalytics: mocks.getUserGrowthAnalytics,
  getAdminAuditLogs: mocks.getAdminAuditLogs,
}));

import { ApiError } from "@/lib/errors";
import { GET } from "@/app/api/admin/stats/route";

const get = (type?: string) =>
  GET(
    new Request(
      `http://localhost/api/admin/stats${type ? `?type=${type}` : ""}`,
      { method: "GET" }
    ),
    { params: Promise.resolve({}) }
  );

describe("GET /api/admin/stats — platform-admin gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.requirePlatformAdmin.mockResolvedValue({
      id: "u1",
      isPlatformAdmin: true,
    });
    mocks.getAdminDashboardStats.mockResolvedValue({ totalUsers: 1 });
    mocks.getAuditVolumeAnalytics.mockResolvedValue([]);
    mocks.getUserGrowthAnalytics.mockResolvedValue([]);
    mocks.getAdminAuditLogs.mockResolvedValue([]);
  });

  it("requires authentication", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await get();
    expect(res.status).toBe(401);
  });

  it("rejects an org ADMIN who is not a platform admin (403)", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new ApiError("Forbidden", 403));
    const res = await get();
    expect(res.status).toBe(403);
    expect(mocks.getAdminDashboardStats).not.toHaveBeenCalled();
  });

  it("serves the overview to a platform admin", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalUsers: 1 });
  });

  it("serves the full 'all' payload to a platform admin", async () => {
    const res = await get("all");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("overview");
    expect(body).toHaveProperty("auditVolume");
    expect(body).toHaveProperty("userGrowth");
    expect(body).toHaveProperty("auditLogs");
  });

  it("rejects an unknown type with 400", async () => {
    const res = await get("bogus");
    expect(res.status).toBe(400);
  });
});