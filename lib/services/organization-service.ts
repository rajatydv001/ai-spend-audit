import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit-log";
import { v4 as uuidv4 } from "uuid";
import type { UserRole } from "@prisma/client";
import { requireOrgPermission } from "@/lib/auth/authorization";
import { ApiError, badRequest, conflict, notFound, forbidden } from "@/lib/errors";
import { env } from "@/lib/env";
import { createHash } from "node:crypto";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Invite tokens are only ever stored as a SHA-256 digest. The raw token is
 * returned to the inviter once (the invite URL) and is never persisted, so a
 * leaked database cannot be used to accept other people's invitations.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildInviteUrl(token: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
}

const INVITE_RETURN_FIELDS = {
  id: true,
  email: true,
  role: true,
  organizationId: true,
  senderId: true,
  expiresAt: true,
  acceptedAt: true,
  declinedAt: true,
  createdAt: true,
} as const;

export async function createOrganization(name: string, userId?: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      ...(userId ? { members: { connect: { id: userId } } } : {}),
    },
  });

  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { organizationId: org.id, role: "ADMIN" },
    });
  }

  await createAuditLog({
    userId: userId || "anonymous",
    action: "organization.created",
    entity: "organization",
    entityId: org.id,
    metadata: JSON.stringify({ name }),
  });

  return org;
}

export async function getOrganization(organizationId: string) {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          createdAt: true,
        },
      },
      departments: { orderBy: { name: "asc" } },
    },
  });
}

export async function getCurrentOrganization(userId: string) {
  const membership = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  const organizationId = membership?.organizationId;
  if (!organizationId) {
    return { org: null, role: null };
  }
  const org = await getOrganization(organizationId);
  const myRole = org?.members.find((member) => member.id === userId)?.role ?? null;
  return { org, role: myRole };
}

