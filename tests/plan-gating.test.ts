import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import {
  isPaidPlan,
  effectivePlan,
  featuresForPlan,
  getUserEntitlements,
  assertFeature,
  PlanRequiredError,
  PlanLimitError,
} from "@/lib/services/entitlements";
import { createAuditWithinLimit } from "@/lib/services/audit-service";
import { withSerializableTransaction } from "@/lib/services/transaction";
import { clearRateLimits } from "@/lib/services/rate-limit";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireUserOrg: vi.fn(),
  requireRole: vi.fn(),
  findUnique: vi.fn(),
  auditCount: vi.fn(),
  auditCreate: vi.fn(),
  auditFindFirst: vi.fn(),
  savedReportCount: vi.fn(),
  savedReportCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  $transaction: vi.fn(),
  genInsights: vi.fn(),
  analyticsFns: {
    getSpendingTrends: vi.fn(),
    getToolAdoptionAnalytics: vi.fn(),
    getAIUtilizationScore: vi.fn(),
    getProjectedFutureSpend: vi.fn(),
    getDepartmentAnalytics: vi.fn(),
  },
}));

const txProxy = {
  audit: { count: mocks.auditCount, create: mocks.auditCreate },
  savedReport: { count: mocks.savedReportCount, create: mocks.savedReportCreate },
};

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requireUserOrg: mocks.requireUserOrg,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.$transaction,
    user: { findUnique: mocks.findUnique },
    audit: { count: mocks.auditCount, create: mocks.auditCreate, findFirst: mocks.auditFindFirst },
    savedReport: { count: mocks.savedReportCount, create: mocks.savedReportCreate },
    auditLog: { create: mocks.auditLogCreate },
  },
}));
vi.mock("@/lib/services/ai-service", () => ({
  generateOptimizationInsights: mocks.genInsights,
  generateExecutiveSummary: mocks.genInsights,
  generateVendorConsolidationSuggestions: mocks.genInsights,
  generateSavingsAnalysis: mocks.genInsights,
}));
vi.mock("@/lib/services/analytics-service", () => mocks.analyticsFns);

import { POST as aiInsightsPOST } from "@/app/api/ai/insights/route";
import { GET as analyticsTrendsGET } from "@/app/api/analytics/trends/route";
import { GET as analyticsDepartmentsGET } from "@/app/api/analytics/departments/route";
import { POST as exportPOST, auditRowToResult } from "@/app/api/reports/export/route";
import { GET as entitlementsGET } from "@/app/api/entitlements/route";

describe("P1-D plan gating — effective plan resolution", () => {
  it("treats ACTIVE/TRIALING paid plans as paid", () => {
    expect(isPaidPlan("PRO", "ACTIVE")).toBe(true);
    expect(isPaidPlan("ENTERPRISE", "TRIALING")).toBe(true);
  });

  it("fails closed for CANCELED/PAST_DUE/INCOMPLETE/null/unknown status", () => {
    for (const status of ["CANCELED", "PAST_DUE", "INCOMPLETE", null, undefined, "BANNED" as never]) {
      expect(isPaidPlan("PRO", status)).toBe(false);
      expect(effectivePlan("PRO", status)).toBe("FREE");
    }
  });

  it("never grants a paid plan from the FREE row or a missing row", () => {
    expect(effectivePlan("FREE", "ACTIVE")).toBe("FREE");
    expect(effectivePlan("FREE", null)).toBe("FREE");
  });

  it("maps features from the plan config only", () => {
    expect(featuresForPlan("FREE")).toEqual({ ai: false, analytics: false, team: false });
    expect(featuresForPlan("PRO")).toEqual({ ai: true, analytics: true, team: true });
  });
});

