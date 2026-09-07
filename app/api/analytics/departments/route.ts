import { NextResponse } from "next/server";
import { getDepartmentAnalytics } from "@/lib/services/analytics-service";
import { requireUserId } from "@/lib/auth/dal";
import { requireUserOrg, requireRole } from "@/lib/auth/authorization";
import { assertFeature } from "@/lib/services/entitlements";
import { withErrorHandling } from "@/lib/errors";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const user = await requireUserOrg(userId);
  await requireRole(userId, "ADMIN", "ANALYST", "VIEWER");
  await assertFeature(userId, "analytics");

  const data = await getDepartmentAnalytics(user.organizationId!);
  return NextResponse.json(data);
});

export const runtime = "nodejs";
