import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    audit: { findMany: vi.fn(), groupBy: vi.fn() },
    department: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import {
  getSpendingTrends,
  getDepartmentAnalytics,
  getToolAdoptionAnalytics,
  getAIUtilizationScore,
  getProjectedFutureSpend,
} from "@/lib/services/analytics-service";

const findManyAudit = prisma.audit.findMany as ReturnType<typeof vi.fn>;
const findManyDept = prisma.department.findMany as ReturnType<typeof vi.fn>;
const groupByAudit = prisma.audit.groupBy as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findManyAudit.mockReset();
  findManyDept.mockReset();
  groupByAudit.mockReset();
});

describe("getSpendingTrends", () => {
  it("formats dates and preserves ascending order", async () => {
    findManyAudit.mockResolvedValue([
      { createdAt: new Date("2026-01-15T10:00:00Z"), totalCurrentSpend: 100, totalSavings: 20, optimizationScore: 80 },
      { createdAt: new Date("2026-02-15T10:00:00Z"), totalCurrentSpend: 150, totalSavings: 30, optimizationScore: 70 },
    ]);
    const result = await getSpendingTrends("user-1");
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-01-15");
    expect(result[1].date).toBe("2026-02-15");
    expect(result[1].spend).toBe(150);
    expect(findManyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" }, orderBy: { createdAt: "asc" } })
    );
  });
});

describe("getDepartmentAnalytics", () => {
  it("computes per-department spend/savings/score from matching audits", async () => {
    findManyDept.mockResolvedValue([
      { id: "d1", name: "Engineering", organizationId: "o1" },
      { id: "d2", name: "Marketing", organizationId: "o1" },
    ]);
    groupByAudit.mockResolvedValue([
      {
        department: "Engineering",
        _count: { _all: 2 },
        _sum: { totalCurrentSpend: 300, totalSavings: 60 },
        _avg: { optimizationScore: 82.5 },
      },
    ]);
    const result = await getDepartmentAnalytics("o1");
    const eng = result.find((d) => d.name === "Engineering")!;
    expect(eng).toMatchObject({ auditCount: 2, totalSpend: 300, totalSavings: 60, avgScore: 82.5 });
    const mkt = result.find((d) => d.name === "Marketing")!;
    expect(mkt.auditCount).toBe(0);
    expect(mkt.totalSpend).toBe(0);
    expect(mkt.avgScore).toBe(0);
    expect(groupByAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["department"],
        where: { organizationId: "o1", department: { not: null } },
        _count: { _all: true },
        _sum: { totalCurrentSpend: true, totalSavings: true },
        _avg: { optimizationScore: true },
      })
    );
  });
});

describe("getToolAdoptionAnalytics", () => {
  it("aggregates tool stats and sorts by total spend desc", async () => {
    findManyAudit.mockResolvedValue([
      { tools: [{ name: "ChatGPT", currentSpend: 20, savings: 5 }, { name: "Claude", currentSpend: 100, savings: 10 }] },
      { tools: [{ name: "ChatGPT", currentSpend: 30, savings: 0 }] },
    ]);
    const result = await getToolAdoptionAnalytics("user-1");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Claude"); // higher totalSpend sorts first
    expect(result[0].auditCount).toBe(1);
    const chatgpt = result.find((t) => t.name === "ChatGPT")!;
    expect(chatgpt.auditCount).toBe(2);
    expect(chatgpt.totalSpend).toBe(50);
    expect(chatgpt.avgSpend).toBe(25);
  });
});

describe("getAIUtilizationScore", () => {
  it("returns zeroed result when there are no audits", async () => {
    findManyAudit.mockResolvedValue([]);
    await expect(getAIUtilizationScore("user-1")).resolves.toEqual({
      score: 0,
      breakdown: [],
      recommendation: "",
    });
  });

  it("scores based on optimized tools and the latest audit", async () => {
    findManyAudit.mockResolvedValue([
      {
        optimizationScore: 100,
        tools: [
          { name: "ChatGPT", status: "Optimized" },
          { name: "Claude", status: "Overpaying" },
        ],
      },
    ]);
    const result = await getAIUtilizationScore("user-1");
    // optimistic: (1/2)*50 + (100/100)*50 = 25 + 50 = 75
    expect(result.score).toBe(75);
    expect(result.breakdown).toHaveLength(2);
    expect(result.recommendation).toContain("Excellent");
  });

  it("emits a critical recommendation for very low scores", async () => {
    findManyAudit.mockResolvedValue([
      {
        optimizationScore: 20,
        tools: [{ name: "ChatGPT", status: "Overpaying" }],
      },
    ]);
    expect((await getAIUtilizationScore("user-1")).recommendation).toContain("Critical");
  });
});

describe("getProjectedFutureSpend", () => {
  it("returns growth projections from a single audit", async () => {
    findManyAudit.mockResolvedValue([{ createdAt: new Date(), totalCurrentSpend: 100 }]);
    const r = await getProjectedFutureSpend("user-1");
    expect(r.current).toBe(100);
    expect(r.projected3Months).toBeCloseTo(100 * 3 * 1.1, 5);
    expect(r.growthRate).toBe(0.1);
  });

  it("extrapolates monthly growth rate from two audits", async () => {
    findManyAudit.mockResolvedValue([
      { createdAt: new Date("2026-01-01"), totalCurrentSpend: 100 },
      { createdAt: new Date("2026-07-01"), totalCurrentSpend: 200 },
    ]);
    const r = await getProjectedFutureSpend("user-1");
    // ~1 month elapsed normalized; growth rate = (200-100)/100/6 ~ 0.166...
    expect(r.current).toBe(200);
    expect(r.growthRate).toBeGreaterThan(0);
    expect(r.projected3Months).toBeGreaterThan(r.current);
  });
});
