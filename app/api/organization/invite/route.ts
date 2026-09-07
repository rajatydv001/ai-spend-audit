import { NextResponse } from "next/server";
import { listPendingInvites } from "@/lib/services/organization-service";
import { requireUserId } from "@/lib/auth/dal";
import { withErrorHandling, badRequest } from "@/lib/errors";

export const GET = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) {
    throw badRequest("orgId is required");
  }

  const invites = await listPendingInvites(orgId, userId);
  return NextResponse.json({ invites });
});
export const runtime = "nodejs";
