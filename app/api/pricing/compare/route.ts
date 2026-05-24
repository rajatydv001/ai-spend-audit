import { NextResponse } from "next/server";
import { compareToolPricing, detectRedundantSubscriptions, estimateAnnualSpend } from "@/lib/services/pricing-intelligence";

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  switch (action) {
    case "compare": {
      const { tool, plan, users } = body;
      if (!tool || !plan || !users) {
        return NextResponse.json({ error: "tool, plan, users required" }, { status: 400 });
      }
      return NextResponse.json(compareToolPricing(tool, plan, users));
    }
    case "redundant": {
      const { tools } = body;
      if (!tools) {
        return NextResponse.json({ error: "tools array required" }, { status: 400 });
      }
      return NextResponse.json(detectRedundantSubscriptions(tools));
    }
    case "project": {
      const { currentSpend, growthRate } = body;
      if (!currentSpend) {
        return NextResponse.json({ error: "currentSpend required" }, { status: 400 });
      }
      return NextResponse.json(estimateAnnualSpend(currentSpend, growthRate));
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
