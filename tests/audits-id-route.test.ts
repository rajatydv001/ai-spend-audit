import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireUserOrg: vi.fn(),
  requireOrgPermission: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requireUserOrg: mocks.requireUserOrg,
  requireOrgPermission: mocks.requireOrgPermission,
}));
// Only Prisma is mocked here: the REAL audit-service getAuditById/deleteAudit run
// behind the route, so the test proves the HTTP path performs a scoped query.
vi.mock("@/lib/db", () => ({
  prisma: {
    audit: { findFirst: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

import { GET, DELETE } from "@/app/api/audits/[id]/route";
import { prisma } from "@/lib/db";

const findFirst = prisma.audit.findFirst as ReturnType<typeof vi.fn>;
const deleteMany = prisma.audit.deleteMany as ReturnType<typeof vi.fn>;

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

const userA = { id: "user-A", organizationId: "org-A" };
const userB = { id: "user-B", organizationId: "org-B" };

const auditOwnedByA = {
  id: "audit-a1",
  userId: "user-A",
  organizationId: "org-A",
  department: "Engineering",
  totalCurrentSpend: 300,
  totalSavings: 60,
  summary: "secret summary of user A",
  tools: [{ name: "ChatGPT" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockReset();
  mocks.requireUserOrg.mockReset();
  mocks.requireOrgPermission.mockResolvedValue({ id: "user-B", role: "ADMIN" });
  findFirst.mockReset();
  deleteMany.mockReset();
});

describe("GET /api/audits/[id] — HTTP-level authorization (IDOR)", () => {
  it("authenticated owner (User A) can fetch their own audit", async () => {
    mocks.requireUserId.mockResolvedValue(userA.id);
    mocks.requireUserOrg.mockResolvedValue(userA);
    findFirst.mockResolvedValue(auditOwnedByA);

    const res = await GET(new Request("http://localhost/api/audits/audit-a1"), ctxFor("audit-a1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "audit-a1", userId: "user-A", tools: [{ name: "ChatGPT" }] });
    // The query the route caused is scoped to the authenticated user.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "audit-a1", OR: [{ userId: "user-A" }, { organizationId: "org-A" }] },
      })
    );
  });

  it("does NOT leak User A's audit to User B through the route (cross-org IDOR)", async () => {
    mocks.requireUserId.mockResolvedValue(userB.id);
    mocks.requireUserOrg.mockResolvedValue(userB);
    // Even if a row for audit-a1 exists, the scoped query returns nothing for B.
    findFirst.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/audits/audit-a1"), ctxFor("audit-a1"));

    expect(res.status).toBe(404);
    const where = findFirst.mock.calls[0]?.[0]?.where;
    expect(where?.id).toBe("audit-a1");
    expect(where?.OR).toEqual([{ userId: "user-B" }, { organizationId: "org-B" }]);
    expect(where?.OR).not.toContainEqual({ userId: "user-A" });
    expect(where?.OR).not.toContainEqual({ organizationId: "org-A" });

    const payload = JSON.stringify(await res.json());
    expect(payload).not.toContain("secret summary of user A");
    expect(payload).not.toContain("totalCurrentSpend");
    expect(payload).not.toContain("user-A");
  });

  it("scopes to the authenticated user even when no org EXISTS (no organization fallback to unscoped query)", async () => {
    // A brand-new user without an org must still never query all audits.
    mocks.requireUserId.mockResolvedValue("user-B");
    mocks.requireUserOrg.mockRejectedValue(new ApiError("You must belong to an organization", 403));

    const res = await GET(new Request("http://localhost/api/audits/audit-a1"), ctxFor("audit-a1"));
    expect(res.status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns 401 for an unauthenticated request before any audit lookup", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await GET(new Request("http://localhost/api/audits/audit-a1"), ctxFor("audit-a1"));
    expect(res.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("handles malformed / nonexistent audit ids safely (404, no data, no throw)", async () => {
    mocks.requireUserId.mockResolvedValue(userA.id);
    mocks.requireUserOrg.mockResolvedValue(userA);
    findFirst.mockResolvedValue(null);

    for (const bogus of ["not-a-real-id", "../../etc/passwd", "%00", ""]) {
      const res = await GET(new Request(`http://localhost/api/audits/${bogus}`), ctxFor(bogus));
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain("tools");
    }
    // The bogus id was passed through as a literal filter value, never interpolated.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "not-a-real-id" }) })
    );
  });
});

describe("DELETE /api/audits/[id] — HTTP-level authorization (IDOR)", () => {
  it("permission failure (403) prevents deleting another user's audit before any query", async () => {
    mocks.requireUserId.mockResolvedValue(userB.id);
    mocks.requireUserOrg.mockResolvedValue(userB);
    mocks.requireOrgPermission.mockRejectedValue(new ApiError("Insufficient permissions", 403));

    const res = await DELETE(new Request("http://localhost/api/audits/audit-a1"), ctxFor("audit-a1"));
    expect(res.status).toBe(403);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("a cross-org delete is scoped to the caller and yields 404, never A's audit", async () => {
    mocks.requireUserId.mockResolvedValue(userB.id);
    mocks.requireUserOrg.mockResolvedValue(userB);
    deleteMany.mockResolvedValue({ count: 0 });

    const res = await DELETE(new Request("http://localhost/api/audits/audit-a1"), ctxFor("audit-a1"));
    expect(res.status).toBe(404);
    const where = deleteMany.mock.calls[0]?.[0]?.where;
    expect(where?.id).toBe("audit-a1");
    expect(where?.OR).toEqual([{ userId: "user-B" }, { organizationId: "org-B" }]);
    expect(where?.OR).not.toContainEqual({ userId: "user-A" });
  });

  it("owner can delete their own audit", async () => {
    mocks.requireUserId.mockResolvedValue(userA.id);
    mocks.requireUserOrg.mockResolvedValue(userA);
    mocks.requireOrgPermission.mockResolvedValue({ id: "user-A", role: "ADMIN" });
    deleteMany.mockResolvedValue({ count: 1 });

    const res = await DELETE(new Request("http://localhost/api/audits/audit-a1"), ctxFor("audit-a1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "audit-a1", OR: [{ userId: "user-A" }, { organizationId: "org-A" }] },
      })
    );
  });
});