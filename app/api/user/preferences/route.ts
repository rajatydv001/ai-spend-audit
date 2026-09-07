import { NextResponse } from "next/server";
import { getUserPreferences, updateUserPreferences } from "@/lib/services/audit-service";
import { requireUserId } from "@/lib/auth/dal";
import { parseBody, withErrorHandling } from "@/lib/errors";
import { preferencesSchema } from "@/lib/validation/schemas";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const prefs = await getUserPreferences(userId);
  return NextResponse.json(prefs);
});

export const PUT = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const body = await parseBody(request, preferencesSchema);

  const updated = await updateUserPreferences(userId, body);
  return NextResponse.json(updated);
});

export const runtime = "nodejs";
