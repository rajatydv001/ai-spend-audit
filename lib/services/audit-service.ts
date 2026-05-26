import { z } from "zod";
import { prisma } from "@/lib/db";
import type { AggregateAuditResult } from "@/lib/audit-engine";

export const createAuditSchema = z.object({
  totalCurrentSpend: z.number(),
  totalOptimizedSpend: z.number(),
  totalSavings: z.number(),
  totalAnnualSavings: z.number(),
  optimizationScore: z.number(),
  summary: z.string(),
  resultData: z.string(),
  tools: z.array(z.object({
    name: z.string(),
    status: z.string(),
    currentSpend: z.number(),
    optimizedSpend: z.number(),
    savings: z.number(),
    recommendation: z.string(),
  })),
});

export type CreateAuditInput = z.infer<typeof createAuditSchema>;

export async function createAudit(userId: string | null, data: CreateAuditInput) {
  return prisma.audit.create({
    data: {
      userId: userId || undefined,
      totalCurrentSpend: data.totalCurrentSpend,
      totalOptimizedSpend: data.totalOptimizedSpend,
      totalSavings: data.totalSavings,
      totalAnnualSavings: data.totalAnnualSavings,
      optimizationScore: data.optimizationScore,
      summary: data.summary,
      resultData: data.resultData,
      tools: {
        create: data.tools.map((t) => ({
          name: t.name,
          status: t.status,
          currentSpend: t.currentSpend,
          optimizedSpend: t.optimizedSpend,
          savings: t.savings,
          recommendation: t.recommendation,
        })),
      },
    },
    include: { tools: true },
  });
}

export async function getAuditsByUser(userId: string) {
  return prisma.audit.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { tools: true, _count: { select: { savedReports: true } } },
  });
}

export async function getAuditById(id: string, userId: string) {
  return prisma.audit.findFirst({
    where: userId ? { id, userId } : { id },
    include: { tools: true },
  });
}

export async function deleteAudit(id: string, userId: string) {
  if (userId) {
    return prisma.audit.deleteMany({ where: { id, userId } });
  }
  return prisma.audit.deleteMany({ where: { id } });
}

export async function updateAudit(
  id: string,
  userId: string,
  data: Partial<CreateAuditInput>
) {
  const existing = await prisma.audit.findFirst({ where: { id, userId } });
  if (!existing) return null;

  return prisma.audit.update({
    where: { id },
    data: {
      ...data,
      tools: data.tools
        ? {
            deleteMany: {},
            create: data.tools.map((t) => ({
              name: t.name,
              status: t.status,
              currentSpend: t.currentSpend,
              optimizedSpend: t.optimizedSpend,
              savings: t.savings,
              recommendation: t.recommendation,
            })),
          }
        : undefined,
    },
    include: { tools: true },
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
