import { NextResponse } from "next/server";
import { compareToolPricing, detectRedundantSubscriptions, estimateAnnualSpend } from "@/lib/services/pricing-intelligence";
import { parseBody, withErrorHandling } from "@/lib/errors";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";
import { requireUserId } from "@/lib/auth/dal";
import { requireRole } from "@/lib/auth/authorization";
import { pricingCompareActionSchema } from "@/lib/validation/schemas";

export const POST = withErrorHandling(async (request: Request) => {
  // Same centralized authorization as every other pricing read: any signed-in
  // role may consult the (public) pricing surface, anonymous callers cannot.
  const userId = await requireUserId();
  await requireRole(userId, "ADMIN", "ANALYST", "VIEWER");

  await rateLimitOrThrow(`pricing:compare:${userId}`, 60, 60000);

  const body = await parseBody(request, pricingCompareActionSchema);

  switch (body.action) {
    case "compare":
      return NextResponse.json(compareToolPricing(body.tool, body.plan, body.users));
    case "redundant":
      return NextResponse.json(detectRedundantSubscriptions(body.tools));
    case "project":
      return NextResponse.json(estimateAnnualSpend(body.currentSpend, body.growthRate));
  }
});
export const runtime = "nodejs";
