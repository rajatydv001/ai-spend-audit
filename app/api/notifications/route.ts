import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  saveNotificationPreference,
  getNotificationPreferences,
} from "@/lib/services/notification-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [notifications, unreadCount, preferences] = await Promise.all([
    getNotifications(session.user.id),
    getUnreadNotificationCount(session.user.id),
    getNotificationPreferences(session.user.id),
  ]);

  return NextResponse.json({ notifications, unreadCount, preferences });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, enabled } = await request.json();
  const pref = await saveNotificationPreference(session.user.id, type, enabled);
  return NextResponse.json(pref);
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markAllNotificationsRead(session.user.id);
  return NextResponse.json({ success: true });
}
