import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireUserOrg: vi.fn(),
  requireOrgPermission: vi.fn(),
  requireRole: vi.fn(),
  rateLimitOrThrow: vi.fn(),
  getClientIp: vi.fn(),
  createAuditWithinLimit: vi.fn(),
  getAuditsByUser: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requireUserOrg: mocks.requireUserOrg,
  requireOrgPermission: mocks.requireOrgPermission,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/services/rate-limit", () => ({
  rateLimitOrThrow: mocks.rateLimitOrThrow,
  getClientIp: mocks.getClientIp,
}));
vi.mock("@/lib/services/audit-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/audit-service")>();
  return {
    ...actual,
    createAuditWithinLimit: mocks.createAuditWithinLimit,
    getAuditsByUser: mocks.getAuditsByUser,
  };
});
vi.mock("@/lib/services/audit-log", () => ({
  createAuditLog: mocks.createAuditLog,
}));

import { POST, GET } from "@/app/api/audits/route";
const ctx = { params: Promise.resolve({}) };
const makeReq = (body: unknown) =>
  new Request("http://localhost/api/audits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const createdAudit = { id: "a1", userId: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("u1");
  mocks.requireUserOrg.mockResolvedValue({ id: "u1", organizationId: "org-1" });
  mocks.requireOrgPermission.mockResolvedValue({ role: "ADMIN" });
  mocks.requireRole.mockResolvedValue(undefined);
  mocks.rateLimitOrThrow.mockResolvedValue({ remaining: 9 });
  mocks.getClientIp.mockReturnValue("203.0.113.9");
  mocks.createAuditWithinLimit.mockResolvedValue(createdAudit);
  mocks.createAuditLog.mockResolvedValue(undefined);
});

describe("POST /api/audits", () => {
  it("creates an audit with the atomic quota path and logs it", async () => {
    const res = await POST(makeReq({ tools: [{ tool: "ChatGPT", spend: 10, users: 2 }] }), ctx);
    expect(res.status).toBe(201);
    expect(mocks.createAuditWithinLimit).toHaveBeenCalledWith(
      "u1",
      { tools: [{ tool: "ChatGPT", spend: 10, users: 2 }] },
      "org-1"
    );
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit.created",
        entity: "audit",
        entityId: "a1",
        ipAddress: "203.0.113.9",
      })
    );
  });

  it("requires the org member create permission for org members", async () => {
    mocks.requireOrgPermission.mockRejectedValue(new ApiError("Insufficient permissions", 403));
    const res = await POST(makeReq({ tools: [{ tool: "ChatGPT", spend: 1, users: 1 }] }), ctx);
    expect(res.status).toBe(403);
    expect(mocks.createAuditWithinLimit).not.toHaveBeenCalled();
  });

  it("falls back to the role check for users without an organization", async () => {
    mocks.requireUserOrg.mockResolvedValue({ id: "u1", organizationId: null });
    mocks.requireRole.mockRejectedValue(new ApiError("Insufficient permissions", 403));
    const res = await POST(makeReq({ tools: [{ tool: "ChatGPT", spend: 1, users: 1 }] }), ctx);
    expect(res.status).toBe(403);
    expect(mocks.requireRole).toHaveBeenCalledWith("u1", "ADMIN", "ANALYST");
  });

  it("returns 401 before any gating when unauthenticated", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await POST(makeReq({ tools: [{ tool: "ChatGPT", spend: 1, users: 1 }] }), ctx);
    expect(res.status).toBe(401);
    expect(mocks.createAuditWithinLimit).not.toHaveBeenCalled();
  });
});

describe("GET /api/audits", () => {
  it("lists the signed-in user's org audits", async () => {
    mocks.getAuditsByUser.mockResolvedValue([{ id: "a1" }]);
    const res = await GET(new Request("http://localhost/api/audits"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "a1" }]);
    expect(mocks.getAuditsByUser).toHaveBeenCalledWith("u1", "org-1");
  });
});