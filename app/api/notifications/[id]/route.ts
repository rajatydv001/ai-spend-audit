import { NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/services/notification-service";
import { requireUserId } from "@/lib/auth/dal";
import { withErrorHandling } from "@/lib/errors";

export const PATCH = withErrorHandling(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;
    const userId = await requireUserId();
    await markNotificationRead(id, userId);
    return NextResponse.json({ success: true });
  }
);

export const runtime = "nodejs";
