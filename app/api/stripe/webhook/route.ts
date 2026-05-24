import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { handleStripeWebhook } from "@/lib/services/subscription-service";

export async function POST(request: Request) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  await handleStripeWebhook(event);

  return NextResponse.json({ received: true });
}
