import { NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/services/notification-service";
import { DEFAULT_USER_ID } from "@/lib/defaults";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await markNotificationRead(id, DEFAULT_USER_ID);
  return NextResponse.json({ success: true });
}