export async function inviteMember(
  organizationId: string,
  email: string,
  role: UserRole,
  senderId?: string
) {
  if (senderId) {
    await requireOrgPermission(senderId, organizationId, "member:invite");
  }
  const normalizedEmail = email.trim().toLowerCase();

  const existingMember = await prisma.user.findFirst({
    where: { organizationId, email: normalizedEmail },
    select: { id: true },
  });
  if (existingMember) {
    throw conflict("This user is already a member of the organization");
  }

  const existingActive = await prisma.invite.findFirst({
    where: {
      organizationId,
      email: normalizedEmail,
      acceptedAt: null,
      declinedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (existingActive) {
    throw conflict("An active invitation already exists for this email");
  }

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const token = uuidv4();

  const invite = await prisma.invite.create({
    data: {
      email: normalizedEmail,
      role,
      organizationId,
      senderId: senderId || "anonymous",
      recipientId: existingUser?.id,
      token: hashInviteToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    select: INVITE_RETURN_FIELDS,
  });

  const [org, sender] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    senderId
      ? prisma.user.findUnique({ where: { id: senderId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  await createAuditLog({
    userId: senderId || "anonymous",
    action: "user.invited",
    entity: "invite",
    entityId: invite.id,
    metadata: JSON.stringify({ email: normalizedEmail, role }),
  });

  return {
    invite,
    // The raw token exists only in this response; the database holds the hash.
    rawToken: token,
    inviteUrl: buildInviteUrl(token),
    organizationName: org?.name ?? "",
    senderName: sender?.name ?? null,
  };
}

async function getInviteIdentity(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, organizationId: true },
  });
}

function isAddressedTo(
  invite: { email: string; recipientId: string | null },
  user: { id: string; email: string | null }
) {
  const recipientMatch = invite.recipientId ? invite.recipientId === user.id : false;
  return recipientMatch || (user.email != null && user.email.toLowerCase() === invite.email.toLowerCase());
}

export async function acceptInvite(token: string, userId: string) {
  const user = await getInviteIdentity(userId);
  if (!user) throw notFound("User not found");

  const invite = await prisma.invite.findUnique({
    where: { token: hashInviteToken(token) },
  });
  if (!invite) throw new ApiError("Invitation not found", 404);
  if (invite.declinedAt) throw conflict("This invitation was declined");
  if (invite.acceptedAt) throw conflict("This invitation has already been used");
  if (invite.expiresAt < new Date()) throw badRequest("This invitation has expired");
  if (!isAddressedTo(invite, user)) {
    throw forbidden("This invitation is not addressed to you");
  }
  if (user.organizationId === invite.organizationId) {
    throw conflict("You are already a member of this organization");
  }

  // Atomic single-use claim: only one concurrent accept can win the updateMany.
  const joined = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, acceptedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw conflict("This invitation has already been used");
    }
    return tx.user.update({
      where: { id: userId },
      data: { organizationId: invite.organizationId, role: invite.role },
    });
  });

  await createAuditLog({
    userId,
    action: "invite.accepted",
    entity: "invite",
    entityId: invite.id,
    metadata: JSON.stringify({ organizationId: invite.organizationId, role: invite.role }),
  });

  return joined;
}

export async function declineInvite(token: string, userId: string) {
  const user = await getInviteIdentity(userId);
  if (!user) throw notFound("User not found");

  const invite = await prisma.invite.findUnique({
    where: { token: hashInviteToken(token) },
  });
  if (!invite) throw new ApiError("Invitation not found", 404);
  if (invite.acceptedAt) throw conflict("This invitation has already been used");
  if (!isAddressedTo(invite, user)) {
    throw forbidden("This invitation is not addressed to you");
  }

  if (!invite.declinedAt) {
    await prisma.invite.updateMany({
      where: { id: invite.id, declinedAt: null },
      data: { declinedAt: new Date() },
    });
    await createAuditLog({
      userId,
      action: "invite.declined",
      entity: "invite",
      entityId: invite.id,
      metadata: JSON.stringify({ organizationId: invite.organizationId, role: invite.role }),
    });
  }

  return { success: true };
}

export type InviteSummary =
  | { status: "not_found" }
  | {
      status: "expired" | "used" | "declined" | "valid";
      id: string;
      organizationId: string;
      organizationName: string;
      role: UserRole;
      email: string;
      recipientId: string | null;
      expiresAt: Date;
    };

export async function getInviteSummary(token: string): Promise<InviteSummary> {
  const invite = await prisma.invite.findUnique({
    where: { token: hashInviteToken(token) },
    include: { organization: { select: { name: true } } },
  });
  if (!invite) {
    return { status: "not_found" };
  }

  let status: "expired" | "used" | "declined" | "valid";
  if (invite.expiresAt < new Date()) status = "expired";
  else if (invite.acceptedAt) status = "used";
  else if (invite.declinedAt) status = "declined";
  else status = "valid";

  return {
    status,
    id: invite.id,
    organizationId: invite.organizationId,
    organizationName: invite.organization.name,
    role: invite.role,
    email: invite.email,
    recipientId: invite.recipientId,
    expiresAt: invite.expiresAt,
  };
}

export async function listPendingInvites(organizationId: string, actorId: string) {
  await requireOrgPermission(actorId, organizationId, "member:invite");
  return prisma.invite.findMany({
    where: { organizationId, acceptedAt: null, declinedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      acceptedAt: true,
      declinedAt: true,
      recipientId: true,
      sender: { select: { name: true } },
    },
  });
}

export async function updateMemberRole(
  organizationId: string,
  memberId: string,
  role: UserRole,
  actorId?: string
) {
  if (actorId) {
    await requireOrgPermission(actorId, organizationId, "member:update");
  }
  const member = await prisma.user.findFirst({
    where: { id: memberId, organizationId },
  });
  if (!member) throw new ApiError("Member not found in organization", 404);

  if (member.role === "ADMIN" && role !== "ADMIN") {
    await assertNotLastAdmin(organizationId, member.role);
  }

  await prisma.user.update({
    where: { id: memberId },
    data: { role },
  });

  await createAuditLog({
    userId: actorId || "anonymous",
    action: "user.role_changed",
    entity: "user",
    entityId: memberId,
    metadata: JSON.stringify({ role }),
  });
}

export async function removeMember(organizationId: string, memberId: string, actorId?: string) {
  if (actorId) {
    await requireOrgPermission(actorId, organizationId, "member:remove");
  }
  const member = await prisma.user.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true, role: true },
  });
  // Unknown memberId (e.g. forged, or a member of another org) must never be written.
  if (!member) throw new ApiError("Member not found in organization", 404);

  if (member.role === "ADMIN") {
    await assertNotLastAdmin(organizationId, member.role);
  }

  await prisma.user.update({
    where: { id: memberId },
    data: { organizationId: null, role: "VIEWER" },
  });

  await createAuditLog({
    userId: actorId || "anonymous",
    action: "organization.member_removed",
    entity: "user",
    entityId: memberId,
    metadata: JSON.stringify({ organizationId }),
  });
}

async function assertNotLastAdmin(organizationId: string, memberRole: UserRole) {
  if (memberRole !== "ADMIN") return;
  const adminCount = await prisma.user.count({ where: { organizationId, role: "ADMIN" } });
  if (adminCount <= 1) {
    throw badRequest("The organization must retain at least one administrator");
  }
}

export async function createDepartment(organizationId: string, name: string, actorId?: string) {
  if (actorId) {
    await requireOrgPermission(actorId, organizationId, "department:create");
  }
  return prisma.department.create({
    data: { name, organizationId },
  });
}

export async function getDepartments(organizationId: string) {
  return prisma.department.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}