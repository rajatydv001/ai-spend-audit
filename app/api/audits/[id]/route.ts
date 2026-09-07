import { NextResponse } from "next/server";
import { getAuditById, deleteAudit } from "@/lib/services/audit-service";
import { requireUserId } from "@/lib/auth/dal";
import { requireUserOrg, requireOrgPermission } from "@/lib/auth/authorization";
import { withErrorHandling } from "@/lib/errors";

export const GET = withErrorHandling(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;
    const userId = await requireUserId();
    const user = await requireUserOrg(userId);

    const audit = await getAuditById(id, userId, user.organizationId);
    if (!audit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(audit);
  }
);

export const DELETE = withErrorHandling(
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;
    const userId = await requireUserId();
    const user = await requireUserOrg(userId);
    await requireOrgPermission(userId, user.organizationId, "audit:delete");

    const deleted = await deleteAudit(id, userId, user.organizationId);
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }
);

export const runtime = "nodejs";
