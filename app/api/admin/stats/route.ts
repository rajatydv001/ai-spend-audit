import { NextResponse } from "next/server";
import {
  getAdminDashboardStats,
  getAuditVolumeAnalytics,
  getUserGrowthAnalytics,
  getAdminAuditLogs,
} from "@/lib/services/admin-service";

export async function GET(request: Request) {
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
