import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/errors";

/**
 * Team-entitlement regression suite. The ROUTES are real and call the real
 * assertFeature/getUserEntitlements; only the data source (prisma) and the
 * side services are mocked so we can prove the server-side `features.team`
 * gate without a database.
 */

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireOrgPermission: vi.fn(),
  requireOrgMembership: vi.fn(),
  requireUserOrg: vi.fn(),
  requireRole: vi.fn(),
  rateLimitOrThrow: vi.fn(),
  getClientIp: vi.fn(),
  findUnique: vi.fn(),
  auditCount: vi.fn(),
  savedReportCount: vi.fn(),
  createOrganization: vi.fn(),
  getOrganization: vi.fn(),
  getCurrentOrganization: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
  listPendingInvites: vi.fn(),
  createDepartment: vi.fn(),
  getDepartments: vi.fn(),
  sendInviteEmail: vi.fn(),
  createAuditWithinLimit: vi.fn(),
  getAuditsByUser: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requireOrgPermission: mocks.requireOrgPermission,
  requireOrgMembership: mocks.requireOrgMembership,
  requireUserOrg: mocks.requireUserOrg,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    audit: { count: mocks.auditCount },
    savedReport: { count: mocks.savedReportCount },
  },
}));
vi.mock("@/lib/services/rate-limit", () => ({
  rateLimitOrThrow: mocks.rateLimitOrThrow,
  getClientIp: mocks.getClientIp,
}));
vi.mock("@/lib/services/organization-service", () => ({
  createOrganization: mocks.createOrganization,
  getOrganization: mocks.getOrganization,
  getCurrentOrganization: mocks.getCurrentOrganization,
  inviteMember: mocks.inviteMember,
  updateMemberRole: mocks.updateMemberRole,
  removeMember: mocks.removeMember,
  acceptInvite: mocks.acceptInvite,
  declineInvite: mocks.declineInvite,
  listPendingInvites: mocks.listPendingInvites,
  createDepartment: mocks.createDepartment,
  getDepartments: mocks.getDepartments,
}));
vi.mock("@/lib/services/audit-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/audit-service")>();
  return {
    ...actual,
    createAuditWithinLimit: mocks.createAuditWithinLimit,
    getAuditsByUser: mocks.getAuditsByUser,
  };
});
vi.mock("@/lib/services/notification-service", () => ({
  sendInviteEmail: mocks.sendInviteEmail,
}));
vi.mock("@/lib/services/audit-log", () => ({
  createAuditLog: mocks.createAuditLog,
}));

import {
  GET as OrgGET,
  POST as OrgPOST,
} from "@/app/api/organization/route";
import {
  POST as MembersPOST,
  PATCH as MembersPATCH,
  DELETE as MembersDELETE,
} from "@/app/api/organization/members/route";
import { GET as InvitesGET } from "@/app/api/organization/invite/route";
import { POST as DeclinePOST } from "@/app/api/organization/invite/decline/route";
import { POST as AcceptPOST } from "@/app/api/organization/invite/accept/route";
import { GET as CurrentGET } from "@/app/api/organization/current/route";
import {
  GET as DepartmentsGET,
  POST as DepartmentsPOST,
} from "@/app/api/organization/departments/route";
import { GET as EntitlementsGET } from "@/app/api/entitlements/route";
import { POST as AuditsPOST } from "@/app/api/audits/route";

const teamErr = "Team collaboration requires the Pro plan. Upgrade to enable it.";

