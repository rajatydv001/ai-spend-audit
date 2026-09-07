import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/dal";
import { requireUserOrg, requireRole } from "@/lib/auth/authorization";
import { getAuditById } from "@/lib/services/audit-service";
import { getUserEntitlements, PlanLimitError } from "@/lib/services/entitlements";
import { AUDIT_LIMIT_WINDOW_MS } from "@/lib/features/plan-config";
import { withSerializableTransaction } from "@/lib/services/transaction";
import { createAuditLog } from "@/lib/services/audit-log";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";
import { parseBody, notFound, internalError, withErrorHandling } from "@/lib/errors";
import { exportReportSchema } from "@/lib/validation/schemas";
import { generatePdfReport } from "@/lib/pdf-export";
import type { AggregateAuditResult, ToolAuditResult, AuditStatus } from "@/lib/audit-engine";
import type { AuditTool } from "@prisma/client";

/**
 * Rebuild a full AggregateAuditResult from a stored audit row. Prefers the
 * resultData snapshot (the exact payload the engine produced); falls back to
 * the denormalized columns/tool rows so a legacy or partial row can still be
 * exported as a truthful PDF.
 */
export function auditRowToResult(audit: {
  resultData: string | null;
  totalCurrentSpend?: number | null;
  totalOptimizedSpend?: number | null;
  totalSavings?: number | null;
  totalAnnualSavings?: number | null;
  optimizationScore?: number | null;
  summary?: string | null;
  tools?: AuditTool[];
}): AggregateAuditResult {
  if (audit.resultData) {
    try {
      const parsed = JSON.parse(audit.resultData) as AggregateAuditResult;
      if (parsed && Array.isArray(parsed.tools)) {
        return parsed;
      }
    } catch {
      // Fall through to the column rebuild below.
    }
  }

  const tools: ToolAuditResult[] = (audit.tools ?? []).map((t) => ({
    tool: t.name,
    status: (["Overpaying", "Optimization Available", "Optimized"] as AuditStatus[]).includes(
      t.status as AuditStatus
    )
      ? (t.status as AuditStatus)
      : "Optimization Available",
    recommendation: t.recommendation,
    currentSpend: t.currentSpend,
    optimizedSpend: t.optimizedSpend,
    savings: t.savings,
    optimizationScore:
      t.currentSpend > 0
        ? Math.round((t.savings / t.currentSpend) * 100)
        : t.savings > 0
          ? 100
          : 0,
    currentPlan: "",
    recommendedPlan: "",
  }));

  const totalCurrentSpend = audit.totalCurrentSpend ?? 0;
  const totalSavings = audit.totalSavings ?? 0;
  const score = audit.optimizationScore ?? 0;

  return {
    tools,
    totalCurrentSpend,
    totalOptimizedSpend: audit.totalOptimizedSpend ?? Math.max(0, totalCurrentSpend - totalSavings),
    totalSavings,
    totalAnnualSavings: audit.totalAnnualSavings ?? 0,
    overallOptimizationScore: score,
    priorityRecommendations: tools.filter((t) => t.savings > 0).map((t) => t.recommendation),
    summary: audit.summary ?? "",
    savingsRate: totalCurrentSpend > 0 ? totalSavings / totalCurrentSpend : 0,
    teamEfficiencyScore: score,
    enhancedRecommendations: [],
  };
}

/**
 * Generates and returns a real, server-side PDF tied to a readable audit, and
 * records one report export against the user's plan export quota. The limit
 * check and the insert happen in a single Serializable transaction so
 * concurrent exports cannot both observe a below-limit count. The PDF is
 * generated BEFORE the quota is consumed so a generation failure never spends
 * an export. Only audits the caller can read (own or same-organization) may be
 * exported.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const user = await requireUserOrg(userId);
  await requireRole(userId, "ADMIN", "ANALYST", "VIEWER");
  await rateLimitOrThrow(`report-export:${userId}`, 60, 60 * 60 * 1000);

  const { auditId } = await parseBody(request, exportReportSchema);

  const audit = await getAuditById(auditId, userId, user.organizationId);
  if (!audit) throw notFound("Audit not found");

  const entitlements = await getUserEntitlements(userId);
  const limit = entitlements.exportLimit;

  let pdfBytes: Uint8Array<ArrayBuffer>;
  try {
    const blob = await generatePdfReport(auditRowToResult(audit));
    pdfBytes = new Uint8Array(await blob.arrayBuffer());
  } catch (error) {
    console.error("[reports/export] PDF generation failed:", error);
    throw internalError("Report generation failed");
  }

  let used = 0;
  const report = await withSerializableTransaction(async (tx) => {
    used = await tx.savedReport.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - AUDIT_LIMIT_WINDOW_MS) } },
    });
    if (used >= limit) {
      throw new PlanLimitError(
        `Export limit reached (${limit} reports on your plan). Upgrade to export more reports.`,
        "export"
      );
    }
    return tx.savedReport.create({
      data: {
        userId,
        auditId,
        name: "AI Spend Audit Report",
        type: "pdf",
      },
    });
  });

  await createAuditLog({
    userId,
    action: "report.exported",
    entity: "savedReport",
    entityId: report.id,
  });

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ai-spend-audit-report-${audit.id.slice(0, 8)}.pdf"`,
      "x-export-remaining": String(Math.max(limit - used - 1, 0)),
      "Cache-Control": "no-store",
    },
  });
});
export const runtime = "nodejs";