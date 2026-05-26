import { NextResponse } from "next/server";
import {
  getSpendingTrends,
  getToolAdoptionAnalytics,
  getAIUtilizationScore,
  getProjectedFutureSpend,
} from "@/lib/services/analytics-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "trends";

  switch (type) {
    case "trends":
      return NextResponse.json(await getSpendingTrends(""));
    case "adoption":
      return NextResponse.json(await getToolAdoptionAnalytics(""));
    case "utilization":
      return NextResponse.json(await getAIUtilizationScore(""));
    case "projection":
      return NextResponse.json(await getProjectedFutureSpend(""));
    default:
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
}