const asJSON = (body: unknown, method: string, path: string) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const FREEAuth = { id: "u-free", subscription: null };
const PROAuth = { id: "u-pro", subscription: { plan: "PRO", status: "ACTIVE" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("u1");
  mocks.requireOrgPermission.mockResolvedValue({ role: "ADMIN", organizationId: "org-1" });
  mocks.requireOrgMembership.mockResolvedValue({ role: "ANALYST", organizationId: "org-1" });
  mocks.requireUserOrg.mockResolvedValue({ id: "u1", organizationId: "org-1" });
  mocks.requireRole.mockResolvedValue(undefined);
  mocks.rateLimitOrThrow.mockResolvedValue({ remaining: 9 });
  mocks.getClientIp.mockReturnValue("203.0.113.99");
  mocks.auditCount.mockResolvedValue(0);
  mocks.savedReportCount.mockResolvedValue(0);
  mocks.getCurrentOrganization.mockResolvedValue({ org: { id: "org-1", name: "Acme" }, role: "ADMIN", userId: "u1" });
  mocks.createOrganization.mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme-xxxx" });
  mocks.getOrganization.mockResolvedValue({ id: "org-1", name: "Acme", members: [], departments: [] });
  mocks.inviteMember.mockResolvedValue({
    invite: { id: "i1", email: "a@b.com", role: "ANALYST" },
    inviteUrl: "http://localhost:3000/invite/tok",
    organizationName: "Acme",
    senderName: null,
  });
  mocks.updateMemberRole.mockResolvedValue({ success: true });
  mocks.removeMember.mockResolvedValue({ success: true });
  mocks.acceptInvite.mockResolvedValue({ id: "u1", organizationId: "org-1" });
  mocks.declineInvite.mockResolvedValue({ success: true });
  mocks.listPendingInvites.mockResolvedValue([{ id: "i1", email: "a@b.com", role: "ANALYST" }]);
  mocks.createDepartment.mockResolvedValue({ id: "d1", name: "Engineering", organizationId: "org-1" });
  mocks.getDepartments.mockResolvedValue([{ id: "d1", name: "Engineering", organizationId: "org-1" }]);
  mocks.sendInviteEmail.mockResolvedValue({ status: "not_configured" });
  mocks.createAuditWithinLimit.mockResolvedValue({ id: "a1", userId: "u1" });
  mocks.createAuditLog.mockResolvedValue(undefined);
});

function setPlan(sub: unknown) {
  mocks.findUnique.mockResolvedValue(sub);
}