describe("P1-D plan gating — getUserEntitlements", () => {
  const freeUser = () => ({ id: "u1", subscription: null });
  const paidUser = (plan: string, status: string) => ({
    id: "u1",
    subscription: { plan, status },
  });

  beforeEach(() => {
    clearRateLimits();
    vi.clearAllMocks();
    mocks.$transaction.mockImplementation(async (fn: unknown) => (fn as (tx: unknown) => Promise<unknown>)(txProxy));
    mocks.auditCount.mockResolvedValue(0);
    mocks.savedReportCount.mockResolvedValue(0);
    mocks.auditLogCreate.mockResolvedValue({});
    mocks.genInsights.mockResolvedValue("insight");
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.requireUserOrg.mockResolvedValue({ id: "u1", organizationId: "org-1" });
    mocks.requireRole.mockResolvedValue(undefined);
  });

  it("defaults a missing subscription to FREE limits (5 audits / 3 exports, no paid features)", async () => {
    mocks.findUnique.mockResolvedValue(freeUser());
    const e = await getUserEntitlements("u1");
    expect(e.plan).toBe("FREE");
    expect(e.auditLimit).toBe(5);
    expect(e.exportLimit).toBe(3);
    expect(e.features).toEqual({ ai: false, analytics: false, team: false });
  });

  it("returns FREE defaults for a falsy id without ever touching the database", async () => {
    const e = await getUserEntitlements("");
    expect(e.plan).toBe("FREE");
    expect(e.auditLimit).toBe(5);
    expect(e.auditRemaining).toBe(5);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("grants Pro limits/features only for an ACTIVE or TRIALING PRO row", async () => {
    for (const status of ["ACTIVE", "TRIALING"]) {
      mocks.findUnique.mockResolvedValue(paidUser("PRO", status));
      mocks.auditCount.mockResolvedValue(3);
      mocks.savedReportCount.mockResolvedValue(2);
      const e = await getUserEntitlements("u1");
      expect(e.plan).toBe("PRO");
      expect(e.auditLimit).toBe(50);
      expect(e.exportLimit).toBe(100);
      expect(e.features.ai).toBe(true);
      expect(e.features.analytics).toBe(true);
    }
  });

  it("ignores stored limit/flag columns a stale or forged row might carry (config is authoritative)", async () => {
    // Attacker or stale webhook sets paid-looking columns on a FREE row.
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      subscription: {
        plan: "FREE",
        status: null,
        auditLimit: 999999,
        exportLimit: 999999,
        aiRecommendations: true,
        teamCollaboration: true,
      },
    });
    const e = await getUserEntitlements("u1");
    expect(e.plan).toBe("FREE");
    expect(e.auditLimit).toBe(5);
    expect(e.exportLimit).toBe(3);
    expect(e.features.ai).toBe(false);
  });

  it("resolves a CANCELED/PAST_DUE/INCOMPLETE paid row to FREE with FREE limits", async () => {
    for (const status of ["CANCELED", "PAST_DUE", "INCOMPLETE"]) {
      mocks.findUnique.mockResolvedValue(paidUser("ENTERPRISE", status));
      const e = await getUserEntitlements("u1");
      expect(e.plan).toBe("FREE");
      expect(e.auditLimit).toBe(5);
      expect(e.features.ai).toBe(false);
    }
  });

  it("counts audit usage against the rolling 30-day window and reports remaining", async () => {
    mocks.findUnique.mockResolvedValue(freeUser());
    mocks.auditCount.mockResolvedValue(4);
    const e = await getUserEntitlements("u1");
    expect(e.auditCount).toBe(4);
    expect(e.auditRemaining).toBe(1);
    expect(mocks.auditCount).toHaveBeenCalledWith({
      where: { userId: "u1", createdAt: { gte: expect.any(Date) } },
    });
  });

  it("counts exports against the same rolling 30-day window as audits", async () => {
    mocks.findUnique.mockResolvedValue(freeUser());
    mocks.savedReportCount.mockResolvedValue(2);
    const e = await getUserEntitlements("u1");
    expect(e.exportCount).toBe(2);
    expect(mocks.savedReportCount).toHaveBeenCalledWith({
      where: { userId: "u1", createdAt: { gte: expect.any(Date) } },
    });
  });

  it("clamps remaining at zero (never negative) when at/over the limit", async () => {
    mocks.findUnique.mockResolvedValue(freeUser());
    mocks.auditCount.mockResolvedValue(5);
    mocks.savedReportCount.mockResolvedValue(3);
    const e = await getUserEntitlements("u1");
    expect(e.auditRemaining).toBe(0);
    expect(e.exportRemaining).toBe(0);
  });
});

describe("P1-D plan gating — assertFeature", () => {
  it("blocks paid-only features for a Free user with a 403 PlanRequiredError", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    await expect(assertFeature("u1", "ai")).rejects.toBeInstanceOf(PlanRequiredError);
    await expect(assertFeature("u1", "ai")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("passes paid features for an ACTIVE paid user", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: { plan: "PRO", status: "ACTIVE" } });
    await expect(assertFeature("u1", "analytics")).resolves.toMatchObject({ plan: "PRO" });
  });
});

