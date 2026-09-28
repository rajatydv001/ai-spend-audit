import { describe, it, expect } from "vitest";
import { generatePdfReport } from "@/lib/pdf-export";
import { generateAggregateAudit } from "@/lib/audit-engine";

/**
 * Layout-level guarantees for the rendered PDF: every text and vector operator
 * must sit inside the A4 page box, headings must never be stranded, footers and
 * page numbering must be correct, and every number shown must be the persisted
 * engine value.
 *
 * Glyph advances come from the standard-14 Helvetica metrics that the renderer
 * writes with, so a run's inked extent is measured rather than assumed.
 */

const A4_W = 595.2755905511812;
const A4_H = 841.8897637795276;
const PT_PER_MM = A4_W / 210;

const HELVETICA: Record<number, number> = {
  32: 280, 33: 280, 34: 350, 35: 550, 36: 550, 37: 890, 38: 660, 39: 190, 40: 330, 41: 330,
  42: 390, 43: 580, 44: 280, 45: 330, 46: 280, 47: 280, 48: 550, 49: 550, 50: 550, 51: 550,
  52: 550, 53: 550, 54: 550, 55: 550, 56: 550, 57: 550, 58: 280, 59: 280, 60: 580, 61: 580,
  62: 580, 63: 550, 64: 1010, 65: 660, 66: 660, 67: 720, 68: 720, 69: 660, 70: 610, 71: 780,
  72: 720, 73: 280, 74: 500, 75: 660, 76: 550, 77: 830, 78: 720, 79: 780, 80: 660, 81: 780,
  82: 720, 83: 660, 84: 610, 85: 720, 86: 660, 87: 940, 88: 660, 89: 660, 90: 610, 91: 280,
  92: 280, 93: 280, 94: 470, 95: 550, 96: 330, 97: 550, 98: 550, 99: 500, 100: 550, 101: 550,
  102: 280, 103: 550, 104: 550, 105: 220, 106: 220, 107: 500, 108: 220, 109: 830, 110: 550,
  111: 550, 112: 550, 113: 550, 114: 330, 115: 500, 116: 280, 117: 550, 118: 500, 119: 720,
  120: 500, 121: 500, 122: 500, 123: 330, 124: 260, 125: 330, 126: 580, 183: 280,
};

const HELVETICA_BOLD: Record<number, number> = {
  32: 280, 33: 330, 34: 470, 35: 550, 36: 550, 37: 890, 38: 720, 39: 240, 40: 330, 41: 330,
  42: 390, 43: 580, 44: 280, 45: 330, 46: 280, 47: 280, 48: 550, 49: 550, 50: 550, 51: 550,
  52: 550, 53: 550, 54: 550, 55: 550, 56: 550, 57: 550, 58: 330, 59: 330, 60: 580, 61: 580,
  62: 580, 63: 610, 64: 970, 65: 720, 66: 720, 67: 720, 68: 720, 69: 660, 70: 610, 71: 780,
  72: 720, 73: 280, 74: 550, 75: 720, 76: 610, 77: 830, 78: 720, 79: 780, 80: 660, 81: 780,
  82: 720, 83: 660, 84: 610, 85: 720, 86: 660, 87: 940, 88: 660, 89: 660, 90: 610, 91: 330,
  92: 280, 93: 330, 94: 580, 95: 550, 96: 330, 97: 550, 98: 610, 99: 550, 100: 610, 101: 550,
  102: 330, 103: 610, 104: 610, 105: 280, 106: 280, 107: 550, 108: 280, 109: 890, 110: 610,
  111: 610, 112: 610, 113: 610, 114: 390, 115: 550, 116: 330, 117: 610, 118: 550, 119: 780,
  120: 550, 121: 550, 122: 500, 123: 390, 124: 280, 125: 390, 126: 580, 183: 280,
};

function textWidthPt(text: string, sizePt: number, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const char of text) {
    units += table[char.charCodeAt(0) & 0xff] ?? 550;
  }
  return (units / 1000) * sizePt;
}

