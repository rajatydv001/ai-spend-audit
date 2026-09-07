import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreference: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/services/notification-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/notification-service")>();
  return {
    ...actual,
    getNotifications: mocks.getNotifications,
    getUnreadNotificationCount: mocks.getUnreadNotificationCount,
    getNotificationPreferences: mocks.getNotificationPreferences,
    saveNotificationPreference: mocks.saveNotificationPreference,
    markAllNotificationsRead: mocks.markAllNotificationsRead,
  };
});

import { GET, PUT, PATCH } from "@/app/api/notifications/route";
const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("u1");
  mocks.getNotifications.mockResolvedValue([]);
  mocks.getUnreadNotificationCount.mockResolvedValue(0);
  mocks.getNotificationPreferences.mockResolvedValue({ aiInsights: true });
  mocks.saveNotificationPreference.mockResolvedValue({ aiInsights: false });
  mocks.markAllNotificationsRead.mockResolvedValue(undefined);
});

describe("GET /api/notifications", () => {
  it("returns notifications, unread count, and preferences together", async () => {
    mocks.getNotifications.mockResolvedValue([{ id: "n1" }]);
    mocks.getUnreadNotificationCount.mockResolvedValue(3);
    const res = await GET(new Request("http://localhost/api/notifications"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      notifications: [{ id: "n1" }],
      unreadCount: 3,
      preferences: { aiInsights: true },
    });
  });

  it("clamps an oversized take to 100 and a 0 take back to the default", async () => {
    await GET(new Request("http://localhost/api/notifications?take=99999"), ctx);
    expect(mocks.getNotifications).toHaveBeenCalledWith("u1", 100, undefined);
    await GET(new Request("http://localhost/api/notifications?take=0"), ctx);
    expect(mocks.getNotifications).toHaveBeenLastCalledWith("u1", 50, undefined);
  });
});

describe("PUT /api/notifications", () => {
  it("saves a notification preference", async () => {
    const res = await PUT(
      new Request("http://localhost/api/notifications", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "WEEKLY_DIGEST", enabled: false }),
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(mocks.saveNotificationPreference).toHaveBeenCalledWith("u1", "WEEKLY_DIGEST", false);
  });

  it("rejects invalid types with 400", async () => {
    const res = await PUT(
      new Request("http://localhost/api/notifications", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "nope", enabled: true }),
      }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(mocks.saveNotificationPreference).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/notifications", () => {
  it("marks all notifications read", async () => {
    const res = await PATCH(new Request("http://localhost/api/notifications"), ctx);
    expect(res.status).toBe(200);
    expect(mocks.markAllNotificationsRead).toHaveBeenCalledWith("u1");
  });
});

describe("auth gating", () => {
  it("returns 401 before any work when unauthenticated", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await GET(new Request("http://localhost/api/notifications"), ctx);
    expect(res.status).toBe(401);
    expect(mocks.getNotifications).not.toHaveBeenCalled();
  });
});