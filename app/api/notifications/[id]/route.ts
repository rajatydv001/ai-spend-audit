import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markNotificationRead } from "@/lib/services/notification-service";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await markNotificationRead(id, session.user.id);
  return NextResponse.json({ success: true });
}
