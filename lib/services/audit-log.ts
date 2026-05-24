import { prisma } from "@/lib/db";

export type AuditAction =
  | "audit.created"
  | "audit.deleted"
  | "audit.viewed"
  | "report.exported"
  | "user.invited"
  | "user.role_changed"
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
  try {
    await prisma.auditLog.create({ data: params });
  } catch {
    console.error("Audit log write failed:", params.action);
  }
}
