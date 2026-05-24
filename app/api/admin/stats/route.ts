import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getAdminDashboardStats,
  getAuditVolumeAnalytics,
  getUserGrowthAnalytics,
  getAdminAuditLogs,
} from "@/lib/services/admin-service";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN" || !user?.organizationId) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "overview";

  switch (type) {
    case "overview":
      return NextResponse.json(await getAdminDashboardStats());
    case "audit-volume":
      return NextResponse.json(await getAuditVolumeAnalytics());
    case "user-growth":
      return NextResponse.json(await getUserGrowthAnalytics());
    case "audit-logs":
      return NextResponse.json(await getAdminAuditLogs());
    default:
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
}
