import { NextResponse } from "next/server";
import { createDepartment, getDepartments } from "@/lib/services/organization-service";
import { requireUserId } from "@/lib/auth/dal";
import { requireOrgMembership, requireOrgPermission } from "@/lib/auth/authorization";
import { assertFeature } from "@/lib/services/entitlements";
import { parseBody, withErrorHandling, badRequest } from "@/lib/errors";
import { createDepartmentSchema } from "@/lib/validation/schemas";

export const GET = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) {
    throw badRequest("orgId is required");
  }

  await requireOrgMembership(userId, orgId);
  await assertFeature(userId, "team");
  const departments = await getDepartments(orgId);
  return NextResponse.json(departments);
});

export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const { orgId, name } = await parseBody(request, createDepartmentSchema);

  await requireOrgPermission(userId, orgId, "department:create");
  await assertFeature(userId, "team");
  const dept = await createDepartment(orgId, name, userId);
  return NextResponse.json(dept, { status: 201 });
});

export const runtime = "nodejs";
