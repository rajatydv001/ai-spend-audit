import { describe, it, expect } from "vitest";
import { formatSavingsRatePercent } from "@/components/savings-rate-format";
import { generateAggregateAudit } from "@/lib/audit-engine";

describe("formatSavingsRatePercent (homepage Savings Rate metric)", () => {
  it("renders an already-percentage savingsRate without re-multiplying by 100", () => {
    expect(formatSavingsRatePercent(0)).toBe("0");
    expect(formatSavingsRatePercent(51)).toBe("51");
    expect(formatSavingsRatePercent(100)).toBe("100");
  });

  it("does not turn 51 into 5100 (regression)", () => {
    expect(formatSavingsRatePercent(51)).not.toBe("5100");
    expect(formatSavingsRatePercent(51)).not.toContain("5100");
  });

  it("rounds fractional percentage inputs to whole percents", () => {
    expect(formatSavingsRatePercent(51.282)).toBe("51");
  });

  it("matches the engine contract so the homepage shows the real rate (51 not 5100)", () => {
    // Copilot Enterprise $780/20 → verified Business $380 → savings $400/mo.
    // savingsRate is ALREADY a 0-100 percentage (400/780 → 51).
    const agg = generateAggregateAudit([{ tool: "Copilot", spend: 780, users: 20 }]);
    expect(agg.savingsRate).toBe(51);
    expect(formatSavingsRatePercent(agg.savingsRate)).toBe("51");
  });
});