import { NextResponse } from "next/server";
import { createBillingPortalSession } from "@/lib/services/subscription-service";
import { requireUserId } from "@/lib/auth/dal";
import { withErrorHandling } from "@/lib/errors";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";

export const POST = withErrorHandling(async () => {
  const userId = await requireUserId();
  await rateLimitOrThrow(`stripe:portal:${userId}`, 20, 60000);

  const url = await createBillingPortalSession(userId);
  if (!url) {
    return NextResponse.json({ error: "No billing portal available" }, { status: 400 });
  }

  return NextResponse.json({ url });
});
export const runtime = "nodejs";
