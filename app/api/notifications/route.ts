import { NextResponse } from "next/server";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  saveNotificationPreference,
  getNotificationPreferences,
} from "@/lib/services/notification-service";
import { requireUserId } from "@/lib/auth/dal";
import { parseBody, withErrorHandling } from "@/lib/errors";
import { notificationPreferenceSchema } from "@/lib/validation/schemas";

export const GET = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();

  const url = new URL(request.url);
  const rawTake = url.searchParams.get("take");
  const take = rawTake ? Math.min(Math.max(parseInt(rawTake, 10) || 50, 1), 100) : 50;
  const cursor = url.searchParams.get("cursor") || undefined;

  const [notifications, unreadCount, preferences] = await Promise.all([
    getNotifications(userId, take, cursor),
    getUnreadNotificationCount(userId),
    getNotificationPreferences(userId),
  ]);

  return NextResponse.json({ notifications, unreadCount, preferences });
});

export const PUT = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const { type, enabled } = await parseBody(request, notificationPreferenceSchema);
  const pref = await saveNotificationPreference(userId, type, enabled);
  return NextResponse.json(pref);
});

export const PATCH = withErrorHandling(async () => {
  const userId = await requireUserId();
  await markAllNotificationsRead(userId);
  return NextResponse.json({ success: true });
});

export const runtime = "nodejs";
