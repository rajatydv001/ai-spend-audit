import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
// Only Prisma is mocked here: the REAL markNotificationRead(id, userId) runs
// behind the route, so the test proves the HTTP path issues a user-scoped write.
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationLog: { updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

import { PATCH } from "@/app/api/notifications/[id]/route";
import { prisma } from "@/lib/db";

const updateMany = prisma.notificationLog.updateMany as ReturnType<typeof vi.fn>;

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockReset();
  updateMany.mockReset();
});

describe("PATCH /api/notifications/[id] — HTTP-level authorization (IDOR)", () => {
  it("owner can mark their own notification read", async () => {
    mocks.requireUserId.mockResolvedValue("user-A");
    updateMany.mockResolvedValue({ count: 1 });

    const res = await PATCH(new Request("http://localhost/api/notifications/n1", { method: "PATCH" }), ctxFor("n1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // The write is scoped to BOTH the notification id AND the authenticated user.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "n1", userId: "user-A" },
      data: { read: true },
    });
  });

  it("User B's request to mark User A's notification read is scoped to B — it can never touch A's row", async () => {
    mocks.requireUserId.mockResolvedValue("user-B");

    const res = await PATCH(new Request("http://localhost/api/notifications/n-of-A", { method: "PATCH" }), ctxFor("n-of-A"));
    expect(res.status).toBe(200);
    const where = updateMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({ id: "n-of-A", userId: "user-B" });
    expect(where?.userId).not.toBe("user-A");
  });

  it("returns 401 for an unauthenticated request without touching any row", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await PATCH(new Request("http://localhost/api/notifications/n1", { method: "PATCH" }), ctxFor("n1"));
    expect(res.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });
});