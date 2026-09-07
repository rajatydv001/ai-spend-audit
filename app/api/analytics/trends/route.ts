import { NextResponse } from "next/server";
import {
  getSpendingTrends,
  getToolAdoptionAnalytics,
  getAIUtilizationScore,
  getProjectedFutureSpend,
} from "@/lib/services/analytics-service";
import { requireUserId } from "@/lib/auth/dal";
import { requireRole } from "@/lib/auth/authorization";
import { assertFeature } from "@/lib/services/entitlements";
import { withErrorHandling } from "@/lib/errors";
import { analyticsTypeSchema } from "@/lib/validation/schemas";

export const GET = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  await requireRole(userId, "ADMIN", "ANALYST", "VIEWER");
  await assertFeature(userId, "analytics");

  const url = new URL(request.url);
  const rawType = url.searchParams.get("type") || "trends";
  const parsed = analyticsTypeSchema.safeParse(rawType);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const type = parsed.data;

  switch (type) {
    case "trends":
      return NextResponse.json(await getSpendingTrends(userId));
    case "adoption":
      return NextResponse.json(await getToolAdoptionAnalytics(userId));
    case "utilization":
      return NextResponse.json(await getAIUtilizationScore(userId));
    case "projection":
      return NextResponse.json(await getProjectedFutureSpend(userId));
    case "all": {
      const [trends, adoption, utilization, projection] = await Promise.all([
        getSpendingTrends(userId),
        getToolAdoptionAnalytics(userId),
        getAIUtilizationScore(userId),
        getProjectedFutureSpend(userId),
      ]);
      return NextResponse.json({ trends, adoption, utilization, projection });
    }
  }
});

export const runtime = "nodejs";
