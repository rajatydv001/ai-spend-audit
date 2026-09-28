import { jsPDF } from "jspdf";
import type { AggregateAuditResult, ToolAuditResult, AuditStatus } from "@/lib/audit-engine";

export interface PdfReportMeta {
  organizationName?: string;
  reportId?: string;
}

/*
 * Presentation-only layer.
 *
 * Everything below draws the persisted AggregateAuditResult handed to
 * generatePdfReport. No spend, savings, score or eligibility value is derived,
 * re-derived or re-rounded here: the numbers arrive already computed by the
 * audit engine and are only formatted for display. All layout constants are
 * millimetres on A4 (210 x 297).
 */

type Rgb = readonly [number, number, number];

const PAGE_W = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2; // 180

const COVER_H = 66;
const COVER_RULE_H = 1.6;
const FIRST_Y = 76;
const RUN_H = 11.5;
const RUN_RULE_H = 1.1;
const TOP_Y = 20;
const BODY_BOTTOM = 267;
const FOOTER_RULE_Y = 275.5;
const FOOTER_L1 = 280.4;
const FOOTER_L2 = 284.6;

const NAVY = [14, 26, 46] as const;
const NAVY_MID = [32, 51, 82] as const;
const NAVY_TXT = [152, 174, 206] as const;
const NAVY_TXT_SOFT = [126, 148, 182] as const;
const NAVY_SUB = [163, 182, 210] as const;
const INK = [23, 30, 43] as const;
const BODY = [74, 88, 110] as const;
const MUTED = [120, 132, 151] as const;
const FAINT = [163, 173, 189] as const;
const LINE = [221, 227, 236] as const;
const HAIRLINE = [234, 238, 244] as const;
const SURFACE = [247, 249, 252] as const;
const WHITE = [255, 255, 255] as const;
const GREEN = [16, 185, 129] as const;
const GREEN_DARK = [6, 122, 92] as const;
const GREEN_TINT = [234, 251, 244] as const;
const AMBER = [166, 89, 24] as const;
const AMBER_TINT = [253, 243, 233] as const;
const NEUTRAL_TINT = [244, 246, 249] as const;

const FONT = "helvetica";

const SECTION_H = 8;
// Page 1 carries a fixed four-block structure, so its inter-block rhythm is a
// page-level constant: generous enough to read as deliberate spacing, tight
// enough that the score note still clears BODY_BOTTOM with room to spare.
const P1_GAP = 6.8;
const PILL_H = 5.2;
const CARD_PAD = 3.5;
const CARD_LABEL_W = 28;
const CARD_VALUE_X = MARGIN + CARD_PAD + CARD_LABEL_W + 3;
const CARD_VALUE_W = CONTENT_W - CARD_PAD - CARD_LABEL_W - 3 - CARD_PAD;
const CARD_ROW_LINE = 3.3;
const CARD_ROW_GAP = 1.8;
const CARD_GAP = 2.2;
const CARD_NAME_OFF = 5.2;
// The tool name is 9.4pt and the row label 5.9pt, so the baselines must be at
// least 0.207em + 0.718em apart (~2.2mm) or the two ink boxes intersect.
const CARD_NAME_GAP = 2.6;

const PRINCIPLES: Array<[string, string]> = [
  [
    "Verified pricing only",
    "Only plans confirmed against an official pricing source are costed, in US dollars at monthly list pricing. Unverified list prices are never used.",
  ],
  [
    "Eligibility-aware replacement plans",
    "A replacement must be a verified, eligible downgrade for your segment. Free tiers are never treated as a replacement.",
  ],
  [
    "Consumer seat multiplication is never assumed",
    "Per-person consumer plan prices are never multiplied across a seat count, so no saving is claimed from seat arithmetic.",
  ],
  [
    "Usage-based, custom and unverified pricing is excluded from fixed savings",
    "Usage-based, custom (contact-sales) and unverified pricing carry no fixed figure and are never converted into a fixed savings estimate.",
  ],
  [
    "Report figures come from the persisted audit result",
    "Every figure in this report is read from the stored audit result and the business rules behind it. No separate calculations are performed at presentation time.",
  ],
];

function fmtMoney(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function getHealthLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Moderate";
  return "Critical";
}

function statusPresentation(status: AuditStatus): { label: string; tone: Rgb; tint: Rgb } {
  if (status === "Overpaying") return { label: "Review Required", tone: AMBER, tint: AMBER_TINT };
  if (status === "Optimization Available") {
    return { label: "Savings Opportunity", tone: AMBER, tint: AMBER_TINT };
  }
  return { label: "Optimized", tone: GREEN_DARK, tint: GREEN_TINT };
}

function prettyPlan(plan: string): string {
  if (!plan) return "Custom";
  return plan;
}

function spacedCaps(text: string): string {
  return text.split("").join(" ");
}

/**
 * Seat count is not part of the persisted audit result, so it is surfaced only
 * when a stored tool row happens to carry one. Reading an optional persisted
 * field is a lookup, not a calculation: when it is absent the column is dropped
 * from the table entirely.
 */
function seatCount(tool: ToolAuditResult): number | null {
  const row = tool as unknown as { users?: unknown; seats?: unknown };
  for (const candidate of [row.users, row.seats]) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return null;
}