describe("P1-D plan gating — race-safe audit creation", () => {
  beforeEach(() => {
    clearRateLimits();
    vi.clearAllMocks();
    mocks.$transaction.mockImplementation(async (fn: unknown) => (fn as (tx: unknown) => Promise<unknown>)(txProxy));
    mocks.auditCount.mockResolvedValue(0);
    mocks.savedReportCount.mockResolvedValue(0);
    mocks.auditCreate.mockResolvedValue({ id: "a1" });
    mocks.auditLogCreate.mockResolvedValue({});
  });

  const input = { tools: [{ tool: "ChatGPT", plan: "Pro", spend: 20, users: 1 }] };

  it("creates inside a Serializable transaction when under the limit", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    const audit = await createAuditWithinLimit("u1", input);
    expect(audit.id).toBe("a1");
    expect(mocks.auditCreate).toHaveBeenCalled();
    // Limit check and insert happen in the SAME transaction.
    expect(mocks.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("blocks with a 403 PlanLimitError when the window is already at the limit", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    mocks.auditCount.mockResolvedValue(5);
    await expect(createAuditWithinLimit("u1", input)).rejects.toBeInstanceOf(PlanLimitError);
    await expect(createAuditWithinLimit("u1", input)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("stops a concurrent pair of requests from both passing the limit (no check-then-create TOCTOU)", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    // Emulate a committed-row database: reads return the committed count and a
    // create commits instantly. Transactions are serialized (as Serializable
    // isolation does), so the second transaction's count sees the first one's
    // committed insert even though its earlier non-transactional entitlement
    // pre-read was stale.
    let dbAuditCount = 4;
    mocks.auditCount.mockImplementation(() => Promise.resolve(dbAuditCount));
    mocks.auditCreate.mockImplementation(async () => {
      dbAuditCount += 1;
      return { id: "a-new" };
    });
    let lock: Promise<void> = Promise.resolve();
    mocks.$transaction.mockImplementation((fn: unknown) => {
      const run = lock.then(() => (fn as (tx: unknown) => Promise<unknown>)(txProxy));
      lock = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    });

    const results = await Promise.allSettled([
      createAuditWithinLimit("u1", input),
      createAuditWithinLimit("u1", input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(dbAuditCount).toBe(5);
  });
});

describe("P1-D plan gating — withSerializableTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries on a P2034 serialization conflict then succeeds", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("conflict", {
      code: "P2034",
      clientVersion: "5.0.0",
    });
    mocks.$transaction
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce("ok");
    await expect(withSerializableTransaction(async () => "ok")).resolves.toBe("ok");
    expect(mocks.$transaction).toHaveBeenCalledTimes(4);
    expect(mocks.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("does not retry non-serialization failures (they propagate immediately)", async () => {
    mocks.$transaction.mockRejectedValue(new Error("db down"));
    await expect(withSerializableTransaction(async () => "ok")).rejects.toThrow("db down");
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
  });

  it("retries driver-adapter TransactionWriteConflict errors too", async () => {
    const engineConflict = new Error("TransactionWriteConflict");
    (engineConflict as { kind?: string }).kind = "TransactionWriteConflict";
    const driverConflict = new Error("could not serialize access");
    (driverConflict as { cause?: object }).cause = { originalCode: "40001", kind: "TransactionWriteConflict" };
    mocks.$transaction
      .mockRejectedValueOnce(engineConflict)
      .mockRejectedValueOnce(driverConflict)
      .mockResolvedValueOnce("ok");
    await expect(withSerializableTransaction(async () => "ok")).resolves.toBe("ok");
    expect(mocks.$transaction).toHaveBeenCalledTimes(3);
  });
});

describe("P1-D plan gating — protected API routes", () => {
  beforeEach(() => {
    clearRateLimits();
    vi.clearAllMocks();
    mocks.$transaction.mockImplementation(async (fn: unknown) => (fn as (tx: unknown) => Promise<unknown>)(txProxy));
    mocks.auditCount.mockResolvedValue(0);
    mocks.savedReportCount.mockResolvedValue(0);
    mocks.auditLogCreate.mockResolvedValue({});
    mocks.genInsights.mockResolvedValue("insight");
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.requireUserOrg.mockResolvedValue({ id: "u1", organizationId: "org-1" });
    mocks.requireRole.mockResolvedValue(undefined);
  });

  it("GET /api/entitlements reflects the effective server-side plan", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    const res = await entitlementsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("FREE");
    expect(body.features).toEqual({ ai: false, analytics: false, team: false });
    expect(body.audit.remaining).toBe(5);
    expect(body.export.remaining).toBe(3);
  });

  it("POST /api/ai/insights returns 403 for a Free user (server-side, after auth)", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    const res = await aiInsightsPOST(
      new Request("http://localhost/api/ai/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auditId: "a1", type: "insights" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("POST /api/ai/insights succeeds for an ACTIVE Pro user", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: { plan: "PRO", status: "ACTIVE" } });
    mocks.auditFindFirst.mockResolvedValue({
      id: "a1",
      userId: "u1",
      organizationId: null,
      tools: [],
      totalCurrentSpend: 100,
      totalSavings: 50,
      optimizationScore: 70,
      summary: "s",
    });
    const res = await aiInsightsPOST(
      new Request("http://localhost/api/ai/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auditId: "a1", type: "insights" }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("GET /api/analytics/trends returns 403 for a Free user", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    mocks.analyticsFns.getSpendingTrends.mockResolvedValue([]);
    const res = await analyticsTrendsGET(new Request("http://localhost/api/analytics/trends?type=trends"));
    expect(res.status).toBe(403);
  });

  it("GET /api/analytics/trends succeeds for an ACTIVE Pro user", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: { plan: "PRO", status: "ACTIVE" } });
    mocks.analyticsFns.getSpendingTrends.mockResolvedValue([{ month: "Jan", spend: 10 }]);
    const res = await analyticsTrendsGET(new Request("http://localhost/api/analytics/trends?type=trends"));
    expect(res.status).toBe(200);
  });

  it("GET /api/analytics/departments returns 403 for a Free user", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    const res = await analyticsDepartmentsGET();
    expect(res.status).toBe(403);
  });
});

describe("P1-D plan gating — POST /api/reports/export", () => {
  beforeEach(() => {
    clearRateLimits();
    vi.clearAllMocks();
    mocks.$transaction.mockImplementation(async (fn: unknown) => (fn as (tx: unknown) => Promise<unknown>)(txProxy));
    mocks.auditCount.mockResolvedValue(0);
    mocks.savedReportCount.mockResolvedValue(0);
    mocks.auditLogCreate.mockResolvedValue({});
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.requireUserOrg.mockResolvedValue({ id: "u1", organizationId: "org-1" });
    mocks.requireRole.mockResolvedValue(undefined);
  });

  const exportReq = () =>
    new Request("http://localhost/api/reports/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auditId: "a1" }),
    });

  it("records one export (count + create atomically) and returns a REAL PDF with the remaining header", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    mocks.auditFindFirst.mockResolvedValue({ id: "a1", userId: "u1", organizationId: null });
    mocks.savedReportCreate.mockResolvedValue({ id: "r1", userId: "u1", auditId: "a1" });
    const res = await exportPOST(exportReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-export-remaining")).toBe("2"); // 3 - 1 used just now
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString("utf8", 0, 4)).toBe("%PDF");
    expect(body.length).toBeGreaterThan(3000);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "report.exported" }) })
    );
    // The quota check counts exports inside the current rolling window.
    expect(mocks.savedReportCount).toHaveBeenCalledWith({
      where: { userId: "u1", createdAt: { gte: expect.any(Date) } },
    });
  });

  it("blocks a Free user at the export limit with a 403 PlanLimitError (before any PDF is produced)", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    mocks.auditFindFirst.mockResolvedValue({ id: "a1", userId: "u1", organizationId: null });
    mocks.savedReportCount.mockResolvedValue(3);
    const res = await exportPOST(exportReq());
    expect(res.status).toBe(403);
  });

  it("returns 404 when the named audit is not readable by the caller (cross-org or foreign)", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    mocks.auditFindFirst.mockResolvedValue(null);
    const res = await exportPOST(exportReq());
    expect(res.status).toBe(404);
  });
});

