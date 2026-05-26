import { NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/services/notification-service";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await markNotificationRead(id, "");
  return NextResponse.json({ success: true });
}