/** Split a persisted engine explanation into its finding and its rationale. */
function splitExplanation(text: string): [string, string] {
  const match = text.match(/^(.+?[.!?])\s+([\s\S]+)$/);
  if (match) return [match[1], match[2]];
  return [text, ""];
}

export async function generatePdfReport(
  result: AggregateAuditResult,
  meta: PdfReportMeta = {}
): Promise<Blob> {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const generatedOn = fmtDate(new Date());
  const reportShortId = meta.reportId ? meta.reportId.slice(0, 8).toUpperCase() : "";
  const orgName = meta.organizationName || "Your Organization";
  const hasSavings = result.totalSavings > 0;
  const score = Math.max(0, Math.min(100, result.overallOptimizationScore));
  const scoreText = String(Math.round(result.overallOptimizationScore));
  const toolWord = result.tools.length === 1 ? "tool" : "tools";
  const overpayingCount = result.tools.filter((t) => t.status === "Overpaying").length;
  const savingsTools = result.tools.filter((t) => t.savings > 0);

  let y = FIRST_Y;

  // Helvetica is a Latin-1 base-14 font: normalise the typographic characters
  // the engine emits and substitute anything outside Latin-1.
  const safeText = (text: string): string =>
    text
      .replace(/\u2192/g, "->")
      .replace(/\u2014/g, "-")
      .replace(/\u2013/g, "-")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u2026]/g, "...")
      .replace(/[^\x00-\xFF]/g, "-");

  type Style = "normal" | "bold";
  const setFont = (style: Style, size: number) => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
  };
  const setColor = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);
  const rule = (x1: number, at: number, x2: number, c: Rgb, width = 0.2) => {
    stroke(c);
    doc.setLineWidth(width);
    doc.line(x1, at, x2, at);
  };
  const widthOf = (text: string, style: Style, size: number) => {
    setFont(style, size);
    return doc.getTextWidth(text);
  };
  const wrap = (text: string, width: number, style: Style = "normal", size = 7.4) => {
    setFont(style, size);
    return doc.splitTextToSize(text, width) as string[];
  };
  const drawLines = (
    lines: string[],
    x: number,
    top: number,
    lineHeight: number,
    align: "left" | "right" | "center" = "left"
  ) => lines.forEach((line, i) => doc.text(line, x, top + i * lineHeight, { align }));

  const newPage = () => {
    doc.addPage();
    y = TOP_Y;
  };
  const ensure = (needed: number) => {
    if (y + needed > BODY_BOTTOM) newPage();
  };

  const pillWidth = (label: string, size = 5.9) => widthOf(label, "bold", size) + 5.4;
  const drawPill = (x: number, top: number, label: string, tone: Rgb, tint: Rgb, size = 5.9) => {
    const w = pillWidth(label, size);
    fill(tint);
    stroke(tone);
    doc.setLineWidth(0.18);
    doc.roundedRect(x, top, w, PILL_H, PILL_H / 2, PILL_H / 2, "FD");
    setFont("bold", size);
    setColor(tone);
    doc.text(label, x + w / 2, top + 3.44, { align: "center" });
    return w;
  };
  const drawPillRight = (right: number, top: number, label: string, tone: Rgb, tint: Rgb) =>
    drawPill(right - pillWidth(label), top, label, tone, tint);

  /** Kicker-style section heading: accent bar, tracked caps, trailing hairline. */
  const drawSectionHeading = (label: string) => {
    const title = spacedCaps(label);
    fill(GREEN);
    doc.rect(MARGIN, y - 2, 1.8, 3.2, "F");
    setFont("bold", 8.6);
    setColor(INK);
    doc.text(title, MARGIN + 5.2, y);
    const tail = MARGIN + 5.2 + widthOf(title, "bold", 8.6) + 4.5;
    if (tail < PAGE_W - MARGIN) rule(tail, y - 0.9, PAGE_W - MARGIN, LINE, 0.3);
    y += SECTION_H;
  };

  /**
   * Place a section so its heading is never stranded: move the whole block to
   * the next page when it fits there, otherwise break before the heading so the
   * first element of the block always stays with it.
   */
  const placeSection = (label: string, blockHeight: number, firstPieceHeight: number) => {
    if (y + SECTION_H + blockHeight <= BODY_BOTTOM) {
      drawSectionHeading(label);
      return;
    }
    if (blockHeight <= BODY_BOTTOM - TOP_Y) {
      newPage();
      drawSectionHeading(label);
      return;
    }
    if (y + SECTION_H + firstPieceHeight > BODY_BOTTOM) newPage();
    drawSectionHeading(label);
  };

  const bodyParagraph = (text: string, maxWidth = CONTENT_W, size = 7.4) => {
    const lines = wrap(safeText(text), maxWidth, "normal", size);
    setFont("normal", size);
    setColor(BODY);
    drawLines(lines, MARGIN, y + 2.7, size * 0.3528 * 1.45);
    y += lines.length * size * 0.3528 * 1.45 + 2.6;
  };

  const NOTE_TITLE_SIZE = 7.6;
  const NOTE_BODY_SIZE = 7.2;
  const NOTE_LINE = 3.3;
  const notePanelHeight = (title: string, body: string) =>
    5.4 +
    wrap(safeText(title), CONTENT_W - 9.4, "bold", NOTE_TITLE_SIZE).length * 3.1 +
    1.8 +
    wrap(safeText(body), CONTENT_W - 9.4, "normal", NOTE_BODY_SIZE).length * NOTE_LINE +
    3.4;

  /** Tinted callout with a left accent rule — neutral or verified state. */
  const notePanel = (
    title: string,
    body: string,
    accent: Rgb,
    tint: Rgb,
    titleColor: Rgb,
    trailingGap = P1_GAP
  ) => {
    const h = notePanelHeight(title, body);
    ensure(h + 3);
    fill(tint);
    doc.rect(MARGIN, y, 1.5, h, "F");
    setFont("bold", NOTE_TITLE_SIZE);
    setColor(titleColor);
    drawLines(wrap(safeText(title), CONTENT_W - 9.4, "bold", NOTE_TITLE_SIZE), MARGIN + 4.6, y + 5.2, 3.1);
    const bodyTop = y + 5.4 + wrap(safeText(title), CONTENT_W - 9.4, "bold", NOTE_TITLE_SIZE).length * 3.1 + 1.8;
    setFont("normal", NOTE_BODY_SIZE);
    setColor(BODY);
    drawLines(wrap(safeText(body), CONTENT_W - 9.4, "normal", NOTE_BODY_SIZE), MARGIN + 4.6, bodyTop, NOTE_LINE);
    y += h + trailingGap;
  };

  // ---------------------------------------------------------------- cover ---

  fill(NAVY);
  doc.rect(0, 0, PAGE_W, COVER_H, "F");
  fill(GREEN);
  doc.rect(0, COVER_H, PAGE_W, COVER_RULE_H, "F");

  setFont("bold", 7.4);
  setColor(NAVY_TXT);
  doc.text(spacedCaps("AI Spend Audit"), MARGIN, 13);
  setFont("normal", 6.4);
  setColor(NAVY_TXT_SOFT);
  doc.text(
    reportShortId ? `Confidential · Report · ${reportShortId}` : "Confidential",
    PAGE_W - MARGIN,
    13,
    { align: "right" }
  );

  fill(GREEN);
  doc.rect(MARGIN, 17.4, 15, 0.85, "F");

  setFont("bold", 24);
  setColor(WHITE);
  doc.text("AI Spend Optimization Report", MARGIN, 30.5);

  setFont("normal", 9);
  setColor(NAVY_SUB);
  doc.text(safeText(`Enterprise audit of AI spending — ${orgName}`), MARGIN, 38.6);

  rule(MARGIN, 47.6, PAGE_W - MARGIN, NAVY_MID, 0.4);

  const coverMeta: Array<[string, string]> = [
    ["Workspace", orgName],
    ["Report ID", reportShortId || "—"],
    ["Generated", generatedOn],
  ];
  coverMeta.forEach(([label, value], i) => {
    const x = MARGIN + i * 60;
    setFont("bold", 5.9);
    setColor(NAVY_TXT_SOFT);
    doc.text(label.toUpperCase(), x, 54.4);
    setFont("bold", 8);
    setColor(WHITE);
    drawLines(wrap(safeText(value), 55, "bold", 8), x, 60.6, 3.6);
  });
  fill(NAVY_MID);
  stroke([70, 96, 136]);
  doc.setLineWidth(0.25);
  doc.roundedRect(PAGE_W - MARGIN - 23, 57.6, 23, 5.4, 2.7, 2.7, "FD");
  setFont("bold", 5.9);
  setColor(WHITE);
  doc.text(spacedCaps("Confidential"), PAGE_W - MARGIN - 11.5, 61.2, { align: "center" });

  // ------------------------------------------------- executive snapshot ---

  placeSection("Executive Snapshot", 0, 0);

  if (result.summary) bodyParagraph(result.summary);

  const SNAP_W = CONTENT_W / 3;
  const SNAP_H = 25.5;
  const snapTop = y;
  rule(MARGIN, snapTop, PAGE_W - MARGIN, INK, 0.4);
  stroke(LINE);
  doc.setLineWidth(0.2);
  for (let i = 1; i < 3; i++) {
    doc.line(MARGIN + SNAP_W * i, snapTop + 1.6, MARGIN + SNAP_W * i, snapTop + SNAP_H - 1.4);
  }

  const execStatus = hasSavings
    ? "Savings Available"
    : result.priorityRecommendations.length > 0
      ? "Review Required"
      : "Optimized";

  const snapshots: Array<{ label: string; value: string; unit: string; sub: string; pill: boolean }> = [
    {
      label: "Current AI Spend",
      value: `$${fmtMoney(result.totalCurrentSpend)}`,
      unit: "/mo",
      sub: "Total monthly investment",
      pill: false,
    },
    {
      label: "Verified Savings Opportunity",
      value: `$${fmtMoney(result.totalSavings)}`,
      unit: "/mo",
      sub: hasSavings
        ? `${Math.round(result.savingsRate)}% of current spend`
        : "No verified opportunity identified",
      pill: false,
    },
    {
      label: "Optimization Status",
      value: execStatus,
      unit: "",
      sub: `Verified findings across ${result.tools.length} ${toolWord}`,
      pill: true,
    },
  ];

  snapshots.forEach((snap, i) => {
    const x = MARGIN + SNAP_W * i;
    const padX = i === 0 ? 0 : 5.4;
    setFont("bold", 6.4);
    setColor(MUTED);
    doc.text(snap.label.toUpperCase(), x + padX, snapTop + 8.4);

    if (snap.pill) {
      const tone = hasSavings ? AMBER : GREEN_DARK;
      drawPill(x + padX, snapTop + 15, snap.value, tone, hasSavings ? AMBER_TINT : GREEN_TINT, 6.4);
    } else {
      setFont("bold", 17);
      setColor(i === 1 && hasSavings ? GREEN_DARK : INK);
      doc.text(snap.value, x + padX, snapTop + 19.8);
      setFont("normal", 7);
      setColor(MUTED);
      doc.text(snap.unit, x + padX + widthOf(snap.value, "bold", 17) + 1.8, snapTop + 18.8);
    }

    setFont("normal", 6.3);
    setColor(MUTED);
    drawLines(wrap(snap.sub, SNAP_W - padX - 6, "normal", 6.3), x + padX, snapTop + 24.4, 3.1);
  });
  y = snapTop + SNAP_H + P1_GAP;

  // --------------------------------------------------- audit at a glance ---

  placeSection("Audit at a Glance", 0, 0);

  type Kpi = { label: string; value: string; unit: string; sub: string; accent: boolean; bar?: boolean };
  const kpis: Kpi[] = [
    {
      label: "Current Monthly Spend",
      value: `$${fmtMoney(result.totalCurrentSpend)}`,
      unit: "/mo",
      sub: "Total across configured tools",
      accent: false,
    },
    {
      label: "Optimized Monthly Spend",
      value: `$${fmtMoney(result.totalOptimizedSpend)}`,
      unit: "/mo",
      sub: hasSavings ? "After verified optimizations" : "Unchanged · no verified change",
      accent: false,
    },
    {
      label: "Monthly Savings",
      value: `$${fmtMoney(result.totalSavings)}`,
      unit: "/mo",
      sub: hasSavings
        ? `Estimated verified savings · ${Math.round(result.savingsRate)}%`
        : "No verified savings identified",
      accent: hasSavings,
    },
    {
      label: "Annual Savings",
      value: `$${fmtMoney(result.totalAnnualSavings)}`,
      unit: "/yr",
      sub: "Projected annualized",
      accent: hasSavings,
    },
    {
      label: "Optimization Score",
      value: scoreText,
      unit: "/100",
      sub: `Efficiency band · ${getHealthLabel(score)}`,
      accent: false,
      bar: true,
    },
    {
      label: "Tools Analyzed",
      value: String(result.tools.length),
      unit: toolWord,
      sub: `${overpayingCount} need attention`,
      accent: false,
    },
  ];

  const KPI_CELL_H = 23.5;
  const KPI_H = KPI_CELL_H * 2;
  fill(SURFACE);
  stroke(LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, CONTENT_W, KPI_H, 1.6, 1.6, "FD");
  stroke(LINE);
  doc.setLineWidth(0.2);
  for (let i = 1; i < 3; i++) {
    doc.line(MARGIN + SNAP_W * i, y + 4, MARGIN + SNAP_W * i, y + KPI_H - 4);
  }
  doc.line(MARGIN + 4, y + KPI_CELL_H, PAGE_W - MARGIN - 4, y + KPI_CELL_H);

  kpis.forEach((kpi, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = MARGIN + SNAP_W * col + 4.6;
    const cellTop = y + KPI_CELL_H * row;
    const textW = SNAP_W - 9.2;

    setFont("bold", 6.4);
    setColor(MUTED);
    doc.text(kpi.label, x, cellTop + 6.2);

    setFont("bold", 15);
    setColor(kpi.accent ? GREEN_DARK : INK);
    doc.text(kpi.value, x, cellTop + 16);
    setFont("normal", 7);
    setColor(MUTED);
    doc.text(kpi.unit, x + widthOf(kpi.value, "bold", 15) + 1.6, cellTop + 15.2);

    setFont("normal", 6.3);
    setColor(MUTED);
    drawLines(wrap(kpi.sub, textW, "normal", 6.3), x, cellTop + 19.9, 3.1);

    if (kpi.bar) {
      fill(LINE);
      doc.roundedRect(x, cellTop + 21.4, textW, 1.5, 0.75, 0.75, "F");
      if (score > 0) {
        fill(GREEN);
        doc.roundedRect(x, cellTop + 21.4, (score / 100) * textW, 1.5, 0.75, 0.75, "F");
      }
    }
  });
  y += KPI_H + P1_GAP;

  // ----------------------------------------------------- savings overview ---

  const GUTTER = 16;
  const BOX_W = (CONTENT_W - GUTTER) / 2;
  const BOX_H = 24;
  const savingsTitle = hasSavings
    ? `VERIFIED SAVINGS · $${fmtMoney(result.totalSavings)}/mo · $${fmtMoney(result.totalAnnualSavings)}/yr`
    : "NO VERIFIED SAVINGS OPPORTUNITY";
  const savingsBody = hasSavings
    ? (result.priorityRecommendations[0] ??
      `Switch to the recommended verified plan to capture $${fmtMoney(result.totalSavings)}/mo in verified savings.`)
    : "No lower-cost verified replacement was identified for the configured tools under the verified pricing catalog and the eligibility rules applied by this audit. The documented finding for each tool is set out in Recommendations.";
  const savingsPanelH = notePanelHeight(savingsTitle, savingsBody) + 5;
  placeSection("Savings Overview", BOX_H + 5 + savingsPanelH, BOX_H);

  const spendBox = (x: number, label: string, value: string, sub: string, dark: boolean) => {
    if (dark) {
      fill(NAVY);
      doc.roundedRect(x, y, BOX_W, BOX_H, 1.6, 1.6, "F");
    } else {
      fill(WHITE);
      stroke(LINE);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, BOX_W, BOX_H, 1.6, 1.6, "FD");
    }
    setFont("bold", 6.4);
    setColor(dark ? NAVY_TXT : MUTED);
    doc.text(label, x + 5.4, y + 7.2);
    setFont("bold", 16);
    setColor(dark ? WHITE : INK);
    doc.text(value, x + 5.4, y + 17.6);
    setFont("normal", 7);
    setColor(dark ? NAVY_TXT_SOFT : MUTED);
    doc.text("/mo", x + 5.4 + widthOf(value, "bold", 16) + 1.8, y + 16.6);
    setFont("normal", 6.3);
    setColor(dark ? NAVY_TXT_SOFT : MUTED);
    drawLines(wrap(sub, BOX_W - 10.8, "normal", 6.3), x + 5.4, y + 21.4, 3.1);
  };

  spendBox(MARGIN, "CURRENT SPEND", `$${fmtMoney(result.totalCurrentSpend)}`, "Total monthly investment", true);
  spendBox(
    MARGIN + BOX_W + GUTTER,
    "OPTIMIZED SPEND",
    `$${fmtMoney(result.totalOptimizedSpend)}`,
    hasSavings ? "After verified optimizations" : "Unchanged from current spend",
    false
  );

  const gutterX = MARGIN + BOX_W + GUTTER / 2;
  setFont("bold", 6);
  setColor(hasSavings ? GREEN_DARK : MUTED);
  // Caps, not tracked: this caption is a bridge label rather than a section
  // heading, and a short word reads better solid.
  doc.text(hasSavings ? "SAVE" : "NO CHANGE", gutterX, y + 10.4, { align: "center" });
  setFont("bold", 8.6);
  setColor(hasSavings ? GREEN_DARK : INK);
  doc.text(`$${fmtMoney(result.totalSavings)}/mo`, gutterX, y + 15.6, { align: "center" });
  y += BOX_H + P1_GAP;

  notePanel(
    savingsTitle,
    savingsBody,
    hasSavings ? GREEN_DARK : MUTED,
    hasSavings ? GREEN_TINT : NEUTRAL_TINT,
    hasSavings ? GREEN_DARK : INK
  );

  // Neutral explanation of the persisted score so that a maximum score is never
  // presented as proof that every possible optimization has been exhausted.
  const scoreNote =
    "Score reflects verified savings relative to the current configuration. " +
    (Math.round(result.overallOptimizationScore) >= 100
      ? `A score of ${scoreText}/100 means this audit identified no verified savings opportunity; it is not a guarantee that every possible optimization has been found.`
      : "Lower scores reflect verified savings identified against the current configuration.");
  const scoreNoteLines = wrap(safeText(scoreNote), CONTENT_W, "normal", 6.2);
  const scoreNoteH = scoreNoteLines.length * 3.1 + 3.4;
  if (y + scoreNoteH > BODY_BOTTOM) newPage();
  rule(MARGIN, y, PAGE_W - MARGIN, HAIRLINE, 0.2);
  setFont("normal", 6.2);
  setColor(MUTED);
  drawLines(scoreNoteLines, MARGIN, y + 4.2, 3.1);
  y += scoreNoteH;

  // --------------------------------------------------- AI tool analysis ---

  type Col = { label: string; w: number; align: "left" | "right" };
  const withSeats = result.tools.some((t) => seatCount(t) !== null);
  // Column widths are measured against the real Helvetica metrics so headers and
  // every realistic cell value sit on one line; both sets total CONTENT_W.
  const cols: Col[] = withSeats
    ? [
        { label: "Tool", w: 23, align: "left" },
        { label: "Current Plan", w: 25, align: "left" },
        { label: "Seats", w: 11, align: "right" },
        { label: "Current Spend", w: 20, align: "right" },
        { label: "Recommended Plan", w: 26, align: "left" },
        { label: "Optimized Spend", w: 23, align: "right" },
        { label: "Verified Savings", w: 24, align: "right" },
        { label: "Status", w: 28, align: "left" },
      ]
    : [
        { label: "Tool", w: 28, align: "left" },
        { label: "Current Plan", w: 27, align: "left" },
        { label: "Current Spend", w: 21, align: "right" },
        { label: "Recommended Plan", w: 28, align: "left" },
        { label: "Optimized Spend", w: 24, align: "right" },
        { label: "Verified Savings", w: 24, align: "right" },
        { label: "Status", w: 28, align: "left" },
      ];

  type Cell = { text: string; style: Style; tone: Rgb; pill?: { label: string; tone: Rgb; tint: Rgb } };
  const blankCells = (): Cell[] => Array.from({ length: cols.length }, () => ({ text: "", style: "normal" as Style, tone: BODY }));
  const tableRows: Cell[][] =
    result.tools.length > 0
      ? result.tools.map((t) => {
          const status = statusPresentation(t.status);
          const seats = seatCount(t);
          const cells: Cell[] = [
            { text: safeText(t.tool), style: "bold", tone: INK },
            { text: safeText(prettyPlan(t.currentPlan)), style: "normal", tone: BODY },
          ];
          if (withSeats) {
            cells.push({
              text: seats === null ? "-" : String(seats),
              style: "normal",
              tone: seats === null ? FAINT : BODY,
            });
          }
          cells.push({ text: `$${fmtMoney(t.currentSpend)}`, style: "normal", tone: INK });
          cells.push({
            text: t.savings > 0 ? safeText(prettyPlan(t.recommendedPlan)) : "No verified change",
            style: "normal",
            tone: t.savings > 0 ? BODY : MUTED,
          });
          cells.push({ text: `$${fmtMoney(t.optimizedSpend)}`, style: "normal", tone: BODY });
          cells.push({
            text: `$${fmtMoney(t.savings)}`,
            style: t.savings > 0 ? "bold" : "normal",
            tone: t.savings > 0 ? GREEN_DARK : MUTED,
          });
          cells.push({
            text: status.label,
            style: "bold",
            tone: status.tone,
            pill: { label: status.label, tone: status.tone, tint: status.tint },
          });
          return cells;
        })
      : [
          [
            { text: "No tools in scope", style: "bold", tone: INK },
            ...blankCells().slice(1),
          ],
        ];

  const PAD_X = 1.9;
  const PAD_Y = 2.2;
  const ROW_LINE = 3.3;
  const ROW_MIN_H = 7.7;
  const SECTION_SEAM = 6.4;
  const TABLE_GAP = 4.2;
  const headLines = cols.map((c) => wrap(c.label, c.w - PAD_X * 2, "bold", 6.1));
  // Sized from the wrapped header so a two-line label is never clipped, but it
  // settles on the compact single-line height for the shipped column set.
  const HEAD_H = Math.max(8.4, Math.max(...headLines.map((l) => l.length)) * 3.0 + 4.2);
  const bodyLines: string[][][] = tableRows.map((row) =>
    row.map((cell, i) => (cell.pill ? [cell.text] : wrap(cell.text, cols[i].w - PAD_X * 2, cell.style, 7.4)))
  );
  const rowHeights = bodyLines.map(
    (row) => Math.max(ROW_MIN_H, Math.max(...row.map((lines) => lines.length)) * ROW_LINE + PAD_Y * 2)
  );
  const tableHeight = HEAD_H + 0.7 + rowHeights.reduce((sum, h) => sum + h, 0) + TABLE_GAP;

  const drawTableHeader = (continued: boolean) => {
    if (continued) {
      setFont("bold", 5.8);
      setColor(FAINT);
      doc.text(spacedCaps("AI Tool Analysis - continued"), MARGIN, y + 3.4);
      y += 6.6;
    }
    fill(NAVY);
    doc.rect(MARGIN, y, CONTENT_W, HEAD_H, "F");
    let hx = MARGIN;
    cols.forEach((col, i) => {
      const tx = col.align === "right" ? hx + col.w - PAD_X : hx + PAD_X;
      setFont("bold", 6.1);
      setColor(WHITE);
      doc.text(headLines[i], tx, y + HEAD_H / 2 + 1.0, { align: col.align });
      hx += col.w;
      if (i < cols.length - 1) {
        stroke(NAVY_MID);
        doc.setLineWidth(0.2);
        doc.line(hx, y + 1.8, hx, y + HEAD_H - 1.8);
      }
    });
    y += HEAD_H;
    fill(GREEN);
    doc.rect(MARGIN, y, CONTENT_W, 0.7, "F");
    y += 0.7;
  };

  // Require the heading plus the table header and at least two data rows, so a
  // heading is never left alone at the foot of a page.
  const firstChunk = HEAD_H + 0.7 + rowHeights[0] + (rowHeights[1] ?? 0);
  placeSection("AI Tool Analysis", tableHeight, firstChunk);
  let headerDrawn = false;
  tableRows.forEach((row, rowIndex) => {
    const h = rowHeights[rowIndex];
    if (y + h > BODY_BOTTOM) {
      newPage();
      drawTableHeader(true);
    } else if (!headerDrawn) {
      drawTableHeader(false);
      headerDrawn = true;
    }
    const rowTop = y;
    fill(rowIndex % 2 === 0 ? WHITE : SURFACE);
    doc.rect(MARGIN, rowTop, CONTENT_W, h, "F");
    rule(MARGIN, rowTop + h, PAGE_W - MARGIN, rowIndex % 2 === 0 ? HAIRLINE : LINE, 0.15);

    let x = MARGIN;
    row.forEach((cell, i) => {
      const col = cols[i];
      const tx = col.align === "right" ? x + col.w - PAD_X : x + PAD_X;
      if (cell.pill) {
        drawPill(tx, rowTop + (h - PILL_H) / 2, cell.pill.label, cell.pill.tone, cell.pill.tint);
      } else {
        setFont(cell.style, 7.4);
        setColor(cell.tone);
        drawLines(bodyLines[rowIndex][i], tx, rowTop + PAD_Y + 2.5, ROW_LINE, col.align);
      }
      x += col.w;
    });
    y = rowTop + h;
  });
  rule(MARGIN, y, PAGE_W - MARGIN, LINE, 0.25);
  y += TABLE_GAP + (SECTION_SEAM - TABLE_GAP);

  // ------------------------------------------------------- recommendations ---

  const noSavingsTitle = "NO VERIFIED SAVINGS OPPORTUNITIES";
  const noSavingsBody =
    "No lower-cost verified replacement was identified for the configured tools under the verified pricing catalog and the eligibility rules applied by this audit. No savings recommendation is made for the tools below.";

  type RecRow = { label: string; lines: string[]; tone: Rgb; style: Style };
  type RecLayout = {
    nameLines: string[];
    rows: RecRow[];
    height: number;
    pillLabel: string;
    pillTone: Rgb;
    pillTint: Rgb;
  };

  const layoutRecCard = (tool: ToolAuditResult): RecLayout => {
    const explanation = safeText(tool.recommendation);
    const [finding, rationale] = tool.savings > 0 ? [explanation, ""] : splitExplanation(explanation);
    const isSavings = tool.savings > 0;
    const status = statusPresentation(tool.status);
    const pillLabel = isSavings ? "Savings Opportunity" : status.label;
    const pillTone = isSavings ? AMBER : status.tone;
    const pillTint = isSavings ? AMBER_TINT : status.tint;
    const pillW = pillWidth(pillLabel);

    const values: Array<[string, string, Rgb, Style]> = [
      [
        "Current configuration",
        `${prettyPlan(tool.currentPlan)} · $${fmtMoney(tool.currentSpend)}/mo`,
        BODY,
        "normal",
      ],
    ];
    if (isSavings) {
      values.push([
        "Recommended plan",
        `${prettyPlan(tool.recommendedPlan)} · $${fmtMoney(tool.optimizedSpend)}/mo`,
        BODY,
        "normal",
      ]);
      values.push(["Verified savings", `$${fmtMoney(tool.savings)}/mo`, GREEN_DARK, "bold"]);
    }
    values.push(["Verified finding", finding, INK, "normal"]);
    if (rationale) values.push(["Why no change advised", rationale, BODY, "normal"]);

    const nameLines = wrap(
      safeText(tool.tool),
      CONTENT_W - CARD_PAD * 2 - pillW - 6,
      "bold",
      9.4
    );
    const rows: RecRow[] = values.map(([label, value, tone, style]) => ({
      label,
      lines: wrap(value, CARD_VALUE_W, "normal", 7.6),
      tone,
      style,
    }));
    const nameBlockH = CARD_NAME_OFF + (nameLines.length - 1) * 3.6 + CARD_NAME_GAP;
    // No trailing gap after the final row: that space is the card's bottom
    // padding, so counting it twice only inflated the block.
    const bodyH = rows.reduce((sum, r) => sum + r.lines.length * CARD_ROW_LINE + CARD_ROW_GAP, 0);
    const height = CARD_PAD + nameBlockH + bodyH - CARD_ROW_GAP + CARD_PAD + 0.5;

    return { nameLines, rows, height, pillLabel, pillTone, pillTint };
  };

  const recLayouts = result.tools.map(layoutRecCard);
  const recTotalH = recLayouts.reduce((sum, l) => sum + l.height + CARD_GAP, 0);
  const recFirstH = savingsTools.length > 0 ? 0 : notePanelHeight(noSavingsTitle, noSavingsBody) + 2.2;
  const recBlockH = recTotalH + recFirstH;
  placeSection(
    "Recommendations",
    recBlockH,
    recFirstH + (recLayouts[0]?.height ?? 0) + CARD_GAP
  );

  const drawRecCard = (tool: ToolAuditResult, layout: RecLayout) => {
    const isSavings = tool.savings > 0;
    ensure(layout.height + CARD_GAP);
    const top = y;
    fill(WHITE);
    stroke(LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, top, CONTENT_W, layout.height, 1.6, 1.6, "FD");
    fill(isSavings ? GREEN : MUTED);
    doc.rect(MARGIN, top, 1.5, layout.height, "F");

    setFont("bold", 9.4);
    setColor(INK);
    drawLines(layout.nameLines, MARGIN + CARD_PAD, top + CARD_PAD + CARD_NAME_OFF, 3.6);
    drawPillRight(
      PAGE_W - MARGIN - CARD_PAD,
      top + CARD_PAD + 1.6,
      layout.pillLabel,
      layout.pillTone,
      layout.pillTint
    );

    let cy = top + CARD_PAD + CARD_NAME_OFF + (layout.nameLines.length - 1) * 3.6 + CARD_NAME_GAP;
    layout.rows.forEach((row) => {
      setFont("bold", 5.9);
      setColor(MUTED);
      doc.text(row.label.toUpperCase(), MARGIN + CARD_PAD, cy);
      setFont(row.style, 7.6);
      setColor(row.tone);
      drawLines(row.lines, CARD_VALUE_X, cy, CARD_ROW_LINE);
      cy += row.lines.length * CARD_ROW_LINE + CARD_ROW_GAP;
    });

    y = top + layout.height + CARD_GAP;
  };

  if (savingsTools.length > 0) {
    savingsTools.forEach((t) => {
      const layout = recLayouts[result.tools.indexOf(t)];
      drawRecCard(t, layout);
    });
  } else {
    notePanel(noSavingsTitle, noSavingsBody, MUTED, NEUTRAL_TINT, INK);
    result.tools.forEach((t, i) => {
      if (!t.recommendation) return;
      drawRecCard(t, recLayouts[i]);
    });
  }

  // ------------------------------------------------ methodology & method ---

  /*
   * Compact verification panel. The five principles and their wording are the
   * engine's rules restated verbatim; only the packaging is condensed. The
   * section heading already names the block, so the redundant sub-label is gone
   * and each principle is separated by a hairline rather than nested in its own
   * card. The panel is measured and drawn as one block, so a principle can never
   * be split across a page break.
   */
  const METHOD_TEXT_X = MARGIN + 9.6;
  const METHOD_TEXT_W = PAGE_W - MARGIN - 4.2 - METHOD_TEXT_X;
  const METHOD_LEAD = 3.2;
  const METHOD_DESC_PAD = 1.5;
  // Centred in the whitespace between a description's descender box and the next
  // title's ascent box, so the hairline never grazes the text either side.
  const METHOD_SEP_DROP = 2.4;
  const METHOD_ROW_GAP = 1.5;
  const METHOD_PAD_TOP = 2.9;
  const METHOD_PAD_BOT = 2.1;
  const METHOD_BADGE = 3.7;
  const methodRows = PRINCIPLES.map(([title, desc]) => ({
    titleLines: wrap(title, METHOD_TEXT_W, "bold", 7.6),
    descLines: wrap(desc, METHOD_TEXT_W, "normal", 7.1),
  }));
  // A row spans from its title's first baseline down to METHOD_DESC_PAD below
  // its description's last baseline; the drawing loop advances by exactly this,
  // so the measured height and the drawn panel can never disagree.
  const methodRowH = methodRows.map(
    (r) =>
      METHOD_LEAD +
      (r.titleLines.length - 1) * METHOD_LEAD +
      r.descLines.length * METHOD_LEAD -
      METHOD_LEAD +
      METHOD_DESC_PAD
  );
  const methodH =
    METHOD_PAD_TOP +
    methodRowH.reduce((sum, h, i) => sum + h + (i < methodRowH.length - 1 ? METHOD_ROW_GAP : 0), 0) +
    METHOD_PAD_BOT;
  y += 2.2;
  placeSection("Methodology & Verification", methodH, methodH);

  const methodTop = y;
  fill(WHITE);
  stroke(LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, methodTop, CONTENT_W, methodH, 1.6, 1.6, "FD");
  fill(NAVY);
  doc.rect(MARGIN, methodTop, 1.5, methodH, "F");

  let my = methodTop + METHOD_PAD_TOP;
  methodRows.forEach((row, i) => {
    if (i > 0) {
      // `my` sits METHOD_DESC_PAD below the previous description's last
      // baseline, so the separator lands in the middle of the inter-row gap.
      rule(METHOD_TEXT_X, my - METHOD_DESC_PAD + METHOD_SEP_DROP, PAGE_W - MARGIN - 4.2, HAIRLINE, 0.2);
      my += METHOD_ROW_GAP;
    }
    my += METHOD_LEAD;
    fill(NAVY);
    doc.roundedRect(MARGIN + 4.6, my - 2.75, METHOD_BADGE, METHOD_BADGE, 0.7, 0.7, "F");
    setFont("bold", 5.6);
    setColor(WHITE);
    doc.text(String(i + 1), MARGIN + 4.6 + METHOD_BADGE / 2, my - 0.62, { align: "center" });

    setFont("bold", 7.6);
    setColor(INK);
    drawLines(row.titleLines, METHOD_TEXT_X, my, METHOD_LEAD);

    const descTop = my + (row.titleLines.length - 1) * METHOD_LEAD + METHOD_LEAD;
    setFont("normal", 7.1);
    setColor(BODY);
    drawLines(row.descLines, METHOD_TEXT_X, descTop, METHOD_LEAD);
    // Last baseline + METHOD_DESC_PAD, i.e. the full measured row height.
    my = descTop + (row.descLines.length - 1) * METHOD_LEAD + METHOD_DESC_PAD;
  });

  // ------------------------------------------------------------- footers ---

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) {
      fill(NAVY);
      doc.rect(0, 0, PAGE_W, RUN_H, "F");
      fill(GREEN);
      doc.rect(0, RUN_H, PAGE_W, RUN_RULE_H, "F");
      setFont("bold", 6.8);
      setColor(WHITE);
      doc.text(spacedCaps("AI Spend Audit"), MARGIN, 7.9);
      setFont("normal", 6.8);
      setColor(NAVY_TXT);
      doc.text("AI Spend Optimization Report", PAGE_W - MARGIN, 7.9, { align: "right" });
    }

    rule(MARGIN, FOOTER_RULE_Y, PAGE_W - MARGIN, LINE, 0.3);

    const brandW = widthOf("AI Spend Audit", "bold", 6.3);
    setFont("bold", 6.3);
    setColor(INK);
    doc.text("AI Spend Audit", MARGIN, FOOTER_L1);
    setFont("normal", 6.3);
    setColor(MUTED);
    doc.text("· Confidential", MARGIN + brandW + 1.8, FOOTER_L1);
    setFont("bold", 6.3);
    setColor(INK);
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN, FOOTER_L1, { align: "right" });

    setFont("normal", 6);
    setColor(FAINT);
    doc.text(reportShortId ? `Report · ${reportShortId}` : "AI Spend Audit", MARGIN, FOOTER_L2);
    doc.text(`Generated ${generatedOn}`, PAGE_W - MARGIN, FOOTER_L2, { align: "right" });
  }

  return doc.output("blob");
}
