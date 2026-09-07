import { prisma } from "@/lib/db";

export async function getSpendingTrends(
  userId: string,
  months: number = 6
) {
  const audits = await prisma.audit.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: "asc" },
    take: months,
    select: {
      createdAt: true,
      totalCurrentSpend: true,
      totalSavings: true,
      optimizationScore: true,
    },
  });

  return audits.map((a) => ({
    date: a.createdAt.toISOString().split("T")[0],
    spend: a.totalCurrentSpend,
    savings: a.totalSavings,
    score: a.optimizationScore,
  }));
}

export async function getDepartmentAnalytics(organizationId: string) {
  const departments = await prisma.department.findMany({
    where: { organizationId },
    select: { name: true },
  });

  const aggregated = await prisma.audit.groupBy({
    by: ["department"],
    where: { organizationId, department: { not: null } },
    _count: { _all: true },
    _sum: { totalCurrentSpend: true, totalSavings: true },
    _avg: { optimizationScore: true },
  });

  const byDept = new Map(aggregated.map((g) => [g.department, g]));

  return departments.map((dept) => {
    const agg = byDept.get(dept.name);
    return {
      name: dept.name,
      auditCount: agg?._count._all ?? 0,
      totalSpend: Math.round((agg?._sum.totalCurrentSpend ?? 0) * 100) / 100,
      totalSavings: Math.round((agg?._sum.totalSavings ?? 0) * 100) / 100,
      avgScore: agg?._avg.optimizationScore != null
        ? Math.round(agg._avg.optimizationScore * 10) / 10
        : 0,
    };
  });
}

export async function getToolAdoptionAnalytics(userId: string) {
  const audits = await prisma.audit.findMany({
    where: userId ? { userId } : {},
    include: { tools: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const toolStats = new Map<string, { count: number; totalSpend: number; totalSavings: number }>();

  for (const audit of audits) {
    for (const tool of audit.tools) {
      const existing = toolStats.get(tool.name) || { count: 0, totalSpend: 0, totalSavings: 0 };
      existing.count++;
      existing.totalSpend += tool.currentSpend;
      existing.totalSavings += tool.savings;
      toolStats.set(tool.name, existing);
    }
  }

  return Array.from(toolStats.entries())
    .map(([name, stats]) => ({
      name,
      auditCount: stats.count,
      avgSpend: Math.round((stats.totalSpend / stats.count) * 100) / 100,
      avgSavings: Math.round((stats.totalSavings / stats.count) * 100) / 100,
      totalSpend: Math.round(stats.totalSpend * 100) / 100,
      totalSavings: Math.round(stats.totalSavings * 100) / 100,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export async function getAIUtilizationScore(userId: string) {
  const audits = await prisma.audit.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { tools: true },
  });

  if (audits.length === 0) return { score: 0, breakdown: [], recommendation: "" };

  const latest = audits[0];
  const optimizedCount = latest.tools.filter((t) => t.status === "Optimized").length;
  const overpayingCount = latest.tools.filter((t) => t.status === "Overpaying").length;
  const total = latest.tools.length;

  const score = total > 0
    ? Math.round((optimizedCount / total) * 50 + (latest.optimizationScore / 100) * 50)
    : 0;

  const breakdown = latest.tools.map((t) => ({
    name: t.name,
    status: t.status,
    utilization: t.status === "Optimized" ? 90 : t.status === "Optimization Available" ? 60 : 30,
  }));

  let recommendation = "";
  if (score < 40) {
    recommendation = "Critical: Most tools need optimization. Start with overpaying subscriptions.";
  } else if (score < 70) {
    recommendation = "Good progress but room for improvement. Review optimization suggestions.";
  } else {
    recommendation = "Excellent utilization! Keep monitoring for new opportunities.";
  }

  return { score, breakdown, recommendation };
}

export async function getProjectedFutureSpend(userId: string) {
  const audits = await prisma.audit.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, totalCurrentSpend: true },
  });

  if (audits.length < 2) {
    const current = audits[0]?.totalCurrentSpend || 0;
    return {
      current: current,
      projected3Months: current * 3 * 1.1,
      projected6Months: current * 6 * 1.15,
      projected12Months: current * 12 * 1.2,
      growthRate: 0.1,
    };
  }

  const firstSpend = audits[0].totalCurrentSpend;
  const lastSpend = audits[audits.length - 1].totalCurrentSpend;
  const monthsElapsed = Math.max(
    1,
    (new Date(audits[audits.length - 1].createdAt).getTime() - new Date(audits[0].createdAt).getTime()) /
      (1000 * 60 * 60 * 24 * 30)
  );
  const monthlyGrowthRate = Math.max(0, (lastSpend - firstSpend) / firstSpend / monthsElapsed);

  return {
    current: lastSpend,
    projected3Months: Math.round(lastSpend * Math.pow(1 + monthlyGrowthRate, 3) * 100) / 100,
    projected6Months: Math.round(lastSpend * Math.pow(1 + monthlyGrowthRate, 6) * 100) / 100,
    projected12Months: Math.round(lastSpend * Math.pow(1 + monthlyGrowthRate, 12) * 100) / 100,
    growthRate: Math.round(monthlyGrowthRate * 1000) / 10,
  };
}
