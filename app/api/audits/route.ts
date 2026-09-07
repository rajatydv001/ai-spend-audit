import { NextResponse } from "next/server";
import { createAuditWithinLimit, getAuditsByUser, createAuditInputSchema } from "@/lib/services/audit-service";
import { createAuditLog } from "@/lib/services/audit-log";
import { rateLimitOrThrow, getClientIp } from "@/lib/services/rate-limit";
import { requireUserId } from "@/lib/auth/dal";
import { requireUserOrg, requireOrgPermission, requireRole } from "@/lib/auth/authorization";
import { parseBody, withErrorHandling } from "@/lib/errors";

export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const user = await requireUserOrg(userId);
  await requireRole(userId, "ADMIN", "ANALYST", "VIEWER");

  const audits = await getAuditsByUser(user.id, user.organizationId);
  return NextResponse.json(audits);
});

export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const user = await requireUserOrg(userId);
  const orgId = user.organizationId;
  if (orgId) {
    await requireOrgPermission(userId, orgId, "audit:create");
  } else {
    await requireRole(userId, "ADMIN", "ANALYST");
  }

  const ip = getClientIp(request);
  await rateLimitOrThrow(`audit:${userId}`, 10, 60000);

  const data = await parseBody(request, createAuditInputSchema);
  // Plan limit and audit creation happen atomically server-side; the client can
  // neither choose the plan nor slip past the limit with concurrent requests.
  const audit = await createAuditWithinLimit(userId, data, orgId || undefined);

  await createAuditLog({
    userId,
    action: "audit.created",
    entity: "audit",
    entityId: audit.id,
    ipAddress: ip,
  });

  return NextResponse.json(audit, { status: 201 });
});

export const runtime = "nodejs";
