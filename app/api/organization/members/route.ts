import { NextResponse } from "next/server";
import { inviteMember, updateMemberRole, removeMember } from "@/lib/services/organization-service";
import { sendInviteEmail } from "@/lib/services/notification-service";
import { requireUserId } from "@/lib/auth/dal";
import { requireOrgPermission } from "@/lib/auth/authorization";
import { parseBody, withErrorHandling, forbidden } from "@/lib/errors";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";
import { inviteMemberSchema, memberActionSchema, memberRoleUpdateSchema } from "@/lib/validation/schemas";

const MEMBER_ACTIONS_WINDOW_MS = 60 * 60 * 1000;

export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const { orgId, email, role } = await parseBody(request, inviteMemberSchema);

  await requireOrgPermission(userId, orgId, "member:invite");
  await rateLimitOrThrow(`members:${userId}`, 30, MEMBER_ACTIONS_WINDOW_MS, "Too many invite attempts. Please try again later.");

  const { invite, inviteUrl, organizationName, senderName } = await inviteMember(orgId, email, role, userId);
  const emailResult = await sendInviteEmail({
    to: invite.email,
    inviteUrl,
    organizationName,
    senderName,
    role: invite.role,
  });

  return NextResponse.json(
    { invite, inviteUrl, emailStatus: emailResult.status },
    { status: 201 }
  );
});

export const PATCH = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const { orgId, memberId, role } = await parseBody(request, memberRoleUpdateSchema);

  await requireOrgPermission(userId, orgId, "member:update");
  await rateLimitOrThrow(`members:${userId}`, 30, MEMBER_ACTIONS_WINDOW_MS, "Too many member updates. Please try again later.");

  if (memberId === userId) {
    throw forbidden("You cannot change your own role");
  }

  await updateMemberRole(orgId, memberId, role, userId);
  return NextResponse.json({ success: true });
});

export const DELETE = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const { orgId, memberId } = await parseBody(request, memberActionSchema);

  await requireOrgPermission(userId, orgId, "member:remove");
  await rateLimitOrThrow(`members:${userId}`, 30, MEMBER_ACTIONS_WINDOW_MS, "Too many member removals. Please try again later.");

  if (memberId === userId) {
    throw forbidden("You cannot remove yourself");
  }

  await removeMember(orgId, memberId, userId);
  return NextResponse.json({ success: true });
});

export const runtime = "nodejs";
