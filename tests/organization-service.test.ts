import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  organization: { create: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
  invite: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  department: { create: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMocks }));

import { prisma } from "@/lib/db";
import {
  createOrganization,
  getOrganization,
  getCurrentOrganization,
  inviteMember,
  acceptInvite,
  declineInvite,
  getInviteSummary,
  updateMemberRole,
  removeMember,
  listPendingInvites,
  createDepartment,
  getDepartments,
  hashInviteToken,
  buildInviteUrl,
} from "@/lib/services/organization-service";

const adminMembership = { id: "sender", role: "ADMIN", organizationId: "org-1" };
const grantAdmin = () =>
  (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(adminMembership);

beforeEach(() => {
  Object.values(prismaMocks).forEach((mockGroup) => {
    if (typeof mockGroup === "object") {
      Object.values(mockGroup as Record<string, ReturnType<typeof vi.fn>>).forEach((m) => m.mockReset());
    }
  });
  prismaMocks.$transaction.mockReset();
  prismaMocks.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prismaMocks));
});

describe("createOrganization", () => {
  it("creates an org with a slugified name and sets the creator to ADMIN", async () => {
    prismaMocks.organization.create.mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme-xxxx" });
    prismaMocks.user.update.mockResolvedValue({});
    await createOrganization("Acme Corp", "user-1");
    const createArg = prismaMocks.organization.create.mock.calls[0][0];
    expect(createArg.data.name).toBe("Acme Corp");
    expect(createArg.data.slug.startsWith("acme-corp-")).toBe(true);
    expect(createArg.data.members.connect.id).toBe("user-1");
    expect(prismaMocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" }, data: { organizationId: "org-1", role: "ADMIN" } })
    );
  });
});

