import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: undefined as string | undefined,
    DATABASE_URL: "postgresql://test:test@localhost:5432/test-db",
    SESSION_SECRET: "TEST_SESSION_SECRET_0123456789_0123456789_0123456789",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
}));

vi.mock("openai", () => {
  const shared = {
    chat: { completions: { create: async () => ({ choices: [{ message: { content: "" } }] }) } },
  };
  class MockOpenAI {
    constructor() {
      return shared as unknown as MockOpenAI;
    }
    static inst = shared;
  }
  return { default: MockOpenAI };
});

import { env } from "@/lib/env";
import MockOpenAI from "openai";
import {
  generateOptimizationInsights,
  generateExecutiveSummary,
  generateVendorConsolidationSuggestions,
  generateSavingsAnalysis,
} from "@/lib/services/ai-service";
import { generateAggregateAudit } from "@/lib/audit-engine";

const sharedClient = (MockOpenAI as unknown as {
  inst: { chat: { completions: { create: (arg: Record<string, unknown>) => Promise<{ choices: { message: { content: string } }[] }> } } };
}).inst;

const auditData = {
  tools: [
    { tool: "ChatGPT", status: "Overpaying", currentSpend: 100, optimizedSpend: 60, savings: 40, recommendation: "downgrade" },
    { tool: "Claude", status: "Optimized", currentSpend: 20, optimizedSpend: 20, savings: 0, recommendation: "none" },
  ],
  totalCurrentSpend: 120,
  totalSavings: 40,
  overallOptimizationScore: 30,
  summary: "Executive summary text",
};

beforeEach(() => {
  env.OPENAI_API_KEY = undefined;
});

describe("fallback (no OpenAI API key) — no external calls", () => {
  it("returns deterministic fallback insights", async () => {
    const insights = await generateOptimizationInsights(auditData);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some((i) => i.toLowerCase().includes("overpaying"))).toBe(true);
  });

  it("uses the provided summary for executive summary fallback", async () => {
    await expect(generateExecutiveSummary(auditData)).resolves.toBe("Executive summary text");
  });

  it("computes a deterministic savings analysis fallback", async () => {
    const savings = await generateSavingsAnalysis(auditData);
    expect(savings).toContain("$120");
    expect(savings).toContain("$40");
  });

  it("returns a consolidation fallback suggestion", async () => {
    const suggestions = await generateVendorConsolidationSuggestions(auditData.tools);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("flags a critical low-score insight", async () => {
    const low = { ...auditData, overallOptimizationScore: 10 };
    const insights = await generateOptimizationInsights(low);
    expect(insights.some((i) => i.toLowerCase().includes("low"))).toBe(true);
  });

  it("mirrors the engine's verified savings ($0) — never invents an overpaying claim", async () => {
    // Claude Pro at 5 seats / $200 has no verified lower-cost replacement. The
    // AI consumes the persisted engine result, so its fallback must agree: no
    // "overpaying" fabrication, no invented dollar figure.
    const zero = generateAggregateAudit([
      { tool: "Claude", spend: 200, users: 5, plan: "Pro" },
    ]);
    expect(zero.totalSavings).toBe(0);

    const insights = await generateOptimizationInsights(zero);
    expect(insights.some((i) => i.toLowerCase().includes("overpaying"))).toBe(false);
    expect(insights.some((i) => /\$\d+/.test(i) && i.includes("savings"))).toBe(false);

    const savings = await generateSavingsAnalysis(zero);
    expect(savings).toContain("$0/month");
    expect(savings).toContain("0.0%");
    expect(savings).not.toContain("save $200");
  });

  it("AI insights match the engine's verified savings when a replacement exists", async () => {
    // Claude 200/1 → Max 20x → Pro → verified savings $180.
    const agg = generateAggregateAudit([{ tool: "Claude", spend: 200, users: 1 }]);
    expect(agg.totalSavings).toBe(180);

    const insights = await generateOptimizationInsights(agg);
    expect(insights.some((i) => i.includes("$180"))).toBe(true);

    const savings = await generateSavingsAnalysis(agg);
    expect(savings).toContain("$180/month");
  });
});

describe("mock OpenAI client — verifies response parsing", () => {
  it("parses bullet-point insights from the mock response", async () => {
    env.OPENAI_API_KEY = "sk_test_openai";
    sharedClient.chat.completions.create = async () => ({
      choices: [{ message: { content: "- Reduce spend on ChatGPT\n- Consolidate vendors\nPlain line" } }],
    });
    const insights = await generateOptimizationInsights(auditData);
    expect(insights).toEqual(["Reduce spend on ChatGPT", "Consolidate vendors"]);
  });

  it("returns the mock content for executive summary", async () => {
    env.OPENAI_API_KEY = "sk_test_openai";
    sharedClient.chat.completions.create = async () => ({
      choices: [{ message: { content: "Produced mock summary" } }],
    });
    await expect(generateExecutiveSummary(auditData)).resolves.toBe("Produced mock summary");
  });

  it("falls back gracefully when the mock call throws", async () => {
    env.OPENAI_API_KEY = "sk_test_openai";
    sharedClient.chat.completions.create = async () => {
      throw new Error("upstream failure");
    };
    const insights = await generateOptimizationInsights(auditData);
    expect(insights.length).toBeGreaterThan(0);
  });
});
