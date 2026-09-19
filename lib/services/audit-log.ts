import { prisma } from "@/lib/db";

export type AuditAction =
  | "audit.created"
  | "audit.deleted"
  | "audit.viewed"
  | "report.exported"
  | "user.invited"
  | "invite.accepted"
  | "invite.declined"
  | "organization.member_removed"
  | "user.role_changed"
  | "user.created"
  | "user.login"
  | "auth.signup_duplicate"
  | "auth.login_failed"
  | "organization.created"
  | "organization.updated"
  | "subscription.changed"
  | "settings.updated"
  | "admin.action";

export async function createAuditLog(params: {
  userId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  metadata?: string;
  ipAddress?: string;
  departmentId?: string;
}) {
  // `userId` is a foreign key into User.id. Anonymous events (duplicate signup,
  // failed login) pass the sentinel "anonymous", which references no real row
  // and would raise P2003, silently dropping the event. Normalize it to NULL
  // (no actor) so the event always persists without weakening the FK.
  const { userId, ...rest } = params;
  const actor = userId === undefined ? {} : { userId: userId === "anonymous" ? null : userId };
  try {
    await prisma.auditLog.create({ data: { ...rest, ...actor } });
  } catch {
    console.error("Audit log write failed:", params.action);
  }
}
