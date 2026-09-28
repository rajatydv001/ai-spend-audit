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
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "organization.created"
  | "organization.updated"
  | "subscription.changed"
  | "settings.updated"
  | "admin.action";

/** The subset of the Prisma client the audit log needs. */
type AuditLogClient = {
  auditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

export async function createAuditLog(
  params: {
    userId?: string;
    action: AuditAction;
    entity: string;
    entityId?: string;
    metadata?: string;
    ipAddress?: string;
    departmentId?: string;
  },
  // Signup passes its transaction client so the trail commits atomically with
  // the account it describes. Defaults to the global client everywhere else.
  client: AuditLogClient = prisma as unknown as AuditLogClient
) {
  // `userId` is a foreign key into User.id. Anonymous events (duplicate signup,
  // failed login) pass the sentinel "anonymous", which references no real row
  // and would raise P2003, silently dropping the event. Normalize it to NULL
  // (no actor) so the event always persists without weakening the FK.
  const { userId, ...rest } = params;
  const actor = userId === undefined ? {} : { userId: userId === "anonymous" ? null : userId };
  try {
    await client.auditLog.create({ data: { ...rest, ...actor } });
  } catch {
    console.error("Audit log write failed:", params.action);
  }
}