interface TextItem {
  page: number;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  text: string;
}
interface BoxItem {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Map indirect objects to their raw body so /Contents refs can be resolved. */
function indexObjects(raw: string): Map<number, string> {
  const objects = new Map<number, string>();
  const re = /(\d+)\s+0\s+obj\b([\s\S]*?)\bendobj/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    objects.set(Number(match[1]), match[2]);
  }
  return objects;
}

function decodeLiteral(literal: string): string {
  let out = "";
  for (let i = 0; i < literal.length; i++) {
    if (literal[i] !== "\\") {
      out += literal[i];
      continue;
    }
    const next = literal[++i];
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next >= "0" && next <= "7") {
      let oct = next;
      while (oct.length < 3 && literal[i + 1] >= "0" && literal[i + 1] <= "7") oct += literal[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += next;
  }
  return out;
}

/** Extract per-page text runs and filled rectangles from the content streams. */
function inspectPdf(buffer: Buffer): { texts: TextItem[]; boxes: BoxItem[]; pages: number } {
  const raw = buffer.toString("latin1");
  const objects = indexObjects(raw);

  const pageRefs: number[] = [];
  for (const [, body] of objects) {
    if (/\/Type\s*\/Page(?!s)/.test(body)) {
      const contents = body.match(/\/Contents\s+(\d+)\s+0\s+R/);
      if (contents) pageRefs.push(Number(contents[1]));
    }
  }

  const texts: TextItem[] = [];
  const boxes: BoxItem[] = [];

  pageRefs.forEach((ref, pageIndex) => {
    const body = objects.get(ref) ?? "";
    const stream = body.match(/stream\s*\r?\n([\s\S]*?)\r?\nendstream/);
    if (!stream) return;
    const page = pageIndex + 1;
    const content = stream[1];

    let size = 0;
    let bold = false;
    let x = 0;
    let y = 0;

    const tokenRe = /\/(\w+)\s+([\d.]+)\s+Tf|([-\d.]+)\s+([-\d.]+)\s+Td|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+re|\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(content)) !== null) {
      if (match[1]) {
        size = Number(match[2]);
        bold = match[1] === "F2";
      } else if (match[3] !== undefined) {
        x = Number(match[3]);
        y = Number(match[4]);
      } else if (match[5] !== undefined) {
        const rx = Number(match[5]);
        const ry = Number(match[6]);
        const rw = Number(match[7]);
        const rh = Number(match[8]);
        boxes.push({ page, x: Math.min(rx, rx + rw), y: Math.min(ry, ry + rh), w: Math.abs(rw), h: Math.abs(rh) });
      } else if (match[9] !== undefined) {
        texts.push({ page, x, y, size, bold, text: decodeLiteral(match[9]) });
      }
    }
  });

  return { texts, boxes, pages: pageRefs.length };
}

function pageText(texts: TextItem[], page: number): string {
  return texts
    .filter((t) => t.page === page)
    .map((t) => t.text)
    .join(" ");
}

/** Whitespace-collapsed page text, for ordinary phrase assertions. */
function pageTextFlat(texts: TextItem[], page: number): string {
  return pageText(texts, page).replace(/\s+/g, " ");
}

interface Scenario {
  name: string;
  result: ReturnType<typeof generateAggregateAudit>;
  meta?: Parameters<typeof generatePdfReport>[1];
  expectPages: number;
}

const ZERO_SAVINGS: Scenario = {
  name: "zero-savings (Claude Pro $200 / 5 seats)",
  result: generateAggregateAudit([{ tool: "Claude", spend: 200, users: 5, plan: "Pro" }]),
  meta: { reportId: "claudetest", organizationName: "Acme Corp" },
  expectPages: 2,
};

const POSITIVE_SAVINGS: Scenario = {
  name: "positive-savings (Copilot Enterprise $780 / 20 seats)",
  result: generateAggregateAudit([{ tool: "Copilot", spend: 780, users: 20 }]),
  meta: { reportId: "positivetest", organizationName: "Northwind Holdings" },
  expectPages: 2,
};

const MULTI_TOOL: Scenario = {
  name: "multi-tool (9 catalog tools)",
  result: generateAggregateAudit([
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
  ]),
  meta: { reportId: "multitest", organizationName: "Acme Corp" },
  expectPages: 2,
};

