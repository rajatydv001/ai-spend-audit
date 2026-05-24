import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getSpendingTrends,
  getToolAdoptionAnalytics,
  getAIUtilizationScore,
  getProjectedFutureSpend,
} from "@/lib/services/analytics-service";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "trends";

  switch (type) {
    case "trends":
      return NextResponse.json(await getSpendingTrends(session.user.id));
    case "adoption":
      return NextResponse.json(await getToolAdoptionAnalytics(session.user.id));
    case "utilization":
      return NextResponse.json(await getAIUtilizationScore(session.user.id));
    case "projection":
      return NextResponse.json(await getProjectedFutureSpend(session.user.id));
    default:
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
}
