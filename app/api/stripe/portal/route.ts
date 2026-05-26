import { NextResponse } from "next/server";
import { createBillingPortalSession } from "@/lib/services/subscription-service";

export async function POST() {
  const url = await createBillingPortalSession("");
  if (!url) {
    return NextResponse.json({ error: "No billing portal available" }, { status: 400 });
  }

  return NextResponse.json({ url });
}