const API_ONLY: Scenario = {
  name: "long text (usage-based tools only)",
  result: generateAggregateAudit([
    { tool: "Claude", spend: 200, users: 5, plan: "Pro" },
    { tool: "Anthropic API", spend: 340, users: 1 },
    { tool: "Claude API", spend: 120, users: 1 },
  ]),
  meta: { reportId: "longtexttest", organizationName: "Acme Corp" },
  expectPages: 2,
};

/**
 * The exact report under review: Cursor $2,334 (7 seats, Business) plus
 * Claude $1,234 (10 seats, Team) verifies no savings, so it must still render
 * as a complete, self-consistent two-page document.
 */
const REVIEWED_REPORT: Scenario = {
  name: "reviewed report (Cursor $2,334 / Claude $1,234, no verified savings)",
  result: generateAggregateAudit([
    { tool: "Cursor", spend: 2334, users: 7, plan: "Business" },
    { tool: "Claude", spend: 1234, users: 10, plan: "Team" },
  ]),
  meta: { reportId: "reviewedtest", organizationName: "ClaudeCorp" },
  expectPages: 2,
};

/** Real-world magnitude regression: five-figure tool spend must render verbatim. */
const LARGE_VALUES: Scenario = {
  name: "large per-tool spend (Cursor $2,334 / Claude $1,234)",
  result: generateAggregateAudit([
    { tool: "Cursor", spend: 2334, users: 7, plan: "Business" },
    { tool: "Claude", spend: 1234, users: 10, plan: "Team" },
    { tool: "Copilot", spend: 45678, users: 200, plan: "Enterprise" },
  ]),
  meta: { reportId: "largetest", organizationName: "Acme Corp" },
  expectPages: 2,
};

const SCENARIOS: Scenario[] = [
  REVIEWED_REPORT,
  ZERO_SAVINGS,
  POSITIVE_SAVINGS,
  MULTI_TOOL,
  API_ONLY,
  LARGE_VALUES,
];

async function render(scenario: Scenario) {
  const blob = await generatePdfReport(scenario.result, scenario.meta);
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { bytes, ...inspectPdf(bytes) };
}

describe("PDF layout — A4 containment", () => {
  for (const scenario of SCENARIOS) {
    it(`keeps every text operator inside the A4 page box: ${scenario.name}`, async () => {
      const { texts } = await render(scenario);
      expect(texts.length).toBeGreaterThan(0);

      const offenders = texts
        .map((t) => {
          const w = textWidthPt(t.text, t.size, t.bold);
          return { ...t, w, left: t.x, right: t.x + w, top: t.y + t.size, bottom: t.y - t.size * 0.22 };
        })
        .filter(
          (t) =>
            t.left < -0.5 ||
            t.right > A4_W + 0.5 ||
            t.bottom < -0.5 ||
            t.top > A4_H + 0.5
        )
        .map(
          (t) =>
            `p${t.page} [${t.text}] x=${t.left.toFixed(2)} right=${t.right.toFixed(2)} y=${t.y.toFixed(2)}`
        );

      expect(offenders).toEqual([]);
    });

    it(`keeps every vector operator inside the A4 page box: ${scenario.name}`, async () => {
      const { boxes } = await render(scenario);
      const offenders = boxes
        .filter((b) => b.x < -0.5 || b.x + b.w > A4_W + 0.5 || b.y < -0.5 || b.y + b.h > A4_H + 0.5)
        .map((b) => `p${b.page} x=${b.x.toFixed(2)} y=${b.y.toFixed(2)} w=${b.w.toFixed(2)} h=${b.h.toFixed(2)}`);
      expect(offenders).toEqual([]);
    });

    it(`keeps all text inside the print margins: ${scenario.name}`, async () => {
      const { texts } = await render(scenario);
      const left = 14.5 * PT_PER_MM;
      const right = 195.5 * PT_PER_MM;
      const offenders = texts
        .map((t) => ({ ...t, w: textWidthPt(t.text, t.size, t.bold) }))
        .filter((t) => t.x < left - 0.5 || t.x + t.w > right + 0.5)
        .map((t) => `p${t.page} [${t.text}] x=${t.x.toFixed(2)} right=${(t.x + t.w).toFixed(2)}`);
      expect(offenders).toEqual([]);
    });

    it(`never overlaps two text runs: ${scenario.name}`, async () => {
      const { texts } = await render(scenario);
      const runs = texts
        .filter((t) => t.text.trim().length > 0)
        .map((t) => {
          const w = textWidthPt(t.text, t.size, t.bold);
          return {
            ...t,
            x0: t.x,
            x1: t.x + w,
            y0: t.y - 0.207 * t.size, // Helvetica descent
            y1: t.y + 0.718 * t.size, // Helvetica ascent
          };
        });

      const collisions: string[] = [];
      for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) {
          const a = runs[i];
          const b = runs[j];
          if (a.page !== b.page) continue;
          const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          if (overlapX > 0.6 && overlapY > 0.6) {
            collisions.push(
              `p${a.page} [${a.text}] @(${a.x0.toFixed(1)},${a.y0.toFixed(1)}) vs [${b.text}] @(${b.x0.toFixed(1)},${b.y0.toFixed(1)})`
            );
          }
        }
      }
      expect(collisions).toEqual([]);
    });

    it(`keeps body content clear of the footer band: ${scenario.name}`, async () => {
      const { texts, pages } = await render(scenario);
      // The footer rule sits 21.5mm from the page foot, so nothing but the
      // running header/footer itself may have a baseline below that line.
      const bandTop = 22 * PT_PER_MM;
      const chrome = [
        /^Page \d+ of \d+$/,
        /^AI Spend Audit$/,
        /^· Confidential$/,
        /^Report · /,
        /^Generated /,
      ];
      const isChrome = (text: string) => chrome.some((re) => re.test(text.trim()));

      for (let p = 1; p <= pages; p++) {
        const inBand = texts.filter((t) => t.page === p && t.text.trim().length > 0 && t.y < bandTop);
        // Guard against a vacuous pass if the footer ever moves out of the band.
        expect(inBand.some((t) => isChrome(t.text)), `page ${p} has no footer`).toBe(true);
        expect(inBand.filter((t) => !isChrome(t.text)).map((t) => `p${p} [${t.text}]`)).toEqual([]);
      }
    });
  }
});

