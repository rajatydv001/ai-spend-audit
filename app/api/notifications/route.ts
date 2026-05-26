import { NextResponse } from "next/server";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  saveNotificationPreference,
  getNotificationPreferences,
} from "@/lib/services/notification-service";

export async function GET() {
  const [notifications, unreadCount, preferences] = await Promise.all([
    getNotifications(""),
    getUnreadNotificationCount(""),
    getNotificationPreferences(""),
  ]);

  return NextResponse.json({ notifications, unreadCount, preferences });
}

export async function PUT(request: Request) {
  const { type, enabled } = await request.json();
  const pref = await saveNotificationPreference("", type, enabled);
  return NextResponse.json(pref);
}

export async function PATCH() {
  await markAllNotificationsRead("");
  return NextResponse.json({ success: true });
}
