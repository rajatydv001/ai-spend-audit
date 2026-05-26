import { NextResponse } from "next/server";
import { createStripeCheckoutSession } from "@/lib/services/subscription-service";

export async function POST(request: Request) {
  const { priceId, plan } = await request.json();
  if (!priceId || !plan) {
    return NextResponse.json({ error: "Missing priceId or plan" }, { status: 400 });
  }

  const url = await createStripeCheckoutSession("", priceId, plan);
  if (!url) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  return NextResponse.json({ url });
}