describe("PDF layout — pagination", () => {
  for (const scenario of SCENARIOS) {
    it(`renders the expected page count with correct Page X of Y: ${scenario.name}`, async () => {
      const { texts, pages } = await render(scenario);
      expect(pages).toBe(scenario.expectPages);

      for (let p = 1; p <= pages; p++) {
        expect(pageTextFlat(texts, p)).toContain(`Page ${p} of ${pages}`);
      }
      const refs = texts.map((t) => t.text).join(" ").match(/Page \d+ of \d+/g) ?? [];
      expect(refs).toEqual(Array.from({ length: pages }, (_, i) => `Page ${i + 1} of ${pages}`));
    });

    it(`puts the full footer on every page: ${scenario.name}`, async () => {
      const { texts, pages } = await render(scenario);
      for (let p = 1; p <= pages; p++) {
        const body = pageTextFlat(texts, p);
        expect(body).toContain("AI Spend Audit");
        expect(body).toContain("Confidential");
        expect(body).toContain("Generated");
        expect(body).toContain("Report");
      }
    });

    it(`never leaves excessive whitespace at the foot of a page: ${scenario.name}`, async () => {
      const { texts, pages } = await render(scenario);
      // Measure real body content only: the running header sits above 16mm from
      // the page top and the footer block below 22mm from the foot.
      const bodyOf = (page: number) => {
        const depth = texts
          .filter((t) => t.page === page && t.text.trim().length > 0)
          .map((t) => A4_H - t.y)
          .filter((d) => d > 16 * PT_PER_MM && d < 275 * PT_PER_MM);
        return depth;
      };

      for (let p = 1; p < pages; p++) {
        const depth = bodyOf(p);
        expect(depth.length, `page ${p} of ${pages} has no body content`).toBeGreaterThan(0);
        const lowest = Math.max(...depth) / PT_PER_MM;
        expect(
          lowest,
          `page ${p} of ${pages} stops at ${lowest.toFixed(1)}mm from the page top`
        ).toBeGreaterThan(0.7 * 297);
      }

      // The closing page may be short, but it must not be a near-empty sheet.
      const last = bodyOf(pages);
      expect(last.length, `final page ${pages} has no body content`).toBeGreaterThanOrEqual(15);
      expect(Math.max(...last) / PT_PER_MM, `final page ${pages} is nearly empty`).toBeGreaterThan(90);
    });

    it(`keeps every body block clear of the footer rule: ${scenario.name}`, async () => {
      const { texts } = await render(scenario);
      // BODY_BOTTOM is the renderer's hard content limit; text crossing it would
      // mean a section was measured shorter than it draws.
      const BODY_BOTTOM_MM = 267;
      const offenders = texts
        .filter((t) => t.text.trim().length > 0)
        .map((t) => ({ t, fromTop: (A4_H - t.y) / PT_PER_MM }))
        .filter(({ fromTop }) => fromTop > 16 && fromTop < 275)
        .filter(({ fromTop }) => fromTop > BODY_BOTTOM_MM + 0.5)
        .map(({ t, fromTop }) => `p${t.page} at ${fromTop.toFixed(1)}mm [${t.text}]`);
      expect(offenders).toEqual([]);
    });

    it(`renders selectable text rather than images: ${scenario.name}`, async () => {
      const { bytes, texts } = await render(scenario);
      // A rasterised report would carry image XObjects; all values must come
      // from content-stream text operators so they stay copyable and searchable.
      expect(bytes.toString("latin1")).not.toContain("/Subtype /Image");
      // Every tool name and its spend figure is present as real text.
      const flat = pageTextFlat(texts, 1) + " " + pageTextFlat(texts, 2);
      for (const tool of scenario.result.tools) {
        expect(flat).toContain(tool.tool);
      }
    });
  }
});