describe("P1-D plan gating — audit → report result mapping", () => {
  it("prefers the stored resultData snapshot when present and valid", () => {
    const snapshot = {
      tools: [
        {
          tool: "ChatGPT",
          status: "Overpaying",
          recommendation: "downgrade",
          currentSpend: 100,
          optimizedSpend: 60,
          savings: 40,
          optimizationScore: 40,
          currentPlan: "Pro",
          recommendedPlan: "Standard",
        },
      ],
      totalCurrentSpend: 100,
      totalOptimizedSpend: 60,
      totalSavings: 40,
      totalAnnualSavings: 480,
      overallOptimizationScore: 66,
      priorityRecommendations: ["downgrade"],
      summary: "summary",
      savingsRate: 0.4,
      teamEfficiencyScore: 1,
      enhancedRecommendations: [],
    };
    const result = auditRowToResult({
      resultData: JSON.stringify(snapshot),
      tools: [],
    });
    expect(result).toEqual(snapshot);
  });

  it("rebuilds from denormalized columns/tool rows when resultData is missing or malformed", () => {
    const result = auditRowToResult({
      resultData: "not-json{",
      totalCurrentSpend: 500,
      totalOptimizedSpend: 300,
      totalSavings: 200,
      totalAnnualSavings: 2400,
      optimizationScore: 70,
      summary: "sc",
      tools: [
        {
          id: "t1",
          auditId: "a1",
          name: "ChatGPT",
          status: "Optimization Available",
          currentSpend: 100,
          optimizedSpend: 50,
          savings: 50,
          recommendation: "move to annual",
        },
      ],
    });
    expect(result.totalCurrentSpend).toBe(500);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].tool).toBe("ChatGPT");
    expect(result.tools[0].savings).toBe(50);
    expect(result.overallOptimizationScore).toBe(70);
    expect(result.priorityRecommendations).toEqual(["move to annual"]);
  });
});