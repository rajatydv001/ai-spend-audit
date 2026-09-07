import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireOrgPermission: vi.fn(),
  requireOrgMembership: vi.fn(),
  createOrganization: vi.fn(),
  getOrganization: vi.fn(),
  getCurrentOrganization: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
  listPendingInvites: vi.fn(),
  sendInviteEmail: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requireOrgPermission: mocks.requireOrgPermission,
  requireOrgMembership: mocks.requireOrgMembership,
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
}));
vi.mock("@/lib/services/notification-service", () => ({
  sendInviteEmail: mocks.sendInviteEmail,
}));

import { ApiError } from "@/lib/errors";
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

const asJSON = (body: unknown, method: string, path: string) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("u1");
  mocks.requireOrgPermission.mockResolvedValue({ role: "ADMIN", organizationId: "org-1" });
  mocks.requireOrgMembership.mockResolvedValue({ role: "ANALYST", organizationId: "org-1" });
  mocks.getCurrentOrganization.mockResolvedValue({ org: { id: "org-1", name: "Acme" }, role: "ADMIN", userId: "u1" });
  mocks.sendInviteEmail.mockResolvedValue({ status: "not_configured" });
});

describe("organization create/get routes", () => {
  it("creates an org only when authenticated", async () => {
    mocks.requireUserId.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const res = await OrgPOST(asJSON({ name: "Acme" }, "POST", "/api/organization"));
    expect(res.status).toBe(401);
  });

  it("creates an org and returns 201", async () => {
    mocks.createOrganization.mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme-xxxx" });
    const res = await OrgPOST(asJSON({ name: "Acme" }, "POST", "/api/organization"));
    expect(res.status).toBe(201);
  });

  it("rejects creating an org without a name (400)", async () => {
    const res = await OrgPOST(asJSON({ name: "" }, "POST", "/api/organization"));
    expect(res.status).toBe(400);
  });

  it("requires orgId for the org GET route (400)", async () => {
    const res = await OrgGET(new Request("http://localhost/api/organization"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent org after membership check passes", async () => {
    mocks.getOrganization.mockResolvedValue(null);
    const res = await OrgGET(new Request("http://localhost/api/organization?orgId=ghost"));
    expect(res.status).toBe(404);
  });

  it("serves an org to a member", async () => {
    mocks.getOrganization.mockResolvedValue({ id: "org-1", name: "Acme", members: [], departments: [] });
    const res = await OrgGET(new Request("http://localhost/api/organization?orgId=org-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Acme");
  });
});

describe("current org route", () => {
  it("requires authentication (401)", async () => {
    mocks.requireUserId.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const res = await CurrentGET(new Request("http://localhost/api/organization/current"));
    expect(res.status).toBe(401);
  });

  it("returns the caller's current org, role and id", async () => {
    const res = await CurrentGET(new Request("http://localhost/api/organization/current"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.org.name).toBe("Acme");
    expect(body.role).toBe("ADMIN");
    expect(body.userId).toBe("u1");
  });

  it("returns a null org for a user with no membership", async () => {
    mocks.getCurrentOrganization.mockResolvedValue({ org: null, role: null, userId: "u1" });
    const res = await CurrentGET(new Request("http://localhost/api/organization/current"));
    expect((await res.json()).org).toBeNull();
  });
});

describe("invite creation (POST /members)", () => {
  const inviteResult = {
    invite: {
      id: "inv-1",
      email: "a@b.com",
      role: "ANALYST",
      organizationId: "org-1",
      senderId: "u1",
      expiresAt: new Date(Date.now() + 1000),
      acceptedAt: null,
      declinedAt: null,
      createdAt: new Date(),
    },
    rawToken: "uuid-raw-token-1",
    inviteUrl: "http://localhost:3000/invite/uuid-raw-token-1",
    organizationName: "Acme",
    senderName: null,
  };

  it("requires authentication (401)", async () => {
    mocks.requireUserId.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const res = await MembersPOST(asJSON({ orgId: "org-1", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(401);
  });

  it("denies a member without the member:invite permission (cross-org/forged orgId isolation)", async () => {
    mocks.requireOrgPermission.mockRejectedValueOnce(new ApiError("Insufficient permissions", 403));
    const res = await MembersPOST(asJSON({ orgId: "org-other", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(403);
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it("creates an invite as an ADMIN (201) and returns the shareable invite URL with a truthful email status", async () => {
    mocks.inviteMember.mockResolvedValue(inviteResult);
    mocks.sendInviteEmail.mockResolvedValue({ status: "not_configured" });
    const res = await MembersPOST(asJSON({ orgId: "org-1", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(201);
    expect(mocks.inviteMember).toHaveBeenCalledWith("org-1", "a@b.com", "ANALYST", "u1");
    const body = await res.json();
    expect(body.inviteUrl).toBe("http://localhost:3000/invite/uuid-raw-token-1");
    expect(body.emailStatus).toBe("not_configured");
    expect(body.invite).not.toHaveProperty("token");
    expect(mocks.sendInviteEmail).toHaveBeenCalledWith({
      to: "a@b.com",
      inviteUrl: "http://localhost:3000/invite/uuid-raw-token-1",
      organizationName: "Acme",
      senderName: null,
      role: "ANALYST",
    });
  });

  it("reports sent only when the email provider confirms delivery", async () => {
    mocks.inviteMember.mockResolvedValue(inviteResult);
    mocks.sendInviteEmail.mockResolvedValue({ status: "sent" });
    const res = await MembersPOST(asJSON({ orgId: "org-1", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(201);
    expect((await res.json()).emailStatus).toBe("sent");
  });

  it("reports delivery_failed honestly instead of claiming the email was sent", async () => {
    mocks.inviteMember.mockResolvedValue(inviteResult);
    mocks.sendInviteEmail.mockResolvedValue({ status: "delivery_failed" });
    const res = await MembersPOST(asJSON({ orgId: "org-1", email: "a@b.com", role: "ANALYST" }, "POST", "/api/organization/members"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.emailStatus).toBe("delivery_failed");
    expect(body.inviteUrl).toBe("http://localhost:3000/invite/uuid-raw-token-1");
  });
});

describe("member role update (PATCH /members)", () => {
  it("forbids changing your own role (403)", async () => {
    const res = await MembersPATCH(asJSON({ orgId: "org-1", memberId: "u1", role: "VIEWER" }, "PATCH", "/api/organization/members"));
    expect(res.status).toBe(403);
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
  });

  it("updates a member's role when permitted", async () => {
    mocks.updateMemberRole.mockResolvedValue({ success: true });
    const res = await MembersPATCH(asJSON({ orgId: "org-1", memberId: "m1", role: "VIEWER" }, "PATCH", "/api/organization/members"));
    expect(res.status).toBe(200);
    expect(mocks.updateMemberRole).toHaveBeenCalledWith("org-1", "m1", "VIEWER", "u1");
  });
});

describe("member removal (DELETE /members)", () => {
  it("forbids removing yourself (403)", async () => {
    const res = await MembersDELETE(asJSON({ orgId: "org-1", memberId: "u1" }, "DELETE", "/api/organization/members"));
    expect(res.status).toBe(403);
    expect(mocks.removeMember).not.toHaveBeenCalled();
  });

  it("removes another member as an ADMIN", async () => {
    mocks.removeMember.mockResolvedValue({ success: true });
    const res = await MembersDELETE(asJSON({ orgId: "org-1", memberId: "m1" }, "DELETE", "/api/organization/members"));
    expect(res.status).toBe(200);
    expect(mocks.removeMember).toHaveBeenCalledWith("org-1", "m1", "u1");
  });
});

describe("pending invites list (GET /invite)", () => {
  it("requires authentication (401)", async () => {
    mocks.requireUserId.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const res = await InvitesGET(new Request("http://localhost/api/organization/invite?orgId=org-1"));
    expect(res.status).toBe(401);
  });

  it("denies a non-member trying to read another org's invites (cross-org isolation)", async () => {
    mocks.listPendingInvites.mockRejectedValueOnce(new ApiError("You are not a member", 403));
    const res = await InvitesGET(new Request("http://localhost/api/organization/invite?orgId=org-B"));
    expect(res.status).toBe(403);
  });

  it("returns pending invites for an org member", async () => {
    mocks.listPendingInvites.mockResolvedValue([{ id: "i1", email: "a@b.com", role: "ANALYST" }]);
    const res = await InvitesGET(new Request("http://localhost/api/organization/invite?orgId=org-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invites).toHaveLength(1);
    expect(mocks.listPendingInvites).toHaveBeenCalledWith("org-1", "u1");
  });
});

describe("invite accept/decline routes", () => {
  it("accept requires authentication (401)", async () => {
    mocks.requireUserId.mockRejectedValueOnce(new ApiError("Unauthorized", 401));
    const res = await AcceptPOST(asJSON({ token: "tok" }, "POST", "/api/organization/invite/accept"));
    expect(res.status).toBe(401);
  });

  it("accept joins the org as the addressed user", async () => {
    mocks.acceptInvite.mockResolvedValue({ id: "u1", organizationId: "org-1" });
    const res = await AcceptPOST(asJSON({ token: "tok" }, "POST", "/api/organization/invite/accept"));
    expect(res.status).toBe(200);
    expect(mocks.acceptInvite).toHaveBeenCalledWith("tok", "u1");
  });

  it("decline marks the invitation as declined", async () => {
    mocks.declineInvite.mockResolvedValue({ success: true });
    const res = await DeclinePOST(asJSON({ token: "tok" }, "POST", "/api/organization/invite/decline"));
    expect(res.status).toBe(200);
    expect(mocks.declineInvite).toHaveBeenCalledWith("tok", "u1");
  });

  it("decline validates the token (400)", async () => {
    const res = await DeclinePOST(asJSON({ token: "" }, "POST", "/api/organization/invite/decline"));
    expect(res.status).toBe(400);
    expect(mocks.declineInvite).not.toHaveBeenCalled();
  });
});