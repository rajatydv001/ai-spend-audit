import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createBillingPortalSession } from "@/lib/services/subscription-service";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = await createBillingPortalSession(session.user.id);
  if (!url) {
    return NextResponse.json({ error: "No billing portal available" }, { status: 400 });
  }

  return NextResponse.json({ url });
}
