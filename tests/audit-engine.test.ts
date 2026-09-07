import { describe, it, expect } from "vitest";
import { generateAudit, generateAggregateAudit } from "../lib/audit-engine";
import {
  TOOL_PLAN_NAMES,
  getToolPlanNames,
} from "../lib/pricing/plan-lists";

// ────────────────────────────────────────────────────────────────────────────
// Core behavior — segment-aware downgrade eligibility
// ────────────────────────────────────────────────────────────────────────────
describe("Audit Engine", () => {
  it("detects a non-optimized plan with savings opportunity", () => {
    // ChatGPT: spend $20/user → detected as Plus → eligible lower-cost is Free.
    const result = generateAudit("ChatGPT", 20, 1);

    expect(result.tool).toBe("ChatGPT");
    expect(result.savings).toBeGreaterThan(0);
    expect(result.optimizationScore).toBeLessThan(100);
    expect(result.status).not.toBe("Optimized");
  });

  it("recommends a downgrade for an overpaying tool", () => {
    const result = generateAudit("ChatGPT", 100, 1);
    expect(result.tool).toBe("ChatGPT");
    expect(result.savings).toBeGreaterThan(0);
    expect(result.status).not.toBe("Optimized");
    expect(result.recommendation).toMatch(/Switch to the \w+ plan/);
  });

  it("aggregates multiple tool results correctly", () => {
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

describe("Audit Engine - edge cases", () => {
  it("flags an already-optimized setup", () => {
    const result = generateAudit("OpenAI API", 50, 1);
    expect(result.status).toBe("Optimized");
    expect(result.savings).toBe(0);
    expect(result.optimizationScore).toBe(100);
  });

  it("treats invalid (zero/non-positive) inputs as optimized with no savings", () => {
    expect(generateAudit("ChatGPT", 0, 0).optimizationScore).toBe(100);
    expect(generateAudit("ChatGPT", 0, 0).savings).toBe(0);
    expect(generateAudit("ChatGPT", 0, 0).status).toBe("Optimized");
  });

  it("returns an empty-safe aggregate for no valid tools", () => {
    const agg = generateAggregateAudit([]);
    expect(agg.tools).toEqual([]);
    expect(agg.totalCurrentSpend).toBe(0);
    expect(agg.overallOptimizationScore).toBe(100);
    expect(agg.summary).toContain("No tools provided");
  });

  it("reports missing seats instead of claiming no tools were provided", () => {
    const agg = generateAggregateAudit([
      { tool: "ChatGPT", spend: 50, users: 0 },
      { tool: "Claude", spend: 100, users: 0 },
    ]);
    expect(agg.summary).not.toContain("No tools provided");
    expect(agg.summary).toContain("missing seats");
    expect(agg.tools).toEqual([]);
  });

  it("ranks priority recommendations by savings descending and caps at 3", () => {
    const agg = generateAggregateAudit([
      { tool: "ChatGPT", spend: 300, users: 1 },
      { tool: "Claude", spend: 200, users: 1 },
      { tool: "Copilot", spend: 500, users: 1 },
      { tool: "Gemini", spend: 100, users: 1 },
    ]);
    expect(agg.priorityRecommendations.length).toBeLessThanOrEqual(3);
    // Copilot at $500/1 is detected on Max (individual) → eligible Pro $10 → big savings.
    expect(agg.priorityRecommendations[0]).toContain("Copilot");
  });

  it("produces structured enhanced recommendations with priority/severity/impact", () => {
    const agg = generateAggregateAudit([{ tool: "ChatGPT", spend: 300, users: 1 }]);
    const recs = agg.enhancedRecommendations;
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]).toMatchObject({
      tool: "ChatGPT",
      action: expect.any(String),
    });
    expect(["high", "medium", "low"]).toContain(recs[0].priority);
    expect(["critical", "moderate", "minor"]).toContain(recs[0].severity);
    expect(recs[0].impact).toBeGreaterThan(0);
  });

  it("concatenates an executive summary mentioning monthly spend", () => {
    const agg = generateAggregateAudit([{ tool: "ChatGPT", spend: 100, users: 1 }]);
    expect(agg.summary).toMatch(/spending \$\d+\/mo/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Segment-aware downgrade eligibility (item 9) — "cheapest ≠ valid replacement"
// ────────────────────────────────────────────────────────────────────────────
describe("segment-aware downgrade eligibility", () => {
  it("rejects a business/org tier downgrading to a consumer/free tier", () => {
    // Cursor $40/seat × 7 = $280; detected on Business (org). Free/Individual are
    // NOT eligible replacements for an org license → savings = 0.
    const result = generateAudit("Cursor", 280, 7);
    expect(result.currentPlan).toBe("Business");
    expect(result.recommendedPlan).toBe(""); // no verified lower-cost replacement
    expect(result.savings).toBe(0);
    expect(result.recommendation).toContain("No verified lower-cost replacement");
  });

  it("never claims 100% savings for Cursor Business", () => {
    const result = generateAudit("Cursor", 877, 7);
    expect(result.savings).toBe(0);
    expect(result.optimizedSpend).toBe(877);
  });

  it("rejects a heavy power tier downgrading to Free", () => {
    // Claude detected on Max 20x (power) → Free is not eligible → recommends Pro,
    // NOT Free, and savings is not the full spend.
    const result = generateAudit("Claude", 200, 1);
    expect(result.recommendedPlan).toBe("Pro");
    expect(result.savings).toBe(180); // 200 - Pro($20 × 1)
    expect(result.savings).not.toBe(200);
  });

  it("Claude Max $123/1 → recommends Pro $20; savings $103, not 100%", () => {
    // A single Claude Max seat at $123/mo: detected on Max (power) → eligible
    // downgrade is Pro at $20 → savings = 123 - (20 × 1) = 103.
    const result = generateAudit("Claude", 123, 1);
    expect(result.currentPlan).toBe("Max");
    expect(result.recommendedPlan).toBe("Pro");
    expect(result.savings).toBe(103); // 123 - (20 × 1)
    expect(result.savings).not.toBe(123);
  });

  it("Claude $123/4 (Team seats) → no consumer replacement; savings $0", () => {
    // With 4 seats, $123/4 ≈ $30.75/seat is detected as Team. Pro (individual)
    // is a per-person CONSUMER license and can never replace org seats — the
    // engine must not multiply a consumer price across team seats, which would
    // fabricate savings. Team tiers are only comparable to other org tiers.
    const result = generateAudit("Claude", 123, 4);
    expect(result.currentPlan).toBe("Team");
    expect(result.recommendedPlan).toBe(""); // no eligible lower-cost replacement
    expect(result.savings).toBe(0);
  });

  it("rejects Business → personal for ChatGPT when seats qualify for an org tier", () => {
    const result = generateAudit("ChatGPT", 100, 2);
    // $50/seat → detected Business Standard; a $25/seat org tier can't drop to Plus/Free.
    expect(result.currentPlan).toBe("Business Standard");
    expect(result.recommendedPlan).toBe("");
    expect(result.savings).toBe(0);
  });

  it("allows an individual non-power tier to downgrade to a cheaper individual/free tier", () => {
    // ChatGPT $15/user → detected Plus (individual, non-power) → Free is eligible.
    const result = generateAudit("ChatGPT", 15, 1);
    expect(result.currentPlan).toBe("Plus");
    expect(result.recommendedPlan).toBe("Free");
    expect(result.savings).toBe(15);
  });

  it("reports 'No verified lower-cost replacement' with $0 savings when none is eligible", () => {
    const result = generateAudit("Cursor", 280, 7);
    expect(result.savings).toBe(0);
    expect(result.optimizedSpend).toBe(280);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Savings Rate replaces ROI (item 10)
// ────────────────────────────────────────────────────────────────────────────
describe("savingsRate (Savings Rate, replaces ROI)", () => {
  it("computes savings rate as monthlySavings / monthlySpend, not 12x", () => {
    // ChatGPT $1000/1 → detected Plus → eligible Free → savings $1000 → rate 100%.
    const agg = generateAggregateAudit([{ tool: "ChatGPT", spend: 1000, users: 1 }]);
    expect(agg.savingsRate).toBe(100);
  });

  it("returns 0% savings rate when there are no savings", () => {
    const agg = generateAggregateAudit([{ tool: "OpenAI API", spend: 50, users: 1 }]);
    expect(agg.savingsRate).toBe(0);
  });

  it("returns 0 when totalCurrentSpend is 0 (empty aggregate)", () => {
    const agg = generateAggregateAudit([]);
    expect(agg.savingsRate).toBe(0);
  });

  it("does not expose the old roiEstimate field", () => {
    const agg = generateAggregateAudit([{ tool: "ChatGPT", spend: 100, users: 1 }]);
    expect("roiEstimate" in agg).toBe(false);
    expect(agg.savingsRate).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Team Efficiency Score — regression for counting "Optimization Available"
// ────────────────────────────────────────────────────────────────────────────
describe("teamEfficiencyScore", () => {
  it("counts only fully Optimized tools, not Optimization Available", () => {
    // OpenAI API (below threshold): savings = $0 → Optimized
    // ChatGPT $100/1: detected Plus → Free → savings=$100 → Overpaying
    // Cursor $100/1: detected Individual → Hobby → savings=$100 → Overpaying
    const agg = generateAggregateAudit([
      { tool: "OpenAI API", spend: 50, users: 1 },
      { tool: "ChatGPT", spend: 100, users: 1 },
      { tool: "Cursor", spend: 100, users: 1 },
    ]);
    // Only OpenAI API is fully Optimized → 1/3 → 33%
    expect(agg.teamEfficiencyScore).toBe(33);
  });

  it("is 100 when all tools are already optimal", () => {
    const agg = generateAggregateAudit([{ tool: "OpenAI API", spend: 50, users: 1 }]);
    expect(agg.teamEfficiencyScore).toBe(100);
  });

  it("is 0 when all tools are overpaying", () => {
    const agg = generateAggregateAudit([
      { tool: "ChatGPT", spend: 100, users: 1 },
      { tool: "Cursor", spend: 100, users: 1 },
    ]);
    expect(agg.teamEfficiencyScore).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Enhanced Recommendations — plan names
// ────────────────────────────────────────────────────────────────────────────
describe("enhanced recommendations plan names", () => {
  it("populates currentPlan and recommendedPlan with actual plan names", () => {
    const agg = generateAggregateAudit([{ tool: "ChatGPT", spend: 300, users: 1 }]);
    const rec = agg.enhancedRecommendations[0];
    expect(rec.currentPlan).toBe("Plus");
    expect(rec.recommendedPlan).toBe("Free");
    expect(rec.currentPlan).not.toBe("Current");
    expect(rec.recommendedPlan).not.toBe("Optimized");
  });

  it("recommends the cheapest ELIGIBLE plan by name (Cursor Individual → Hobby)", () => {
    const agg = generateAggregateAudit([{ tool: "Cursor", spend: 100, users: 1 }]);
    const rec = agg.enhancedRecommendations[0];
    expect(rec.recommendedPlan).toBe("Hobby");
  });

  it("does not emit an enhanced recommendation for org tiers with no replacement", () => {
    // Cursor Business with no eligible lower-cost replacement → savings 0 → no rec.
    const agg = generateAggregateAudit([{ tool: "Cursor", spend: 280, users: 7 }]);
    expect(agg.enhancedRecommendations).toHaveLength(0);
  });

  it("returns empty plan names for invalid inputs", () => {
    const result = generateAudit("ChatGPT", 0, 0);
    expect(result.currentPlan).toBe("");
    expect(result.recommendedPlan).toBe("");
  });

  it("returns empty plan names for unknown tools", () => {
    const result = generateAudit("UnknownTool", 100, 1);
    expect(result.currentPlan).toBe("");
    expect(result.recommendedPlan).toBe("");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Seat Handling — spend is total, not per-seat
// ────────────────────────────────────────────────────────────────────────────
describe("seat handling", () => {
  it("treats spend as total organization cost, not per-seat", () => {
    // 5 users, total spend $100 → $20/user → ChatGPT Plus.
    // Free ($0) is an eligible downgrade from Plus (individual) → savings $100.
    const result = generateAudit("ChatGPT", 100, 5);
    expect(result.currentPlan).toBe("Plus");
    expect(result.optimizedSpend).toBe(0);
    expect(result.savings).toBe(100);
  });

  it("scales optimized cost linearly with seat count for an individual tier", () => {
    // $20/seat for both: 20/1 and 100/5 → both detected on Individual ($20),
    // eligible cheaper tier is Hobby ($0) → optimized cost scales to $0.
    const oneSeat = generateAudit("Cursor", 20, 1);
    const fiveSeats = generateAudit("Cursor", 100, 5);
    expect(oneSeat.optimizedSpend).toBe(0);
    expect(fiveSeats.optimizedSpend).toBe(0);
  });

  it("an org (business) tier does not silently fall to a free tier across seats", () => {
    // Copilot $100/5 → $20/seat → detected Business ($19, org) → Free is NOT eligible.
    const result = generateAudit("Copilot", 100, 5);
    expect(result.currentPlan).toBe("Business");
    expect(result.recommendedPlan).toBe("");
    expect(result.savings).toBe(0);
  });

  it("excludes Business plan when below minimum users, falling to an eligible tier", () => {
    // Copilot Business requires min 5 users. With 3 seats, Business is excluded;
    // $100/3 ≈ $33/seat → detected Pro+ (individual, power) → eligible Pro.
    const result = generateAudit("Copilot", 100, 3);
    expect(result.currentPlan).toBe("Pro+");
    expect(result.recommendedPlan).toBe("Pro");
    expect(result.optimizedSpend).toBe(30); // Pro × 3
    expect(result.savings).toBe(70);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Plan Eligibility — minUsers filtering
// ────────────────────────────────────────────────────────────────────────────
describe("plan eligibility", () => {
  it("excludes plans with minUsers exceeding user count and downgrades within segment", () => {
    // ChatGPT $100/1: Team(min 2)/Enterprise(min 10) excluded → Plus eligible.
    const result = generateAudit("ChatGPT", 100, 1);
    expect(result.currentPlan).toBe("Plus");
    expect(result.recommendedPlan).toBe("Free");
    expect(result.optimizedSpend).toBe(0);
    expect(result.savings).toBe(100);
  });

  it("keeps org tiers from bouncing to consumer tiers even when seats qualify", () => {
    // ChatGPT $100/2 → org detected, plus the org guard blocks Plus/Free.
    const result = generateAudit("ChatGPT", 100, 2);
    expect(result.currentPlan).toBe("Business Standard");
    expect(result.savings).toBe(0);
    expect(result.recommendedPlan).toBe("");
  });

  it("excludes Enterprise plans for small teams", () => {
    // Cursor Enterprise (min 10) excluded for 5 users; $400/5=$80/seat → Business (org).
    const result = generateAudit("Cursor", 400, 5);
    expect(result.currentPlan).toBe("Business");
    expect(result.savings).toBe(0); // no eligible lower-cost replacement
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Savings Calculation — mathematical consistency
// ────────────────────────────────────────────────────────────────────────────
describe("savings calculation consistency", () => {
  it("savings = currentSpend - optimizedSpend for every tool", () => {
    const tools = [
      { tool: "ChatGPT", spend: 300, users: 1 },
      { tool: "Cursor", spend: 200, users: 5 },
      { tool: "Claude", spend: 50, users: 2 },
      { tool: "Copilot", spend: 500, users: 1 },
      { tool: "Gemini", spend: 20, users: 1 },
    ];

    for (const t of tools) {
      const result = generateAudit(t.tool, t.spend, t.users);
      expect(result.savings).toBe(result.currentSpend - result.optimizedSpend);
    }
  });

  it("savings is never negative", () => {
    const tools = [
      { tool: "ChatGPT", spend: 1, users: 1000 },
      { tool: "Cursor", spend: 0.01, users: 1 },
      { tool: "Claude", spend: 5000, users: 1 },
    ];

    for (const t of tools) {
      const result = generateAudit(t.tool, t.spend, t.users);
      expect(result.savings).toBeGreaterThanOrEqual(0);
    }
  });

  it("savings is never greater than current spend", () => {
    const tools = [
      { tool: "ChatGPT", spend: 500, users: 10 },
      { tool: "Cursor", spend: 10000, users: 50 },
      { tool: "Claude", spend: 1, users: 1 },
    ];

    for (const t of tools) {
      const result = generateAudit(t.tool, t.spend, t.users);
      expect(result.savings).toBeLessThanOrEqual(result.currentSpend);
    }
  });

  it("aggregate savings = sum of individual tool savings", () => {
    const inputs = [
      { tool: "ChatGPT", spend: 300, users: 1 },
      { tool: "Cursor", spend: 400, users: 10 },
      { tool: "Claude", spend: 200, users: 1 },
    ];
    const agg = generateAggregateAudit(inputs);
    const sumIndividual = agg.tools.reduce((s, t) => s + t.savings, 0);
    expect(agg.totalSavings).toBe(sumIndividual);
  });

  it("annual savings = monthly savings × 12", () => {
    const agg = generateAggregateAudit([
      { tool: "ChatGPT", spend: 300, users: 1 },
      { tool: "Cursor", spend: 400, users: 10 },
    ]);
    expect(agg.totalAnnualSavings).toBe(agg.totalSavings * 12);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Optimization Score
// ────────────────────────────────────────────────────────────────────────────
describe("optimization score", () => {
  it("returns 100 when there are no savings (fully optimized)", () => {
    const result = generateAudit("OpenAI API", 50, 1);
    expect(result.optimizationScore).toBe(100);
  });

  it("returns 0 when savings equal current spend (fully overpaying)", () => {
    const result = generateAudit("ChatGPT", 100, 1);
    expect(result.optimizationScore).toBe(0);
  });

  it("returns 100 for a paid tier with no eligible lower-cost replacement", () => {
    // Cursor Business org tier with no valid replacement → savings 0 → score 100.
    const result = generateAudit("Cursor", 280, 7);
    expect(result.savings).toBe(0);
    expect(result.optimizationScore).toBe(100);
  });

  it("aggregate score is calculated from total savings, not tool average", () => {
    const agg = generateAggregateAudit([
      { tool: "ChatGPT", spend: 100, users: 1 }, // savings 100 → score 0
      { tool: "OpenAI API", spend: 50, users: 1 }, // 0% savings → score 100
    ]);
    // totalSpend=150, totalSavings=100 → score = 100 - (100/150)*100 ≈ 33.33
    expect(agg.overallOptimizationScore).toBeCloseTo(33.33, 1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Status Thresholds — Overpaying > $20, Optimization Available > $5
// (Using ChatGPT detected on Plus, so savings scale with spend for 1 user.)
// ────────────────────────────────────────────────────────────────────────────
describe("status thresholds", () => {
  it("marks as Optimized when savings <= $5", () => {
    // ChatGPT $5/1 → closest plan is Free → already on cheapest → savings $0.
    const result = generateAudit("ChatGPT", 5, 1);
    expect(result.savings).toBe(0);
    expect(result.status).toBe("Optimized");
  });

  it("marks as Optimization Available when savings is $6-$20", () => {
    // ChatGPT $15/1 → detected Plus → eligible Free → savings $15.
    const result = generateAudit("ChatGPT", 15, 1);
    expect(result.savings).toBe(15);
    expect(result.status).toBe("Optimization Available");
  });

  it("marks as Overpaying when savings > $20", () => {
    // ChatGPT $21/1 → detected Plus → eligible Free → savings $21.
    const result = generateAudit("ChatGPT", 21, 1);
    expect(result.savings).toBe(21);
    expect(result.status).toBe("Overpaying");
  });

  it("boundaries: exactly $20 is Optimization Available, $21 is Overpaying", () => {
    // ChatGPT $20/1 → detected Plus → savings $20 → Optimization Available.
    const at20 = generateAudit("ChatGPT", 20, 1);
    expect(at20.savings).toBe(20);
    expect(at20.status).toBe("Optimization Available");

    // $21 → savings $21 → Overpaying (21 > 20).
    const at21 = generateAudit("ChatGPT", 21, 1);
    expect(at21.savings).toBe(21);
    expect(at21.status).toBe("Overpaying");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Usage-based API tools — no invented subscription optimization
// ────────────────────────────────────────────────────────────────────────────
describe("usage-based API tools", () => {
  it("never claims a fixed-price savings estimate for usage-based APIs", () => {
    // API is usage-based: price 0 by design means "usage-based", not a verified
    // $0/mo. The engine must NOT fabricate a "Volume Pricing" 15% discount.
    const result = generateAudit("OpenAI API", 500, 1);
    expect(result.savings).toBe(0);
    expect(result.status).toBe("Optimized");
    expect(result.recommendedPlan).toBe("");
  });

  it("returns no enhanced recommendation for usage-based APIs", () => {
    const agg = generateAggregateAudit([{ tool: "Anthropic API", spend: 300, users: 1 }]);
    expect(agg.enhancedRecommendations).toHaveLength(0);
  });

  it("explains that API savings require usage data rather than being blank", () => {
    const result = generateAudit("OpenAI API", 50, 1);
    expect(result.savings).toBe(0);
    // The recommendation must not be empty: it should clearly state the tool is
    // usage-based and that savings need actual usage/cost data (no fabrication).
    expect(result.recommendation).toContain("usage");
    expect(result.recommendation).not.toBe("");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ────────────────────────────────────────────────────────────────────────────
describe("edge cases", () => {
  it("$0 spend returns Optimized with no savings", () => {
    const result = generateAudit("ChatGPT", 0, 5);
    expect(result.status).toBe("Optimized");
    expect(result.savings).toBe(0);
    expect(result.optimizationScore).toBe(100);
  });

  it("an already-cheapest plan shows $0 savings", () => {
    // ChatGPT Free ($0) for 1 user → already on cheapest eligible → $0 savings.
    const result = generateAudit("ChatGPT", 0, 1);
    expect(result.savings).toBe(0);
    expect(result.status).toBe("Optimized");
  });

  it("unknown tools are treated as optimized with no savings", () => {
    const result = generateAudit("NonexistentTool", 100, 5);
    expect(result.status).toBe("Optimized");
    expect(result.savings).toBe(0);
    expect(result.optimizationScore).toBe(100);
  });

  it("very large spend produces valid results constrained by in-segment eligibility", () => {
    const result = generateAudit("ChatGPT", 1_000_000, 50);
    // $20,000/seat → detected Business Premium (org). The org guard blocks a drop
    // to Plus/Free, but Business Standard is the SAME segment and cheaper → valid.
    expect(result.currentPlan).toBe("Business Premium");
    expect(result.recommendedPlan).toBe("Business Standard");
    expect(result.savings).toBe(1_000_000 - 25 * 50); // 998,750
  });

  it("empty aggregate has zero totals and score 100", () => {
    const agg = generateAggregateAudit([]);
    expect(agg.totalCurrentSpend).toBe(0);
    expect(agg.totalOptimizedSpend).toBe(0);
    expect(agg.totalSavings).toBe(0);
    expect(agg.totalAnnualSavings).toBe(0);
    expect(agg.overallOptimizationScore).toBe(100);
    expect(agg.savingsRate).toBe(0);
    expect(agg.teamEfficiencyScore).toBe(100);
  });

  it("includes $0 free plans in aggregate as already-optimized tools", () => {
    // A genuine free plan is valid, not an empty/invalid input. It must surface
    // as an Optimized $0 tool (contributing nothing) rather than being silently
    // dropped into a confusing "No tools provided" state.
    const agg = generateAggregateAudit([
      { tool: "ChatGPT", spend: 0, users: 5 },
      { tool: "Cursor", spend: 100, users: 1 },
    ]);
    expect(agg.tools.length).toBe(2);
    const free = agg.tools.find((t) => t.tool === "ChatGPT");
    expect(free?.status).toBe("Optimized");
    expect(free?.savings).toBe(0);
    expect(free?.currentSpend).toBe(0);
    expect(agg.totalCurrentSpend).toBe(100);
  });

  it("negative spend is treated as invalid input", () => {
    const result = generateAudit("ChatGPT", -100, 5);
    expect(result.status).toBe("Optimized");
    expect(result.savings).toBe(0);
    expect(result.currentSpend).toBe(0); // clamped, no negative spend leaks
  });

  it("free plan reports a clear no-cost-to-optimize recommendation", () => {
    // Scenario F: a $0 free plan is a valid result, never a misleading
    // "No tools provided" state and never reports negative/phony savings.
    const agg = generateAggregateAudit([{ tool: "Claude", spend: 0, users: 1 }]);
    expect(agg.tools).toHaveLength(1);
    expect(agg.tools[0].status).toBe("Optimized");
    expect(agg.tools[0].savings).toBe(0);
    expect(agg.totalSavings).toBe(0);
    expect(agg.tools[0].recommendation).toContain("free plan");
    expect(agg.summary).not.toContain("No tools provided");
  });

  it("duplicate tool entries are merged so savings are never double-counted", () => {
    // The same product listed twice is the same subscription surface. Auditing
    // each row independently would claim a Free downgrade on both and inflate
    // savings (100 + 200 = 300). Merging spend + seats into one tool audits the
    // combined 2 seats once: $150/seat detects Business Premium with Business
    // Standard as the only eligible (same-segment) downgrade → savings 250.
    const agg = generateAggregateAudit([
      { tool: "ChatGPT", spend: 100, users: 1 },
      { tool: "ChatGPT", spend: 200, users: 1 },
    ]);
    expect(agg.tools.length).toBe(1);
    expect(agg.tools[0].currentSpend).toBe(300);
    expect(agg.totalCurrentSpend).toBe(300);
    expect(agg.totalSavings).toBe(250);
    // The two duplicated rows can never claim 2 × consumer "Free" downgrades.
    expect(agg.totalSavings).not.toBe(300);
  });

  it("merges duplicates across three rows including an explicit plan", () => {
    const agg = generateAggregateAudit([
      { tool: "Cursor", spend: 40, users: 1, plan: "Business" },
      { tool: "Cursor", spend: 60, users: 1 },
      { tool: "Cursor", spend: 20, users: 1 },
    ]);
    expect(agg.tools.length).toBe(1);
    // $60/seat at 3 seats → Business (org): no consumer replacement.
    expect(agg.tools[0].currentSpend).toBe(120);
    expect(agg.tools[0].savings).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CurrentPlan Detection Heuristic
// ────────────────────────────────────────────────────────────────────────────
describe("currentPlan detection", () => {
  it("detects closest plan by cost per seat", () => {
    // ChatGPT: spend=$20/user → matches Plus ($20).
    const result = generateAudit("ChatGPT", 20, 1);
    expect(result.currentPlan).toBe("Plus");
    expect(result.recommendedPlan).toBe("Free");
  });

  it("detects closest plan for org teams and reports no ineligible downgrade", () => {
    // Cursor: spend=$400, users=10 → $40/seat → matches Business ($40, org).
    const result = generateAudit("Cursor", 400, 10);
    expect(result.currentPlan).toBe("Business");
    expect(result.recommendedPlan).toBe("");
    expect(result.savings).toBe(0);
  });

  it("handles spend between two individual plan prices", () => {
    // Copilot: $25/user → between Pro ($10) and Pro+ ($39), nearest Pro+.
    const result = generateAudit("Copilot", 25, 1);
    expect(result.currentPlan).toBe("Pro+");
  });

  it("returns empty currentPlan for invalid inputs", () => {
    const result = generateAudit("ChatGPT", 0, 0);
    expect(result.currentPlan).toBe("");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Annual variants are billing variants of the same plan — report-only
// ────────────────────────────────────────────────────────────────────────────
describe("annual variants are report-only", () => {
  it("optimizes against the MONTHLY cadence, never surfacing the cheaper annual variant", () => {
    // Anthropic Pro monthly = $20, annual variant = $17 (same plan "Pro"). The
    // engine default cadence is MONTHLY, so an overpaying Pro→(eligible) result
    // must never pick "$17" as the recommended plan or cost.
    const result = generateAudit("Claude", 200, 1);
    // Detected Max 20x (power) → eligible Pro (monthly $20, not $17).
    expect(result.recommendedPlan).toBe("Pro");
    expect(result.optimizedSpend).toBe(20);
  });

  it("never recommends an annual-cadence plan in an audit", () => {
    // OpenAI/Anthropic have VERIFIED ANNUAL variants sharing the same plan name.
    // No audit recommendation may resolve to an ANNUAL cadence.
    const tools = ["ChatGPT", "Claude", "Copilot", "Cursor"];
    for (const tool of tools) {
      const result = generateAudit(tool, 200, 4);
      expect(result.recommendedPlan.endsWith("(annual)")).toBe(false);
      expect(result.currentPlan.endsWith("(annual)")).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Canonical plan names in the UI (single source of truth)
// ────────────────────────────────────────────────────────────────────────────
describe("canonical plan names in the UI", () => {
  it("derives plan lists from the pricing catalog helper", () => {
    expect(getToolPlanNames("Cursor")).toEqual(TOOL_PLAN_NAMES.Cursor);
  });

  it("exposes the current catalog plan names per tool", () => {
    expect(TOOL_PLAN_NAMES.Cursor).toEqual(["Hobby", "Individual", "Business", "Enterprise"]);
    expect(TOOL_PLAN_NAMES.Windsurf).toEqual(["Hobby", "Individual", "Business", "Enterprise"]);
    expect(TOOL_PLAN_NAMES.Copilot).toEqual(["Free", "Pro", "Pro+", "Max", "Business", "Enterprise"]);
    expect(TOOL_PLAN_NAMES.Gemini).toEqual(["Free", "Pro", "Ultra"]);
  });

  it("drops retired and cross-product aliases from the form plan lists (display-only)", () => {
    // Cursor "Pro" was a pre-verification alias; the verified plan is "Individual".
    expect(TOOL_PLAN_NAMES.Cursor).not.toContain("Pro");
    // Copilot "Individual" baseline closed when the verified Pro $10 launched.
    expect(TOOL_PLAN_NAMES.Copilot).not.toContain("Individual");
    // ChatGPT "Team" was folded into the Business tiers; API is a separate product.
    expect(TOOL_PLAN_NAMES.ChatGPT).not.toContain("Team");
    expect(TOOL_PLAN_NAMES.ChatGPT).not.toContain("API");
    expect(TOOL_PLAN_NAMES.ChatGPT).toEqual(["Free", "Plus", "Business Standard", "Business Premium", "Enterprise"]);
    // Claude adds the Max 20x tier and never conflates the API product with a plan.
    expect(TOOL_PLAN_NAMES.Claude).toContain("Max 20x");
    expect(TOOL_PLAN_NAMES.Claude).not.toContain("API");
    // API tools expose their usage billing, not a SaaS plan list.
    expect(TOOL_PLAN_NAMES["OpenAI API"]).toEqual(["Pay-as-you-go"]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// User-selected plan drives the current tier (no mis-detection)
// ────────────────────────────────────────────────────────────────────────────
describe("selected plan overrides spend/seat detection", () => {
  it("displays a custom Cursor Enterprise tier as Enterprise (never Business)", () => {
    // An $800/mo, 10-seat Cursor setup on Enterprise was previously misdetected
    // as "Business" with a misleading zero-savings plan line. A selected
    // Enterprise (custom, contact-sales) tier must display as Enterprise with
    // no fabricated savings.
    const result = generateAudit("Cursor", 800, 10, undefined, "Enterprise");
    expect(result.currentPlan).toBe("Enterprise");
    expect(result.recommendedPlan).toBe("");
    expect(result.savings).toBe(0);
    expect(result.status).toBe("Optimized");
    expect(result.recommendation).toContain("Cursor setup (Enterprise)");
    expect(result.recommendation).toMatch(/custom \(contact-sales\)/);
  });

  it("keeps a selected priced plan that is present and seat-valid", () => {
    // Copilot $100/mo at 3 seats would be detected as Pro+; an explicit Pro
    // selection is honored instead.
    const result = generateAudit("Copilot", 100, 3, undefined, "Pro");
    expect(result.currentPlan).toBe("Pro");
    expect(result.recommendedPlan).toBe("Free");
    expect(result.savings).toBe(100);
  });

  it("falls back to detection when the selected plan has an unmet seat minimum", () => {
    // Claude Team requires 2 seats; at 1 seat the selection is not honored.
    const result = generateAudit("Claude", 123, 1, undefined, "Team");
    expect(result.currentPlan).not.toBe("Team");
    expect(result.currentPlan).toBe("Max");
    expect(result.recommendedPlan).toBe("Pro");
  });

  it("ignores an unknown plan name and uses detection", () => {
    const result = generateAudit("ChatGPT", 20, 1, undefined, "Not a Real Plan");
    expect(result.currentPlan).toBe("Plus");
    expect(result.recommendedPlan).toBe("Free");
  });

  it("passes the selected plan through aggregate audits per tool", () => {
    const agg = generateAggregateAudit([
      { tool: "Cursor", spend: 800, users: 10, plan: "Enterprise" },
      { tool: "ChatGPT", spend: 100, users: 1, plan: "Plus" },
      { tool: "Claude", spend: 250, users: 1 },
    ]);
    const cursor = agg.tools.find((t) => t.tool === "Cursor");
    const chatgpt = agg.tools.find((t) => t.tool === "ChatGPT");
    expect(cursor?.currentPlan).toBe("Enterprise");
    expect(cursor?.savings).toBe(0);
    expect(chatgpt?.currentPlan).toBe("Plus");
    expect(chatgpt?.recommendedPlan).toBe("Free");
  });
});