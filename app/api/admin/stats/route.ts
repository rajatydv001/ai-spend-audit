import { NextResponse } from "next/server";
import {
  getAdminDashboardStats,
  getAuditVolumeAnalytics,
  getUserGrowthAnalytics,
  getAdminAuditLogs,
} from "@/lib/services/admin-service";
import { requireUserId } from "@/lib/auth/dal";
import { requirePlatformAdmin } from "@/lib/auth/authorization";
import { withErrorHandling } from "@/lib/errors";
import { adminStatsTypeSchema } from "@/lib/validation/schemas";

export const GET = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  await requirePlatformAdmin(userId);

  const url = new URL(request.url);
  const rawType = url.searchParams.get("type") || "overview";
  const parsed = adminStatsTypeSchema.safeParse(rawType);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const type = parsed.data;

  switch (type) {
    case "overview":
      return NextResponse.json(await getAdminDashboardStats());
    case "audit-volume":
      return NextResponse.json(await getAuditVolumeAnalytics());
    case "user-growth":
      return NextResponse.json(await getUserGrowthAnalytics());
    case "audit-logs":
      return NextResponse.json(await getAdminAuditLogs());
    case "all": {
      const [overview, auditVolume, userGrowth, auditLogs] = await Promise.all([
        getAdminDashboardStats(),
        getAuditVolumeAnalytics(),
        getUserGrowthAnalytics(),
        getAdminAuditLogs(),
      ]);
      return NextResponse.json({ overview, auditVolume, userGrowth, auditLogs });
    }
  }
});

export const runtime = "nodejs";
