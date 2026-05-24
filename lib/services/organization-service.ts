import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit-log";
import { v4 as uuidv4 } from "uuid";
import type { UserRole } from "@prisma/client";

export async function createOrganization(name: string, userId: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      members: { connect: { id: userId } },
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { organizationId: org.id, role: "ADMIN" },
  });

  await createAuditLog({
    userId,
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

export async function inviteMember(
  organizationId: string,
  email: string,
  role: UserRole,
  senderId: string
) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  const token = uuidv4();

  const invite = await prisma.invite.create({
    data: {
      email,
      role,
      organizationId,
      senderId,
      recipientId: existingUser?.id,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await createAuditLog({
    userId: senderId,
    action: "user.invited",
    entity: "invite",
    entityId: invite.id,
    metadata: JSON.stringify({ email, role }),
  });

  return invite;
}

export async function acceptInvite(token: string, userId: string) {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) throw new Error("Invite not found");
  if (invite.expiresAt < new Date()) throw new Error("Invite expired");

  await prisma.user.update({
    where: { id: userId },
    data: {
      organizationId: invite.organizationId,
      role: invite.role,
    },
  });

  await prisma.invite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  return invite;
}

export async function updateMemberRole(
  organizationId: string,
  memberId: string,
  role: UserRole,
  actorId: string
) {
  const member = await prisma.user.findFirst({
    where: { id: memberId, organizationId },
  });
  if (!member) throw new Error("Member not found in organization");

  await prisma.user.update({
    where: { id: memberId },
    data: { role },
  });

  await createAuditLog({
    userId: actorId,
    action: "user.role_changed",
    entity: "user",
    entityId: memberId,
    metadata: JSON.stringify({ role }),
  });
}

export async function removeMember(organizationId: string, memberId: string) {
  await prisma.user.update({
    where: { id: memberId },
    data: { organizationId: null, role: "VIEWER" },
  });
}

export async function createDepartment(organizationId: string, name: string) {
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
