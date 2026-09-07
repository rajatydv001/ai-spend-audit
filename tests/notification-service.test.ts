import { describe, it, expect, vi, beforeEach } from "vitest";

const envMock = vi.hoisted(() => ({
  RESEND_API_KEY: undefined as string | undefined,
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
}));

const resendSend = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: envMock }));
vi.mock("resend", () => ({
  Resend: class {
    public emails = { send: resendSend };
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  getUnreadNotificationCount,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  sendWeeklyDigest,
  sendOptimizationReminder,
  saveNotificationPreference,
  sendInviteEmail,
} from "@/lib/services/notification-service";

const logCreate = prisma.notificationLog.create as ReturnType<typeof vi.fn>;
const logCount = prisma.notificationLog.count as ReturnType<typeof vi.fn>;
const logFindMany = prisma.notificationLog.findMany as ReturnType<typeof vi.fn>;
const logUpdateMany = prisma.notificationLog.updateMany as ReturnType<typeof vi.fn>;
const notifUpsert = prisma.notification.upsert as ReturnType<typeof vi.fn>;
const notifFindUnique = prisma.notification.findUnique as ReturnType<typeof vi.fn>;
const userFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => {
  [logCreate, logCount, logFindMany, logUpdateMany, notifUpsert, notifFindUnique, userFindUnique].forEach((m) =>
    m.mockReset()
  );
  envMock.RESEND_API_KEY = undefined;
  resendSend.mockReset();
});

describe("notification read/count queries", () => {
  it("counts unread notifications for a user", async () => {
    logCount.mockResolvedValue(3);
    await expect(getUnreadNotificationCount("user-1")).resolves.toBe(3);
    expect(logCount).toHaveBeenCalledWith({ where: { userId: "user-1", read: false } });
  });

  it("lists a user's notifications newest-first with a cap", async () => {
    logFindMany.mockResolvedValue([]);
    await getNotifications("user-1");
    expect(logFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" }, orderBy: { createdAt: "desc" }, take: 50 })
    );
  });

  it("marks a single notification read scoped to the user", async () => {
    await markNotificationRead("n1", "user-1");
    expect(logUpdateMany).toHaveBeenCalledWith({
      where: { id: "n1", userId: "user-1" },
      data: { read: true },
    });
  });

  it("marks all unread notifications read for a user", async () => {
    await markAllNotificationsRead("user-1");
    expect(logUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", read: false },
      data: { read: true },
    });
  });
});

describe("sendOptimizationReminder", () => {
  it("does not remind when the last audit is recent (< 30 days)", async () => {
    userFindUnique.mockResolvedValue({
      audits: [{ createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000) }],
      notifications: [],
    });
    await sendOptimizationReminder("user-1");
    expect(logCreate).not.toHaveBeenCalled();
  });

  it("creates a reminder when the last audit is old", async () => {
    userFindUnique.mockResolvedValue({
      audits: [{ createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000) }],
      notifications: [],
    });
    logCreate.mockResolvedValue({ id: "l1" });
    await sendOptimizationReminder("user-1");
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", type: "OPTIMIZATION_REMINDER" }),
      })
    );
  });

  it("creates a first-time reminder when there is no audit", async () => {
    userFindUnique.mockResolvedValue({ audits: [], notifications: [] });
    logCreate.mockResolvedValue({ id: "l1" });
    const result = await sendOptimizationReminder("user-1");
    expect(result).toBeTruthy();
  });
});

describe("sendWeeklyDigest", () => {
  it("creates a digest log with formatted spend/savings from the latest audit", async () => {
    userFindUnique.mockResolvedValue({
      audits: [{ totalSavings: 250, totalCurrentSpend: 1000 }],
      subscription: null,
      notifications: [],
    });
    logCreate.mockResolvedValue({ id: "d1" });
    await sendWeeklyDigest("user-1");
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "WEEKLY_DIGEST",
          title: "Weekly Savings Digest",
          message: expect.stringContaining("$1,000"),
        }),
      })
    );
  });
});

describe("saveNotificationPreference", () => {
  it("upserts keyed by userId + type", async () => {
    notifUpsert.mockResolvedValue({});
    await saveNotificationPreference("user-1", "WEEKLY_DIGEST", false);
    expect(notifUpsert).toHaveBeenCalledWith({
      where: { userId_type: { userId: "user-1", type: "WEEKLY_DIGEST" } },
      create: { userId: "user-1", type: "WEEKLY_DIGEST", enabled: false },
      update: { enabled: false },
    });
  });
});

describe("sendInviteEmail", () => {
  const args = {
    to: "a@b.com",
    inviteUrl: "http://localhost:3000/invite/raw-token-1",
    organizationName: "Acme",
    role: "ANALYST",
    senderName: "Sam",
  };

  it("returns not_configured and never claims delivery when the Resend key is missing", async () => {
    const result = await sendInviteEmail(args);
    expect(result.status).toBe("not_configured");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sends the invitation email when Resend is configured and reports sent", async () => {
    envMock.RESEND_API_KEY = "key";
    resendSend.mockResolvedValue({ id: "e1" });
    const result = await sendInviteEmail(args);
    expect(result.status).toBe("sent");
    expect(resendSend).toHaveBeenCalledTimes(1);
    const call = resendSend.mock.calls[0][0] as { from: string; to: string; subject: string; html: string };
    expect(call.to).toBe("a@b.com");
    expect(call.subject).toContain("Acme");
    expect(call.html).toContain("http://localhost:3000/invite/raw-token-1");
    expect(call.html).toContain("an Analyst");
  });

  it("reports delivery_failed (without throwing or faking success) when the provider errors", async () => {
    envMock.RESEND_API_KEY = "key";
    resendSend.mockRejectedValue(new Error("provider down"));
    const result = await sendInviteEmail(args);
    expect(result.status).toBe("delivery_failed");
  });
});
