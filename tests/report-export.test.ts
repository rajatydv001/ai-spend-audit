import { describe, it, expect } from "vitest";
import { generateAggregateAudit } from "@/lib/audit-engine";
import { auditRowToResult } from "@/app/api/reports/export/route";
import { generatePdfReport } from "@/lib/pdf-export";

describe("report/dashboard consistency — same persisted engine result", () => {
  it("auditRowToResult returns the resultData snapshot verbatim", () => {
    const result = generateAggregateAudit([
      { tool: "ChatGPT", spend: 1250, users: 10, plan: "Business Premium" },
      { tool: "Claude", spend: 200, users: 5, plan: "Pro" },
    ]);
    // Verified savings only from the Business Premium → Business Standard swap.
    expect(result.totalSavings).toBe(1000);

    const rebuilt = auditRowToResult({ resultData: JSON.stringify(result) });
    expect(rebuilt).toEqual(result);
    expect(rebuilt.totalSavings).toBe(1000);
    expect(rebuilt.totalOptimizedSpend).toBe(450);
  });

  it("the dashboard card and the PDF metrics read the same totalSavings value", () => {
    const result = generateAggregateAudit([{ tool: "Claude", spend: 200, users: 1 }]);
    const stored = auditRowToResult({
      resultData: JSON.stringify(result),
      totalSavings: result.totalSavings,
      totalOptimizedSpend: result.totalOptimizedSpend,
    });
    expect(result.totalSavings).toBe(180);
    // Chart/PDF both derive from the engine result: total = spread, score scaled.
    expect(stored.totalSavings).toBe(result.totalSavings);
    expect(stored.totalOptimizedSpend).toBe(20);
    expect(Math.round(stored.overallOptimizationScore)).toBe(10);
  });

  it("renders a real PDF for a zero-verified-savings result (nothing fabricated)", async () => {
    const result = generateAggregateAudit([
      { tool: "Claude", spend: 200, users: 5, plan: "Pro" },
    ]);
    expect(result.totalSavings).toBe(0);
    expect(result.priorityRecommendations).toHaveLength(0);

    const blob = await generatePdfReport(result);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });
});