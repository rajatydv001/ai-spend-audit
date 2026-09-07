import { NextResponse } from "next/server";
import { getBillingInfo } from "@/lib/services/subscription-service";
import { requireUserId } from "@/lib/auth/dal";
import { withErrorHandling } from "@/lib/errors";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const info = await getBillingInfo(userId);
  return NextResponse.json(info);
});
export const runtime = "nodejs";