describe("PDF layout — section headings", () => {
  // Section headings are drawn with a space between every character, so they
  // must be matched in that exact form.
  const SECTION_HEADINGS = [
    "E x e c u t i v e   S n a p s h o t",
    "A u d i t   a t   a   G l a n c e",
    "S a v i n g s   O v e r v i e w",
    "A I   T o o l   A n a l y s i s",
    "M e t h o d o l o g y   &   V e r i f i c a t i o n",
  ];

  for (const scenario of SCENARIOS) {
    it(`never strands a section heading at the bottom of a page: ${scenario.name}`, async () => {
      const { texts, pages } = await render(scenario);
      let matched = 0;
      for (let p = 1; p <= pages; p++) {
        const pageItems = texts.filter((t) => t.page === p);
        for (const heading of SECTION_HEADINGS) {
          const index = pageItems.findIndex((t) => t.text === heading);
          if (index === -1) continue;
          matched++;
          const headingY = pageItems[index].y;
          const hasContentBelow = pageItems.some(
            (t, i) => i > index && t.y < headingY - 2 * PT_PER_MM && !/^Page /.test(t.text)
          );
          expect(
            hasContentBelow,
            `"${heading.replace(/\s+/g, " ")}" is stranded on page ${p} of ${pages}`
          ).toBe(true);
        }
      }
      // Every report must actually exercise the heading checks.
      expect(matched).toBeGreaterThan(0);
    });
  }

  it("keeps the tool analysis heading on the same page as the table it introduces", async () => {
    for (const scenario of SCENARIOS) {
      const { texts, pages } = await render(scenario);
      let headingPage = -1;
      for (let p = 1; p <= pages; p++) {
        if (pageText(texts, p).includes("A I   T o o l   A n a l y s i s")) {
          headingPage = p;
          break;
        }
      }
      expect(headingPage).toBeGreaterThan(0);
      const onHeadingPage = pageText(texts, headingPage);
      // The table header must follow the heading on the same page.
      const headerIndex = onHeadingPage.indexOf("Verified Savings");
      const headingIndex = onHeadingPage.indexOf("A I   T o o l   A n a l y s i s");
      expect(headerIndex).toBeGreaterThan(headingIndex);
    }
  });
});

