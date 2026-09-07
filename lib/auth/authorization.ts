import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { UserRole } from "@prisma/client";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 3,
  ANALYST: 2,
  VIEWER: 1,
};

const ROLE_PERMISSIONS: Record<string, UserRole[]> = {
  "audit:create": ["ADMIN", "ANALYST"],
  "audit:read": ["ADMIN", "ANALYST", "VIEWER"],
  "audit:delete": ["ADMIN", "ANALYST"],
  "analytics:read": ["ADMIN", "ANALYST", "VIEWER"],
  "analytics:org-read": ["ADMIN", "ANALYST", "VIEWER"],
  "analytics:write": ["ADMIN", "ANALYST"],
  "ai:use": ["ADMIN", "ANALYST"],
  "notification:read": ["ADMIN", "ANALYST", "VIEWER"],
  "notification:write": ["ADMIN", "ANALYST"],
  "org:read": ["ADMIN", "ANALYST", "VIEWER"],
  "org:manage": ["ADMIN"],
  "org:create": ["ADMIN", "ANALYST", "VIEWER"],
  "member:invite": ["ADMIN"],
  "member:update": ["ADMIN"],
  "member:remove": ["ADMIN"],
  "department:create": ["ADMIN"],
  "department:read": ["ADMIN", "ANALYST", "VIEWER"],
  "billing:manage": ["ADMIN"],
  "admin:stats": ["ADMIN"],
};

export class AuthorizationError extends ApiError {
  constructor(message: string, statusCode: number = 403) {
    super(message, statusCode);
    this.name = "AuthorizationError";
  }
}

export function hasPermission(userRole: UserRole, permission: string): boolean {
  const allowedRoles = ROLE_PERMISSIONS[permission];
  if (!allowedRoles) return false;
  return allowedRoles.includes(userRole);
}

export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

export const getMembership = cache(
  async (userId: string, organizationId: string | null) => {
    return prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, role: true, organizationId: true },
    });
  }
);

export async function requireOrgMembership(userId: string, organizationId: string | null) {
  const membership = await getMembership(userId, organizationId);
  if (!membership) {
    throw new AuthorizationError("You are not a member of this organization", 403);
  }
  return membership;
}

export async function requireRole(userId: UserRole | string, ...allowedRoles: UserRole[]): Promise<void> {
  if (typeof userId === "string") {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new AuthorizationError("User not found", 404);
    if (!allowedRoles.includes(user.role)) {
      throw new AuthorizationError("Insufficient permissions", 403);
    }
    return;
  }
  if (!allowedRoles.includes(userId)) {
    throw new AuthorizationError("Insufficient permissions", 403);
  }
}

/**
 * Platform admins are explicitly designated (isPlatformAdmin on the seeded
 * account) and are the ONLY users allowed to read global/tenant-wide stats or
 * mutate the shared pricing catalog. A user's *org* role (ADMIN within their
 * own organization) grants organization management only — never platform-wide
 * access. This closes the previous escalation path where creating an org
 * minted a global ADMIN.
 */
export async function requirePlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });
  if (!user) throw new AuthorizationError("User not found", 404);
  if (!user.isPlatformAdmin) {
    throw new AuthorizationError("Insufficient permissions", 403);
  }
  return user;
}

export async function requireOrgPermission(
  userId: string,
  organizationId: string | null,
  permission: string
) {
  const membership = await requireOrgMembership(userId, organizationId);
  if (!hasPermission(membership.role, permission)) {
    throw new AuthorizationError("Insufficient permissions", 403);
  }
  return membership;
}

export const getUserWithOrg = cache(async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      organizationId: true,
    },
  });
});

export async function requireUserOrg(userId: string) {
  const user = await getUserWithOrg(userId);
  if (!user) throw new AuthorizationError("User not found", 404);
  if (!user.organizationId) {
    throw new AuthorizationError("You must belong to an organization", 403);
  }
  return user;
}
