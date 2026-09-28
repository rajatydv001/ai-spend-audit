import { describe, it, expect } from "vitest";
import { generatePdfReport } from "@/lib/pdf-export";
import { generateAggregateAudit } from "@/lib/audit-engine";

/** Every /stream.../endstream block (jsPDF 4 writes these uncompressed), joined in order. */
function streamText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const re = /\nstream\s*\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) chunks.push(match[1]);
  return chunks.join("\n");
}

/**
 * jsPDF/autotable emit each text run as parenthesized Tj/TJ tokens and split
 * paragraphs across tokens, so join every token with a space and collapse
 * whitespace to recover readable text for substring assertions.
 */
function normalizedText(buffer: Buffer): string {
  const all = streamText(buffer);
  const tokens: string[] = [];
  const paren = /\(((?:[^()\\]|\\.)*)\)/g;
  let p: RegExpExecArray | null;
  while ((p = paren.exec(all)) !== null) {
    tokens.push(p[1].replace(/\\(.)/g, "$1"));
  }
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

function countPages(buffer: Buffer): number {
  return buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

async function render(
  result: ReturnType<typeof generateAggregateAudit>,
  meta?: Parameters<typeof generatePdfReport>[1]
): Promise<{ text: string; pages: number }> {
  const blob = await generatePdfReport(result, meta);
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { text: normalizedText(bytes), pages: countPages(bytes) };
}

describe("PDF report — zero-savings audit (Claude Pro $200 / 5 seats)", () => {
  it("shows truthful zero figures and no fabricated recommendation", async () => {
    const result = generateAggregateAudit([{ tool: "Claude", spend: 200, users: 5, plan: "Pro" }]);
    expect(result.totalSavings).toBe(0);
    expect(result.totalOptimizedSpend).toBe(200);
    expect(result.overallOptimizationScore).toBe(100);

    const { text, pages } = await render(result, { reportId: "claudetest", organizationName: "Acme Corp" });

    expect(text).toContain("AI Spend Optimization Report");
    expect(text).toContain("Acme Corp");
    expect(text).toContain("$200");
    expect(text).toContain("$0");
    expect(text).toContain("/mo");
    expect(text).toContain("/yr");
    expect(text).toContain("NO VERIFIED SAVINGS OPPORTUNITY");
    expect(text).toContain("Optimized");
    expect(text).toContain("No verified change");
    expect(text).toContain("Page 1 of");

    expect(text).not.toContain("2,400");
    expect(text).not.toContain("2400");
    expect(text).not.toContain("100%");
    expect(text).not.toContain("Switch to");

    expect(pages).toBeGreaterThanOrEqual(2);
  });
});

describe("PDF report — positive-savings audit (Copilot Enterprise $780 / 20 seats)", () => {
  it("renders the exact persisted savings numbers and recommendation", async () => {
    const result = generateAggregateAudit([{ tool: "Copilot", spend: 780, users: 20 }]);
    expect(result.totalSavings).toBe(400);
    expect(result.totalOptimizedSpend).toBe(380);
    expect(result.totalAnnualSavings).toBe(4800);
    expect(result.savingsRate).toBe(51);

    const { text } = await render(result);

    expect(text).toContain("$400");
    expect(text).toContain("$380");
    expect(text).toContain("$4,800");
    expect(text).toContain("VERIFIED SAVINGS · $400/mo · $4,800/yr");
    expect(text).toContain("Switch to the Business plan");
    expect(text).toContain("Estimated savings: $400/mo");
    expect(text).toContain("SAVE $400/mo");

    expect(text).not.toContain("NO VERIFIED SAVINGS OPPORTUNITY");
    expect(text).not.toContain("100%");
  });
});

describe("PDF report — multiple tools & pagination", () => {
  it("renders every tool with no dropped content", async () => {
    const result = generateAggregateAudit([
      { tool: "Claude", spend: 200, users: 1 },
      { tool: "Copilot", spend: 780, users: 20 },
      { tool: "Cursor", spend: 280, users: 7 },
      { tool: "ChatGPT", spend: 100, users: 2 },
      { tool: "OpenAI API", spend: 50, users: 1 },
    ]);
    const { text } = await render(result);

    for (const tool of ["Claude", "Copilot", "Cursor", "ChatGPT", "OpenAI API"]) {
      expect(text).toContain(tool);
    }
    expect(text).toContain("Verified Savings");
    expect(text).toContain("Optimization Score");
    expect(text).toContain("M e t h o d o l o g y");
  });

  it("handles all 9 catalog tools across multiple pages with consistent footers", async () => {
    const result = generateAggregateAudit([
      { tool: "ChatGPT", spend: 1250, users: 10, plan: "Business Premium" },
      { tool: "ChatGPT", spend: 200, users: 10, plan: "Plus" },
      { tool: "Claude", spend: 200, users: 5, plan: "Pro" },
      { tool: "Claude", spend: 500, users: 10, plan: "Team" },
      { tool: "Copilot", spend: 780, users: 20, plan: "Enterprise" },
      { tool: "Copilot", spend: 100, users: 10, plan: "Pro" },
      { tool: "Cursor", spend: 280, users: 7, plan: "Business" },
      { tool: "Gemini", spend: 200, users: 10, plan: "Pro" },
      { tool: "Windsurf", spend: 200, users: 5, plan: "Individual" },
      { tool: "OpenAI API", spend: 300, users: 1 },
      { tool: "Anthropic API", spend: 340, users: 1 },
      { tool: "Claude API", spend: 120, users: 1 },
    ]);
    expect(result.tools.length).toBeGreaterThanOrEqual(9);

    const { text, pages } = await render(result);
    expect(pages).toBeGreaterThanOrEqual(2);

    for (const tool of result.tools) {
      expect(text).toContain(tool.tool);
    }

    const pageRefs = Array.from(text.matchAll(/Page (\d+) of (\d+)/g));
    expect(pageRefs.length).toBe(pages);
    expect(pageRefs.every((r) => Number(r[2]) === pages)).toBe(true);
    expect(new Set(pageRefs.map((r) => Number(r[1]))).size).toBe(pages);
  });
});

describe("PDF report — long text", () => {
  it("renders long engine explanations without disappearing content", async () => {
    const result = generateAggregateAudit([
      { tool: "Claude", spend: 200, users: 5, plan: "Pro" },
      { tool: "Anthropic API", spend: 340, users: 1 },
      { tool: "Claude API", spend: 120, users: 1 },
    ]);
    expect(result.totalSavings).toBe(0);

    const { text, pages } = await render(result);
    expect(pages).toBeGreaterThanOrEqual(2);

    for (const tool of ["Claude", "Anthropic API", "Claude API"]) {
      expect(text).toContain(tool);
    }
    expect(text).toContain("No verified lower-cost replacement found");
    expect(text).toContain("billed on usage (pay-as-you-go)");
    expect(text).toContain("Confidential");
    expect(text).toContain("Generated");
    expect(text).toContain("Page 1 of");
  });
});

describe("PDF report — footer & page numbers", () => {
  it("renders the footer and correct Page X of Y on every page", async () => {
    const result = generateAggregateAudit([
      { tool: "Claude", spend: 200, users: 1 },
      { tool: "Copilot", spend: 780, users: 20 },
    ]);
    const { text, pages } = await render(result);

    const pageRefs = Array.from(text.matchAll(/Page (\d+) of (\d+)/g)).map((m) => ({
      page: Number(m[1]),
      total: Number(m[2]),
    }));
    expect(pageRefs.length).toBe(pages);
    expect(pageRefs.every((r) => r.total === pages)).toBe(true);
    expect(new Set(pageRefs.map((r) => r.page)).size).toBe(pages);

    expect(occurrences(text, "Confidential")).toBeGreaterThanOrEqual(pages);
    expect(occurrences(text, "AI Spend Audit")).toBeGreaterThanOrEqual(pages);
  });
});