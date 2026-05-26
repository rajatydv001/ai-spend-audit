import { describe, it, expect } from "vitest";
import { generateAudit, generateAggregateAudit } from "../lib/audit-engine";

describe("Audit Engine", () => {
  it("should detect a non-optimized plan with savings opportunity", () => {
    const result = generateAudit("ChatGPT", 20, 1);

    expect(result.tool).toBe("ChatGPT");
    expect(result.savings).toBeGreaterThan(0);
    expect(result.optimizationScore).toBeLessThan(100);
    expect(result.status).not.toBe("Optimized");
  });

  it("should recommend savings for an overpaying tool", () => {
    const result = generateAudit("ChatGPT", 100, 1);

    expect(result.tool).toBe("ChatGPT");
    expect(result.savings).toBeGreaterThan(0);
    expect(result.status).not.toBe("Optimized");
    expect(result.recommendation).toContain("Downgrade");
  });

  it("should aggregate multiple tool results correctly", () => {
    const aggregate = generateAggregateAudit([
      { tool: "ChatGPT", spend: 100, users: 1 },
      { tool: "Copilot", spend: 50, users: 5 },
    ]);

    expect(aggregate.tools.length).toBe(2);
    expect(aggregate.totalCurrentSpend).toBe(150);
    expect(aggregate.totalSavings).toBeGreaterThanOrEqual(0);
    expect(aggregate.priorityRecommendations.length).toBeGreaterThanOrEqual(0);
    expect(aggregate.summary).toContain("You're currently spending");
  });
});
