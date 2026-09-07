import { NextResponse } from "next/server";
import { acceptInvite } from "@/lib/services/organization-service";
import { requireUserId } from "@/lib/auth/dal";
import { parseBody, withErrorHandling } from "@/lib/errors";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";
import { z } from "zod";

const acceptInviteSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  await rateLimitOrThrow(`invite-accept:${userId}`, 10, 15 * 60 * 1000);
  const { token } = await parseBody(request, acceptInviteSchema);

  await acceptInvite(token, userId);
  return NextResponse.json({ success: true });
});

export const runtime = "nodejs";
