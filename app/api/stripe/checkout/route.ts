import { NextResponse } from "next/server";
import { createStripeCheckoutSession } from "@/lib/services/subscription-service";
import { requireUserId } from "@/lib/auth/dal";
import { parseBody, withErrorHandling } from "@/lib/errors";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";
import { stripeCheckoutSchema } from "@/lib/validation/schemas";

export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  await rateLimitOrThrow(`stripe:checkout:${userId}`, 10, 60000);
  const { priceId, plan } = await parseBody(request, stripeCheckoutSchema);

  // Plan/price are validated server-side inside the service: price ids are
  // resolved from environment configuration and a client-supplied id is only
  // accepted when it matches the configured value for the requested plan.
  const url = await createStripeCheckoutSession(userId, plan, priceId);
  return NextResponse.json({ url });
});
export const runtime = "nodejs";
