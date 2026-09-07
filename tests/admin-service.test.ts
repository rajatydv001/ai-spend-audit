import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userCount: vi.fn(),
  orgCount: vi.fn(),
  auditCount: vi.fn(),
  auditFindMany: vi.fn(),
  auditLogFindMany: vi.fn(),
  subscriptionGroupBy: vi.fn(),
  billingHistoryFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { count: mocks.userCount, findMany: mocks.userFindMany },
    organization: { count: mocks.orgCount },
    audit: { count: mocks.auditCount, findMany: mocks.auditFindMany },
    auditLog: { findMany: mocks.auditLogFindMany },
    subscription: { groupBy: mocks.subscriptionGroupBy },
    billingHistory: { findMany: mocks.billingHistoryFindMany },
  },
}));

import {
  getAdminDashboardStats,
  getAuditVolumeAnalytics,
  getUserGrowthAnalytics,
  getAdminAuditLogs,
} from "@/lib/services/admin-service";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("getAdminDashboardStats", () => {
  it("aggregates counts, active subscriptions, MRR, and plan breakdown", async () => {
    mocks.userCount.mockResolvedValue(50);
    mocks.orgCount.mockResolvedValue(5);
    mocks.auditCount.mockResolvedValue(120);
    mocks.subscriptionGroupBy.mockResolvedValue([
      { plan: "PRO", status: "ACTIVE", _count: 2 },
      { plan: "PRO", status: "CANCELED", _count: 1 },
      { plan: "FREE", status: "TRIALING", _count: 3 },
    ]);
    mocks.auditFindMany.mockResolvedValue([]);
    mocks.billingHistoryFindMany.mockResolvedValue([
      { id: "b1", status: "paid", amount: 5000 },
      { id: "b2", status: "paid", amount: 2500 },
      { id: "b3", status: "unpaid", amount: 99999 },
    ]);

    const stats = await getAdminDashboardStats();

    expect(stats.totalUsers).toBe(50);
    expect(stats.totalOrganizations).toBe(5);
    expect(stats.totalAudits).toBe(120);
    expect(stats.activeSubscriptions).toBe(5);
    expect(stats.mrr).toBe(75);
    expect(stats.planBreakdown).toEqual({ PRO: 3, FREE: 3 });
    expect(stats.churnRate).toBe(2);
    expect(stats.recentPayments).toHaveLength(3);
    expect(stats.recentAudits).toEqual([]);
  });

  it("returns MRR 0 and churn 0 when there is no paid history", async () => {
    mocks.userCount.mockResolvedValue(10);
    mocks.orgCount.mockResolvedValue(0);
    mocks.auditCount.mockResolvedValue(0);
    mocks.subscriptionGroupBy.mockResolvedValue([]);
    mocks.auditFindMany.mockResolvedValue([]);
    mocks.billingHistoryFindMany.mockResolvedValue([]);

    const stats = await getAdminDashboardStats();
    expect(stats.mrr).toBe(0);
    expect(stats.activeSubscriptions).toBe(0);
    expect(stats.churnRate).toBe(0);
    expect(stats.planBreakdown).toEqual({});
  });
});

describe("getAuditVolumeAnalytics", () => {
  it("buckets audits by day across the window and fills empty days with 0", async () => {
    mocks.auditFindMany.mockResolvedValue([
      { createdAt: new Date() },
      { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    ]);

    const series = await getAuditVolumeAnalytics(7);
    expect(series).toHaveLength(7);
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    expect(series.find((p) => p.date === today)?.count).toBe(1);
    expect(series.find((p) => p.date === yesterday)?.count).toBe(1);
    expect(series.every((p) => p.count >= 0)).toBe(true);
    // Dates are ascending.
    const dates = series.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("getUserGrowthAnalytics", () => {
  it("counts new users per day in the window", async () => {
    mocks.userFindMany.mockResolvedValue([
      { createdAt: new Date() },
      { createdAt: new Date() },
    ]);

    const series = await getUserGrowthAnalytics(5);
    expect(series).toHaveLength(5);
    const today = new Date().toISOString().split("T")[0];
    expect(series.find((p) => p.date === today)?.count).toBe(2);
  });
});

describe("getAdminAuditLogs", () => {
  it("returns the most recent logs ordered by newest with user info", async () => {
    mocks.auditLogFindMany.mockResolvedValue([{ id: "log-1" }]);
    const logs = await getAdminAuditLogs(50);
    expect(logs).toEqual([{ id: "log-1" }]);
    expect(mocks.auditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { name: true, email: true } } },
      })
    );
  });
});