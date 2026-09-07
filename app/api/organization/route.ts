import { NextResponse } from "next/server";
import { createOrganization, getOrganization } from "@/lib/services/organization-service";
import { requireUserId } from "@/lib/auth/dal";
import { requireOrgMembership } from "@/lib/auth/authorization";
import { parseBody, withErrorHandling, badRequest, ApiError } from "@/lib/errors";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";
import { z } from "zod";

const createOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required").trim(),
});

export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  await rateLimitOrThrow(`org:create:${userId}`, 5, 60000);
  const { name } = await parseBody(request, createOrgSchema);

  const org = await createOrganization(name, userId);
  return NextResponse.json(org, { status: 201 });
});

export const GET = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) {
    throw badRequest("orgId is required");
  }

  await requireOrgMembership(userId, orgId);
  const org = await getOrganization(orgId);
  if (!org) {
    throw new ApiError("Not found", 404);
  }
  return NextResponse.json(org);
});

export const runtime = "nodejs";