describe("inviteMember", () => {
  it("enforces ADMIN-only permission via requireOrgPermission", async () => {
    prismaMocks.user.findFirst.mockResolvedValue({ id: "sender", role: "VIEWER", organizationId: "org-1" });
    await expect(inviteMember("org-1", "a@b.com", "ANALYST", "sender")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMocks.invite.create).not.toHaveBeenCalled();
  });

  it("rejects inviting a user who is already a member (409)", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValueOnce({ id: "existing", email: "a@b.com" });
    await expect(inviteMember("org-1", "a@b.com", "ANALYST", "sender")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMocks.invite.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate active invitation for the same email (409)", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValueOnce({ id: "other", email: "b@c.com" });
    prismaMocks.invite.findFirst.mockResolvedValue({ id: "inv-dupe" });
    await expect(inviteMember("org-1", "a@b.com", "ANALYST", "sender")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMocks.invite.create).not.toHaveBeenCalled();
  });

  it("only blocks re-invites while a *pending* invite is open (queries exclude expired/used/declined)", async () => {
    grantAdmin();
    prismaMocks.invite.findFirst.mockResolvedValue(null);
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-9", email: "new@b.com" });
    prismaMocks.organization.findUnique.mockResolvedValue({ name: "Acme" });
    prismaMocks.invite.create.mockResolvedValue({ id: "inv-1" });

    await inviteMember("org-1", "new@b.com", "ANALYST", "sender");
    const dupCheck = prismaMocks.invite.findFirst.mock.calls[0][0];
    expect(dupCheck.where).toEqual(
      expect.objectContaining({ acceptedAt: null, declinedAt: null, expiresAt: { gt: expect.any(Date) } })
    );
    expect(prismaMocks.invite.create).toHaveBeenCalledTimes(1);
  });

  it("creates an invite with a token, 7-day expiry, normalized email and recipient link", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValue(null);
    prismaMocks.invite.findFirst.mockResolvedValue(null);
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-9", email: "new@b.com" });
    prismaMocks.organization.findUnique.mockResolvedValue({ name: "Acme" });
    prismaMocks.invite.create.mockResolvedValue({ id: "inv-1" });

    await inviteMember("org-1", "  NEW@B.COM  ", "ANALYST", "sender");
    const arg = prismaMocks.invite.create.mock.calls[0][0];
    expect(arg.data.email).toBe("new@b.com");
    expect(arg.data.organizationId).toBe("org-1");
    expect(arg.data.role).toBe("ANALYST");
    expect(arg.data.recipientId).toBe("user-9");
    expect(arg.data.token).toMatch(/^[0-9a-f]{64}$/);
    const days = (arg.data.expiresAt - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("returns the raw token, invite URL and email context EXACTLY once (never the stored hash)", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValue(null);
    prismaMocks.invite.findFirst.mockResolvedValue(null);
    prismaMocks.organization.findUnique.mockResolvedValue({ name: "Acme" });
    prismaMocks.user.findUnique.mockResolvedValueOnce({ id: "user-9", email: "new@b.com" });
    prismaMocks.user.findUnique.mockResolvedValue({ id: "sender", name: "Sam" });
    prismaMocks.invite.create.mockResolvedValue({
      id: "inv-1",
      email: "new@b.com",
      role: "ANALYST",
      organizationId: "org-1",
      senderId: "sender",
      expiresAt: new Date(Date.now() + 1000),
      acceptedAt: null,
      declinedAt: null,
      createdAt: new Date(),
    });

    const result = await inviteMember("org-1", "new@b.com", "ANALYST", "sender");
    expect(result.rawToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(result.inviteUrl).toBe(`http://localhost:3000/invite/${result.rawToken}`);
    expect(result.invite).not.toHaveProperty("token");
    expect(result.invite.email).toBe("new@b.com");
    expect(result.organizationName).toBe("Acme");
    expect(result.senderName).toBe("Sam");
    // The persisted token is the SHA-256 digest of the returned raw token.
    expect(prismaMocks.invite.create.mock.calls[0][0].data.token).toBe(
      hashInviteToken(result.rawToken)
    );
  });

  it("builds invite URLs from the NEXT_PUBLIC_APP_URL origin", () => {
    expect(buildInviteUrl("tok-1")).toBe("http://localhost:3000/invite/tok-1");
  });
});

describe("acceptInvite", () => {
  const validInvite = {
    id: "inv-1",
    organizationId: "org-1",
    role: "ANALYST",
    email: "a@b.com",
    recipientId: null as string | null,
    acceptedAt: null as Date | null,
    declinedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 10000),
  };

  beforeEach(() => {
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-1", email: "a@b.com", organizationId: null });
  });

  it("throws 404 when the invite does not exist", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue(null);
    await expect(acceptInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 for an expired invite", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue({ ...validInvite, expiresAt: new Date(Date.now() - 1000) });
    await expect(acceptInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 409 for a declined invite", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue({ ...validInvite, declinedAt: new Date() });
    await expect(acceptInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 409 for an already-used invite", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue({ ...validInvite, acceptedAt: new Date() });
    await expect(acceptInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 403 when not addressed to the user", async () => {
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-1", email: "other@b.com", organizationId: null });
    prismaMocks.invite.findUnique.mockResolvedValue(validInvite);
    await expect(acceptInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("accepts a recipientId-addressed invite even if emails were not matched", async () => {
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-1", email: "changed@b.com", organizationId: null });
    prismaMocks.invite.findUnique.mockResolvedValue({ ...validInvite, recipientId: "user-1", email: "old@b.com" });
    prismaMocks.invite.updateMany.mockResolvedValue({ count: 1 });
    prismaMocks.user.update.mockResolvedValue({ id: "user-1", role: "ANALYST" });
    await expect(acceptInvite("token", "user-1")).resolves.toMatchObject({ id: "user-1" });
  });

  it("throws 409 when the user already belongs to the target org", async () => {
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-1", email: "a@b.com", organizationId: "org-1" });
    prismaMocks.invite.findUnique.mockResolvedValue(validInvite);
    await expect(acceptInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("claims the invite atomically and joins the user to the org on success", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue(validInvite);
    prismaMocks.invite.updateMany.mockResolvedValue({ count: 1 });
    prismaMocks.user.update.mockResolvedValue({ id: "user-1", organizationId: "org-1", role: "ANALYST" });

    await acceptInvite("token", "user-1");

    expect(prismaMocks.$transaction).toHaveBeenCalled();
    expect(prismaMocks.invite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1", acceptedAt: null, declinedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { acceptedAt: expect.any(Date) },
      })
    );
    expect(prismaMocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { organizationId: "org-1", role: "ANALYST" },
      })
    );
  });

  it("prevents a duplicate-membership race when a concurrent request claims the invite first", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue(validInvite);
    prismaMocks.invite.updateMany.mockResolvedValue({ count: 0 });
    await expect(acceptInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });
});

describe("declineInvite", () => {
  const validInvite = {
    id: "inv-1",
    organizationId: "org-1",
    role: "ANALYST",
    email: "a@b.com",
    recipientId: null as string | null,
    acceptedAt: null as Date | null,
    declinedAt: null as Date | null,
  };

  beforeEach(() => {
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-1", email: "a@b.com", organizationId: null });
  });

  it("throws 404 when the invite does not exist", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue(null);
    await expect(declineInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when not addressed to the user", async () => {
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-1", email: "other@b.com", organizationId: null });
    prismaMocks.invite.findUnique.mockResolvedValue(validInvite);
    await expect(declineInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 409 for an already-accepted invite", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue({ ...validInvite, acceptedAt: new Date() });
    await expect(declineInvite("token", "user-1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("marks the invite declined and audits it", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue(validInvite);
    prismaMocks.invite.updateMany.mockResolvedValue({ count: 1 });
    await expect(declineInvite("token", "user-1")).resolves.toEqual({ success: true });
    expect(prismaMocks.invite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1", declinedAt: null }, data: { declinedAt: expect.any(Date) } })
    );
    const audit = prismaMocks.auditLog.create.mock.calls[0][0];
    expect(audit.data.action).toBe("invite.declined");
  });

  it("allows declining an already-expired invite (recipient can clean up stale invites)", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue({
      ...validInvite,
      expiresAt: new Date(Date.now() - 1000),
    });
    prismaMocks.invite.updateMany.mockResolvedValue({ count: 1 });
    await expect(declineInvite("token", "user-1")).resolves.toEqual({ success: true });
    expect(prismaMocks.invite.updateMany).toHaveBeenCalled();
  });

  it("is idempotent for an already-declined invite", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue({ ...validInvite, declinedAt: new Date() });
    await expect(declineInvite("token", "user-1")).resolves.toEqual({ success: true });
    expect(prismaMocks.invite.updateMany).not.toHaveBeenCalled();
  });
});

describe("getInviteSummary", () => {
  const base = {
    id: "inv-1",
    organizationId: "org-1",
    email: "a@b.com",
    recipientId: null,
    role: "ANALYST",
    expiresAt: new Date(Date.now() + 10000),
    acceptedAt: null,
    declinedAt: null,
    organization: { name: "Acme" },
  };

  it("returns not_found for an unknown token", async () => {
    prismaMocks.invite.findUnique.mockResolvedValue(null);
    await expect(getInviteSummary("nope")).resolves.toEqual({ status: "not_found" });
  });

  it.each(["expired", "used", "declined", "valid"] as const)("reports %s status", async (status) => {
    const invite = { ...base };
    if (status === "expired") invite.expiresAt = new Date(Date.now() - 1000);
    if (status === "used") invite.acceptedAt = new Date();
    if (status === "declined") invite.declinedAt = new Date();
    prismaMocks.invite.findUnique.mockResolvedValue(invite);
    const summary = await getInviteSummary("tok");
    expect(summary.status).toBe(status);
    expect(summary).toMatchObject({ organizationName: "Acme", email: "a@b.com" });
  });
});

describe("updateMemberRole", () => {
  it("throws 404 when the member is not in the org", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValueOnce(null);
    await expect(updateMemberRole("org-1", "m1", "ADMIN", "sender")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("forbids demoting the last administrator (400)", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValueOnce({ id: "m1", role: "ADMIN", organizationId: "org-1" });
    prismaMocks.user.count.mockResolvedValue(1);
    await expect(updateMemberRole("org-1", "m1", "VIEWER", "sender")).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it("allows demoting an admin when another admin remains", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValueOnce({ id: "m1", role: "ADMIN", organizationId: "org-1" });
    prismaMocks.user.count.mockResolvedValue(2);
    prismaMocks.user.update.mockResolvedValue({});
    await updateMemberRole("org-1", "m1", "VIEWER", "sender");
    expect(prismaMocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m1" }, data: { role: "VIEWER" } })
    );
  });

  it("updates the role for a non-admin member without the last-admin guard", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValueOnce({ id: "m1", role: "VIEWER", organizationId: "org-1" });
    prismaMocks.user.update.mockResolvedValue({});
    await updateMemberRole("org-1", "m1", "ADMIN", "sender");
    expect(prismaMocks.user.count).not.toHaveBeenCalled();
    expect(prismaMocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m1" }, data: { role: "ADMIN" } })
    );
  });
});

describe("removeMember", () => {
  it("refuses to remove a forged/other-org member id (404) and never writes", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValue(null);
    await expect(removeMember("org-1", "member-of-org-B", "sender")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it("forbids removing the last administrator (400)", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValueOnce({ id: "m1", role: "ADMIN", organizationId: "org-1" });
    prismaMocks.user.count.mockResolvedValue(1);
    await expect(removeMember("org-1", "m1", "sender")).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
  });

  it("removes a non-admin member: nulls org and resets role; audits the removal", async () => {
    grantAdmin();
    prismaMocks.user.findFirst.mockResolvedValueOnce({ id: "m1", role: "VIEWER", organizationId: "org-1" });
    prismaMocks.user.update.mockResolvedValue({});
    await removeMember("org-1", "m1", "sender");
    expect(prismaMocks.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1" },
        data: { organizationId: null, role: "VIEWER" },
      })
    );
    const audit = prismaMocks.auditLog.create.mock.calls[0][0];
    expect(audit.data.action).toBe("organization.member_removed");
  });
});

describe("listPendingInvites", () => {
  it("forbids non-members (cross-org isolation)", async () => {
    prismaMocks.user.findFirst.mockResolvedValue(null);
    await expect(listPendingInvites("org-1", "outsider")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("forbids a member without the member:invite permission (e.g. ANALYST)", async () => {
    prismaMocks.user.findFirst.mockResolvedValue({ id: "member", role: "ANALYST", organizationId: "org-1" });
    await expect(listPendingInvites("org-1", "member")).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMocks.invite.findMany).not.toHaveBeenCalled();
  });

  it("lists only pending (non-used, non-declined) invites for an ADMIN", async () => {
    prismaMocks.user.findFirst.mockResolvedValue({ id: "member", role: "ADMIN", organizationId: "org-1" });
    prismaMocks.invite.findMany.mockResolvedValue([]);
    await listPendingInvites("org-1", "member");
    expect(prismaMocks.invite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", acceptedAt: null, declinedAt: null },
        orderBy: { createdAt: "desc" },
      })
    );
  });
});

describe("getCurrentOrganization", () => {
  it("returns null org/role when the user belongs to no org", async () => {
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-1", organizationId: null });
    await expect(getCurrentOrganization("user-1")).resolves.toEqual({ org: null, role: null });
  });

  it("returns the org and the caller's membership role", async () => {
    prismaMocks.user.findUnique.mockResolvedValue({ id: "user-1", organizationId: "org-1" });
    prismaMocks.organization.findUnique.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      slug: "acme",
      members: [{ id: "user-1", role: "ADMIN" }],
      departments: [],
    });
    const result = await getCurrentOrganization("user-1");
    expect(result.org?.name).toBe("Acme");
    expect(result.role).toBe("ADMIN");
  });
});

describe("createDepartment", () => {
  it("enforces department:create permission for an actor", async () => {
    prismaMocks.user.findFirst.mockResolvedValue({ id: "actor", role: "VIEWER", organizationId: "org-1" });
    await expect(createDepartment("org-1", "Engineering", "actor")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMocks.department.create).not.toHaveBeenCalled();
  });

  it("creates a department without an actor (no permission check)", async () => {
    prismaMocks.department.create.mockResolvedValue({ id: "d1", name: "Engineering", organizationId: "org-1" });
    await createDepartment("org-1", "Engineering");
    expect(prismaMocks.department.create).toHaveBeenCalledWith({ data: { name: "Engineering", organizationId: "org-1" } });
  });
});

describe("getOrganization / getDepartments", () => {
  it("fetches members and departments for an org", async () => {
    prismaMocks.organization.findUnique.mockResolvedValue({ id: "o1", members: [], departments: [] });
    await getOrganization("o1");
    expect(prismaMocks.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" }, include: expect.anything() })
    );
  });

  it("fetches departments ordered by name", async () => {
    prismaMocks.department.findMany.mockResolvedValue([]);
    await getDepartments("o1");
    expect(prismaMocks.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "o1" }, orderBy: { name: "asc" } })
    );
  });
});