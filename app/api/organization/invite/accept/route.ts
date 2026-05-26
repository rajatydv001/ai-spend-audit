import { NextResponse } from "next/server";
import { acceptInvite } from "@/lib/services/organization-service";

export async function POST(request: Request) {
  const { token } = await request.json();
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  try {
    await acceptInvite(token, "");
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to accept invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
