import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireUserOrg: vi.fn(),
  requireRole: vi.fn(),
  assertFeature: vi.fn(),
  rateLimitOrThrow: vi.fn(),
  auditFindFirst: vi.fn(),
  genInsights: vi.fn(),
  genSummary: vi.fn(),
  genConsolidation: vi.fn(),
  genSavings: vi.fn(),
  env: {
    OPENAI_API_KEY: undefined as string | undefined,
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test-db",
    SESSION_SECRET: "TEST_SESSION_SECRET_0123456789_0123456789_0123456789",
  },
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requireUserOrg: mocks.requireUserOrg,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/services/entitlements", () => ({
  assertFeature: mocks.assertFeature,
}));
vi.mock("@/lib/services/rate-limit", () => ({
  rateLimitOrThrow: mocks.rateLimitOrThrow,
}));
vi.mock("@/lib/db", () => ({
  prisma: { audit: { findFirst: mocks.auditFindFirst } },
}));
vi.mock("@/lib/services/ai-service", () => ({
  generateOptimizationInsights: mocks.genInsights,
  generateExecutiveSummary: mocks.genSummary,
  generateVendorConsolidationSuggestions: mocks.genConsolidation,
  generateSavingsAnalysis: mocks.genSavings,
}));

import { POST } from "@/app/api/ai/insights/route";

const fakeAudit = {
  id: "a1",
  userId: "user-1",
  organizationId: "org-1",
  totalCurrentSpend: 120,
  totalSavings: 40,
  optimizationScore: 30,
  summary: "summary",
  tools: [
    {
      name: "ChatGPT",
      status: "Overpaying",
      currentSpend: 100,
      optimizedSpend: 60,
      savings: 40,
      recommendation: "downgrade",
    },
  ],
};

const makeReq = (body: unknown) =>
  new Request("http://localhost/api/ai/insights", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("POST /api/ai/insights — provenance flag + type variants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("user-1");
    mocks.requireUserOrg.mockResolvedValue({ id: "user-1", organizationId: "org-1" });
    mocks.requireRole.mockResolvedValue(undefined);
    mocks.assertFeature.mockResolvedValue(undefined);
    mocks.rateLimitOrThrow.mockResolvedValue({ remaining: 19 });
    mocks.auditFindFirst.mockResolvedValue(fakeAudit);
    mocks.genInsights.mockResolvedValue(["offline insight 1", "offline insight 2"]);
    mocks.genSummary.mockResolvedValue("offline summary");
    mocks.genConsolidation.mockResolvedValue(["offline consolidation"]);
    mocks.genSavings.mockResolvedValue("offline savings analysis");
  });

  it.each([
    ["insights", "genInsights" as const, { data: ["offline insight 1", "offline insight 2"] }],
    ["summary", "genSummary" as const, { data: "offline summary" }],
    ["vendor-consolidation", "genConsolidation" as const, { data: ["offline consolidation"] }],
    ["savings", "genSavings" as const, { data: "offline savings analysis" }],
  ])(
    "returns %s success payload with source generatedOffline when OPENAI_API_KEY is missing",
    async (type, genMockKey, expected) => {
      mocks.env.OPENAI_API_KEY = undefined;
      const res = await POST(
        makeReq({ auditId: "a1", type }),
        { params: Promise.resolve({}) }
      );
      expect(res.status).toBe(200);
      expect(mocks[genMockKey]).toHaveBeenCalledOnce();
      expect(await res.json()).toEqual({ source: "generatedOffline", ...expected });
    }
  );

  it.each([
    ["insights", "genInsights" as const],
    ["summary", "genSummary" as const],
    ["vendor-consolidation", "genConsolidation" as const],
    ["savings", "genSavings" as const],
  ])("returns %s with source openai when OPENAI_API_KEY is configured", async (type) => {
    mocks.env.OPENAI_API_KEY = "sk_test_openai";
    const res = await POST(
      makeReq({ auditId: "a1", type }),
      { params: Promise.resolve({}) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).source).toBe("openai");
  });
});