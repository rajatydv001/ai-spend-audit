import { prisma } from "@/lib/db";

export async function getAdminDashboardStats() {
  const [
    totalUsers,
    totalOrganizations,
    totalAudits,
    subscriptions,
    recentAudits,
    billingHistory,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.audit.count(),
    prisma.subscription.groupBy({
      by: ["plan", "status"],
      _count: true,
    }),
    prisma.audit.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.billingHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { subscription: { include: { user: { select: { name: true, email: true } } } } },
    }),
  ]);

  const activeSubscriptions = subscriptions
    .filter((s) => s.status === "ACTIVE" || s.status === "TRIALING")
    .reduce((acc, s) => acc + s._count, 0);

  const planBreakdown = subscriptions.reduce<Record<string, number>>((acc, s) => {
    acc[s.plan] = (acc[s.plan] || 0) + s._count;
    return acc;
  }, {});

  const mrr = billingHistory
    .filter((b) => b.status === "paid")
    .slice(0, 30)
    .reduce((sum, b) => sum + b.amount, 0);

  return {
    totalUsers,
    totalOrganizations,
    totalAudits,
    activeSubscriptions,
    mrr: mrr / 100,
    churnRate: totalUsers > 0
      ? Math.round(
          (subscriptions.find((s) => s.status === "CANCELED")?._count || 0) /
            totalUsers * 100 * 100
        ) / 100
      : 0,
    planBreakdown,
    recentAudits,
    recentPayments: billingHistory.slice(0, 5),
  };
}

export async function getAuditVolumeAnalytics(days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const audits = await prisma.audit.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const volumeByDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];
    volumeByDay.set(date, 0);
  }

  for (const audit of audits) {
    const date = audit.createdAt.toISOString().split("T")[0];
    volumeByDay.set(date, (volumeByDay.get(date) || 0) + 1);
  }

  return Array.from(volumeByDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getUserGrowthAnalytics(days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const growthByDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];
    growthByDay.set(date, 0);
  }

  for (const user of users) {
    const date = user.createdAt.toISOString().split("T")[0];
    growthByDay.set(date, (growthByDay.get(date) || 0) + 1);
  }

  return Array.from(growthByDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getAdminAuditLogs(limit: number = 50) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
}
