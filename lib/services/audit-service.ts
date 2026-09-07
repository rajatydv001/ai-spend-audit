import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateAggregateAudit, type AggregateAuditResult } from "@/lib/audit-engine";
import { getUserEntitlements, PlanLimitError } from "@/lib/services/entitlements";
import { withSerializableTransaction } from "@/lib/services/transaction";
import { AUDIT_LIMIT_WINDOW_MS } from "@/lib/features/plan-config";

/**
 * Raw audit inputs accepted from a client. Only these inputs are permitted:
 * the per-tool name/plan/spend/seats the engine needs. Every derived number
 * (totals, savings, Savings Rate, optimization score, recommendation) is
 * recomputed server-side by `generateAggregateAudit` and is NEVER read from
 * the client, so a tampered result payload cannot be persisted.
 */
export const createAuditInputSchema = z.object({
  tools: z
    .array(
      z.object({
        tool: z.string().min(1, "tool is required"),
        plan: z.string().min(1).optional(),
        spend: z
          .number()
          .nonnegative("spend must be non-negative")
          .max(1_000_000_000, "spend is too large"),
        users: z
          .number()
          .int("users must be an integer")
          .positive("users must be at least 1")
          .max(1_000_000, "too many seats"),
      })
    )
    .min(1, "At least one tool is required")
    .max(50, "Too many tools in a single audit (max 50)"),
  department: z.string().optional(),
});

export type CreateAuditInput = z.infer<typeof createAuditInputSchema>;

function buildAuditCreateData(
  userId: string | null,
  data: CreateAuditInput,
  organizationId?: string,
  result?: AggregateAuditResult
) {
  const computed = result ?? generateAggregateAudit(data.tools, new Date());
  return {
    userId: userId || undefined,
    organizationId: organizationId || undefined,
    department: data.department,
    totalCurrentSpend: computed.totalCurrentSpend,
    totalOptimizedSpend: computed.totalOptimizedSpend,
    totalSavings: computed.totalSavings,
    totalAnnualSavings: computed.totalAnnualSavings,
    optimizationScore: computed.overallOptimizationScore,
    summary: computed.summary,
    resultData: JSON.stringify(computed),
    tools: {
      create: computed.tools.map((t) => ({
        name: t.tool,
        status: t.status,
        currentSpend: t.currentSpend,
        optimizedSpend: t.optimizedSpend,
        savings: t.savings,
        recommendation: t.recommendation,
      })),
    },
  };
}

/**
 * Creates an audit only when the user's effective plan still has audit quota
 * left in the current rolling 30-day window. The limit check and the insert
 * run inside one Serializable transaction, so two concurrent requests cannot
 * both observe a below-limit count and slip past the limit. The plan and its
 * limit are resolved server-side from the verified subscription state.
 */
export async function createAuditWithinLimit(
  userId: string,
  data: CreateAuditInput,
  organizationId?: string
) {
  const entitlements = await getUserEntitlements(userId);
  const limit = entitlements.auditLimit;
  const windowStart = new Date(Date.now() - AUDIT_LIMIT_WINDOW_MS);
  const result = generateAggregateAudit(data.tools, new Date());

  return withSerializableTransaction(async (tx) => {
    const used = await tx.audit.count({
      where: { userId, createdAt: { gte: windowStart } },
    });
    if (used >= limit) {
      throw new PlanLimitError(
        `Audit limit reached (${limit} audits per month on your plan). Upgrade to run more audits.`,
        "audit"
      );
    }
    return tx.audit.create({
      data: buildAuditCreateData(userId, data, organizationId, result),
      include: { tools: true },
    });
  });
}

export async function getAuditsByUser(userId: string, organizationId?: string | null) {
  return prisma.audit.findMany({
    where: {
      OR: [{ userId }, ...(organizationId ? [{ organizationId }] : [])],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      department: true,
      totalCurrentSpend: true,
      totalOptimizedSpend: true,
      totalSavings: true,
      totalAnnualSavings: true,
      optimizationScore: true,
      summary: true,
      createdAt: true,
      updatedAt: true,
      tools: true,
      _count: { select: { savedReports: true } },
    },
  });
}

export async function getAuditById(id: string, userId: string, organizationId?: string | null) {
  return prisma.audit.findFirst({
    where: {
      id,
      OR: [{ userId }, ...(organizationId ? [{ organizationId }] : [])],
    },
    include: { tools: true },
  });
}

export async function deleteAudit(id: string, userId: string, organizationId?: string | null) {
  return prisma.audit.deleteMany({
    where: {
      id,
      OR: [{ userId }, ...(organizationId ? [{ organizationId }] : [])],
    },
  });
}

export async function getUserPreferences(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { currency: true, teamSize: true },
  });
}

export async function updateUserPreferences(
  userId: string,
  data: { currency?: string; teamSize?: number }
) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: { currency: true, teamSize: true },
  });
}