describe("F1 team entitlement — FREE users are rejected server-side (A)", () => {
  beforeEach(() => setPlan(FREEAuth));

  it("POST /api/organization (create org) → 403", async () => {
    const res = await OrgPOST(asJSON({ name: "Acme" }, "POST", "/api/organization"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: teamErr });
    expect(mocks.createOrganization).not.toHaveBeenCalled();
  });

  it("GET /api/organization?orgId (read team data) → 403", async () => {
    const res = await OrgGET(new Request("http://localhost/api/organization?orgId=org-1"));
    expect(res.status).toBe(403);
    expect(mocks.getOrganization).not.toHaveBeenCalled();
  });

  it("POST /api/organization/members (invite) → 403", async () => {
    const res = await MembersPOST(asJSON({ orgId: "org-1", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(403);
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it("PATCH /api/organization/members (role change) → 403", async () => {
    const res = await MembersPATCH(asJSON({ orgId: "org-1", memberId: "m1", role: "VIEWER" }, "PATCH", "/api/organization/members"));
    expect(res.status).toBe(403);
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
  });

  it("DELETE /api/organization/members (remove) → 403", async () => {
    const res = await MembersDELETE(asJSON({ orgId: "org-1", memberId: "m1" }, "DELETE", "/api/organization/members"));
    expect(res.status).toBe(403);
    expect(mocks.removeMember).not.toHaveBeenCalled();
  });

  it("GET /api/organization/invite (list) → 403", async () => {
    const res = await InvitesGET(new Request("http://localhost/api/organization/invite?orgId=org-1"));
    expect(res.status).toBe(403);
    expect(mocks.listPendingInvites).not.toHaveBeenCalled();
  });

  it("POST /api/organization/invite/accept → 403", async () => {
    const res = await AcceptPOST(asJSON({ token: "tok" }, "POST", "/api/organization/invite/accept"));
    expect(res.status).toBe(403);
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
  });

  it("POST /api/organization/invite/decline → 403", async () => {
    const res = await DeclinePOST(asJSON({ token: "tok" }, "POST", "/api/organization/invite/decline"));
    expect(res.status).toBe(403);
    expect(mocks.declineInvite).not.toHaveBeenCalled();
  });

  it("GET /api/organization/departments → 403", async () => {
    const res = await DepartmentsGET(new Request("http://localhost/api/organization/departments?orgId=org-1"));
    expect(res.status).toBe(403);
    expect(mocks.getDepartments).not.toHaveBeenCalled();
  });

  it("POST /api/organization/departments (create) → 403", async () => {
    const res = await DepartmentsPOST(asJSON({ orgId: "org-1", name: "Engineering" }, "POST", "/api/organization/departments"));
    expect(res.status).toBe(403);
    expect(mocks.createDepartment).not.toHaveBeenCalled();
  });
});

describe("F1 team entitlement — TEAM-enabled (PRO) users are allowed (B)", () => {
  beforeEach(() => setPlan(PROAuth));

  it("POST /api/organization → 201", async () => {
    const res = await OrgPOST(asJSON({ name: "Acme" }, "POST", "/api/organization"));
    expect(res.status).toBe(201);
    expect(mocks.createOrganization).toHaveBeenCalled();
  });

  it("GET /api/organization?orgId → 200", async () => {
    const res = await OrgGET(new Request("http://localhost/api/organization?orgId=org-1"));
    expect(res.status).toBe(200);
  });

  it("POST /api/organization/members → 201", async () => {
    const res = await MembersPOST(asJSON({ orgId: "org-1", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(201);
    expect(mocks.inviteMember).toHaveBeenCalled();
  });

  it("PATCH /api/organization/members → 200", async () => {
    const res = await MembersPATCH(asJSON({ orgId: "org-1", memberId: "m1", role: "VIEWER" }, "PATCH", "/api/organization/members"));
    expect(res.status).toBe(200);
  });

  it("DELETE /api/organization/members → 200", async () => {
    const res = await MembersDELETE(asJSON({ orgId: "org-1", memberId: "m1" }, "DELETE", "/api/organization/members"));
    expect(res.status).toBe(200);
  });

  it("GET /api/organization/invite → 200", async () => {
    const res = await InvitesGET(new Request("http://localhost/api/organization/invite?orgId=org-1"));
    expect(res.status).toBe(200);
  });

  it("POST /api/organization/invite/accept → 200", async () => {
    const res = await AcceptPOST(asJSON({ token: "tok" }, "POST", "/api/organization/invite/accept"));
    expect(res.status).toBe(200);
  });

  it("POST /api/organization/invite/decline → 200", async () => {
    const res = await DeclinePOST(asJSON({ token: "tok" }, "POST", "/api/organization/invite/decline"));
    expect(res.status).toBe(200);
  });

  it("GET /api/organization/departments → 200", async () => {
    const res = await DepartmentsGET(new Request("http://localhost/api/organization/departments?orgId=org-1"));
    expect(res.status).toBe(200);
  });

  it("POST /api/organization/departments → 201", async () => {
    const res = await DepartmentsPOST(asJSON({ orgId: "org-1", name: "Engineering" }, "POST", "/api/organization/departments"));
    expect(res.status).toBe(201);
  });
});

describe("F1 team entitlement — authentication and authorization still enforced (C, D)", () => {
  beforeEach(() => setPlan(PROAuth));

  it("rejects unauthenticated invite accept with 401 before any entitlement check", async () => {
    mocks.requireUserId.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const res = await AcceptPOST(asJSON({ token: "tok" }, "POST", "/api/organization/invite/accept"));
    expect(res.status).toBe(401);
    expect(mocks.acceptInvite).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated org create with 401", async () => {
    mocks.requireUserId.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const res = await OrgPOST(asJSON({ name: "Acme" }, "POST", "/api/organization"));
    expect(res.status).toBe(401);
  });

  it("rejects a non-member/cross-org inviter with the authorization 403 (authz precedes entitlement)", async () => {
    mocks.requireOrgPermission.mockRejectedValueOnce(new ApiError("You are not a member of this organization", 403));
    const res = await MembersPOST(asJSON({ orgId: "org-other", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("You are not a member of this organization");
    expect(body.error).not.toBe(teamErr);
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it("rejects a role without permission even when team-entitled (RBAC preserved)", async () => {
    mocks.requireOrgPermission.mockRejectedValueOnce(new ApiError("Insufficient permissions", 403));
    const res = await MembersPOST(asJSON({ orgId: "org-1", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(403);
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });
});

describe("F1 team entitlement — FREE-plan functionality keeps working (E)", () => {
  beforeEach(() => setPlan(FREEAuth));

  it("GET /api/entitlements still reports the effective FREE plan", async () => {
    const res = await EntitlementsGET(new Request("http://localhost/api/entitlements"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("FREE");
    expect(body.features.team).toBe(false);
  });

  it("GET /api/organization/current (self-context) is NOT gated and still works for FREE users", async () => {
    const res = await CurrentGET(new Request("http://localhost/api/organization/current"));
    expect(res.status).toBe(200);
    expect(mocks.getCurrentOrganization).toHaveBeenCalled();
  });

  it("POST /api/audits still creates audits for a FREE user", async () => {
    const ctx = { params: Promise.resolve({}) };
    const res = await AuditsPOST(
      asJSON({ tools: [{ tool: "ChatGPT", spend: 10, users: 2 }] }, "POST", "/api/audits"),
      ctx
    );
    expect(res.status).toBe(201);
    expect(mocks.createAuditWithinLimit).toHaveBeenCalled();
  });
});