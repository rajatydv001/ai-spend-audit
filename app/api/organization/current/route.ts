import { NextResponse } from "next/server";
import { getCurrentOrganization } from "@/lib/services/organization-service";
import { requireUserId } from "@/lib/auth/dal";
import { withErrorHandling } from "@/lib/errors";

export const GET = withErrorHandling(async (_request: Request) => {
  const userId = await requireUserId();

  const { org, role } = await getCurrentOrganization(userId);
  return NextResponse.json({ org, role, userId });
});
export const runtime = "nodejs";
