import { describe, it, expect } from "vitest";
import {
  detectRedundantSubscriptions,
  estimateAnnualSpend,
  compareToolPricing,
  getToolAlternatives,
} from "@/lib/services/pricing-intelligence";

describe("detectRedundantSubscriptions", () => {
  it("flags overlapping general-chat tools and keeps the cheapest", () => {
    const result = detectRedundantSubscriptions([
      { name: "ChatGPT", plan: "Plus", spend: 20, users: 1 },
      { name: "Claude", plan: "Pro", spend: 60, users: 3 },
      { name: "Gemini", plan: "Pro", spend: 30, users: 2 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].tools.join()).toContain("Gemini");
    expect(result[0].tools.join()).toContain("Claude");
    // Savings should be the cost of the redundant (higher-spend) tools: 60 + 30
    expect(result[0].potentialSavings).toBe(90);
  });

  it("does not flag a single general-chat tool", () => {
    expect(
      detectRedundantSubscriptions([{ name: "ChatGPT", plan: "Plus", spend: 20, users: 1 }])
    ).toHaveLength(0);
  });

  it("is empty when no overlapping categories exist", () => {
    expect(
      detectRedundantSubscriptions([{ name: "ChatGPT", plan: "Plus", spend: 20, users: 1 }])
    ).toEqual([]);
  });
});

describe("estimateAnnualSpend", () => {
  it("compounds growth across 12 months", () => {
    const r = estimateAnnualSpend(100, 0);
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly[0]).toBe(100);
    expect(r.monthly[11]).toBe(100);
    expect(r.total).toBe(1200);
  });

  it("applies the growth rate monthly", () => {
    const r = estimateAnnualSpend(100, 0.1);
    expect(r.monthly[0]).toBe(100);
    expect(r.monthly[1]).toBeCloseTo(110, 5);
    expect(r.total).toBeGreaterThan(1200);
  });
});

describe("compareToolPricing", () => {
  it("returns the current plan and real (non-null) alternatives sorted by savings desc", () => {
    const { current, alternatives } = compareToolPricing("Copilot", "Pro", 3);
    expect(current?.tool).toBe("Copilot");
    expect(current?.plan).toBe("Pro");
    expect(alternatives.length).toBeGreaterThan(0);
    // Comparables are sorted highest savings first; every row with a real,
    // fixed price (e.g. ChatGPT Plus = 20*3 = 60) must be compared honestly.
    const savings = alternatives.map((a) => a.savings);
    const priced = savings.filter((s): s is number => s !== null);
    expect([...priced].sort((a, b) => b - a)).toEqual(priced);
    // Custom/usage alternatives are non-comparable and sort AFTER all real
    // savings figures.
    const nullIdx = savings.indexOf(null);
    if (nullIdx !== -1) {
      for (let i = nullIdx; i < savings.length; i++) expect(savings[i]).toBeNull();
      expect(Math.min(...priced)).toBeGreaterThan(-Infinity);
    }
  });

  it("returns no current match for an unknown plan", () => {
    const { current } = compareToolPricing("ChatGPT", "DoesNotExist", 1);
    expect(current).toBeUndefined();
  });

  it("never fabricates savings when the current plan is missing", () => {
    // An unknown current plan means there is NO baseline to subtract from.
    // Savings must be null (not comparable), never a fake $0.
    const { current, alternatives } = compareToolPricing("ChatGPT", "DoesNotExist", 1);
    expect(current).toBeUndefined();
    expect(alternatives.length).toBeGreaterThan(0);
    for (const alt of alternatives) expect(alt.savings).toBeNull();
  });
});

describe("getToolAlternatives", () => {
  it("excludes the same tool and keys by tool name", () => {
    const alts = getToolAlternatives("ChatGPT", "Plus", 2);
    expect(Object.keys(alts)).not.toContain("ChatGPT");
    expect(alts.Copilot).toBeDefined();
  });
});