describe("PDF layout — persisted values are never re-derived", () => {
  it("keeps the Claude $200 / $0 regression exactly as persisted", async () => {
    const result = generateAggregateAudit([{ tool: "Claude", spend: 200, users: 5, plan: "Pro" }]);
    expect(result.totalCurrentSpend).toBe(200);
    expect(result.totalOptimizedSpend).toBe(200);
    expect(result.totalSavings).toBe(0);
    expect(result.totalAnnualSavings).toBe(0);
    expect(result.overallOptimizationScore).toBe(100);

    const { texts, pages } = await render(ZERO_SAVINGS);
    const all = texts.map((t) => t.text).join(" ").replace(/\s+/g, " ");
    expect(all).toContain("$200");
    expect(all).toContain("$0");
    expect(all).toContain("NO VERIFIED SAVINGS OPPORTUNITY");
    expect(all).toContain("No verified change");
    expect(pages).toBe(2);
    // A maximum score must not be presented as proof of exhaustion.
    expect(all).toContain("Score reflects verified savings relative to the current configuration.");
    expect(all).not.toContain("100%");
  });

  it("keeps every per-tool figure exactly as persisted, at any magnitude", async () => {
    for (const scenario of SCENARIOS) {
      const { texts } = await render(scenario);
      const all = texts.map((t) => t.text).join(" ").replace(/\s+/g, " ");
      const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
      for (const tool of scenario.result.tools) {
        expect(all, `${scenario.name}: ${tool.tool} name`).toContain(tool.tool);
        expect(all, `${scenario.name}: ${tool.tool} current spend`).toContain(money(tool.currentSpend));
        expect(all, `${scenario.name}: ${tool.tool} optimized spend`).toContain(money(tool.optimizedSpend));
        expect(all, `${scenario.name}: ${tool.tool} savings`).toContain(money(tool.savings));
      }
      expect(all, `${scenario.name}: total current`).toContain(money(scenario.result.totalCurrentSpend));
      expect(all, `${scenario.name}: total optimized`).toContain(money(scenario.result.totalOptimizedSpend));
      expect(all, `${scenario.name}: total savings`).toContain(money(scenario.result.totalSavings));
      expect(all, `${scenario.name}: total annual savings`).toContain(money(scenario.result.totalAnnualSavings));
      expect(all, `${scenario.name}: optimization score`).toContain(
        String(Math.round(scenario.result.overallOptimizationScore))
      );
    }
  });

  it("renders five-figure per-tool spend without reformatting it", async () => {
    const result = LARGE_VALUES.result;
    const cursor = result.tools.find((t) => t.tool === "Cursor");
    const claude = result.tools.find((t) => t.tool === "Claude");
    expect(cursor?.currentSpend).toBe(2334);
    expect(claude?.currentSpend).toBe(1234);

    const { texts } = await render(LARGE_VALUES);
    const all = texts.map((t) => t.text).join(" ").replace(/\s+/g, " ");
    expect(all).toContain("$2,334");
    expect(all).toContain("$1,234");
    expect(all).toContain(`$${result.totalCurrentSpend.toLocaleString("en-US")}`);
    expect(all).toContain(String(Math.round(result.overallOptimizationScore)));
    // Values must never be invented by the renderer.
    expect(all).not.toContain("$$");
  });

  it("shows the exact persisted savings for the positive-savings scenario", async () => {
    const result = POSITIVE_SAVINGS.result;
    expect(result.totalSavings).toBe(400);
    expect(result.totalOptimizedSpend).toBe(380);
    expect(result.totalAnnualSavings).toBe(4800);

    const { texts } = await render(POSITIVE_SAVINGS);
    const all = texts.map((t) => t.text).join(" ").replace(/\s+/g, " ");
    expect(all).toContain("$400");
    expect(all).toContain("$380");
    expect(all).toContain("$4,800");
    expect(all).toContain("Switch to the Business plan");
  });

  it("states the methodology principles the engine enforces", async () => {
    const { texts } = await render(API_ONLY);
    const all = texts.map((t) => t.text).join(" ").replace(/\s+/g, " ");
    expect(all).toContain("Verified pricing only");
    expect(all).toContain("Eligibility-aware replacement plans");
    expect(all).toContain("Consumer seat multiplication is never assumed");
    expect(all).toContain("Usage-based, custom and unverified pricing is excluded from fixed savings");
    expect(all).toContain("Report figures come from the persisted audit result");
    expect(all).toContain("billed on usage (pay-as-you-go)");
    expect(all).not.toContain("real-time pricing");
  });
});
