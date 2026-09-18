import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireUserOrg: vi.fn(),
  requireRole: vi.fn(),
  rateLimitOrThrow: vi.fn(),
  createAuditLog: vi.fn(),
  generatePdfReport: vi.fn(),
  findFirst: vi.fn(),
  auditCount: vi.fn(),
  userFindUnique: vi.fn(),
  savedReportCount: vi.fn(),
  savedReportCreate: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requireUserOrg: mocks.requireUserOrg,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/services/rate-limit", () => ({
  rateLimitOrThrow: mocks.rateLimitOrThrow,
}));
vi.mock("@/lib/services/audit-log", () => ({
  createAuditLog: mocks.createAuditLog,
}));
vi.mock("@/lib/pdf-export", () => ({
  generatePdfReport: (...args: unknown[]) => mocks.generatePdfReport(...args),
}));
vi.mock("@/lib/services/transaction", () => ({
  withSerializableTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
    fn({
      savedReport: { count: mocks.savedReportCount, create: mocks.savedReportCreate },
    }),
}));
// Only Prisma is mocked here: the REAL getAuditById + getUserEntitlements +
// quota check run behind the route, so the test proves the HTTP path scopes
// the audit lookup to the authenticated user.
vi.mock("@/lib/db", () => ({
  prisma: {
    audit: { findFirst: mocks.findFirst, count: mocks.auditCount },
    user: { findUnique: mocks.userFindUnique },
    savedReport: { count: mocks.savedReportCount, create: mocks.savedReportCreate },
  },
}));

import { POST } from "@/app/api/reports/export/route";

const auditOwnedByA = {
  id: "audit-a1",
  userId: "user-A",
  organizationId: "org-A",
  resultData: null,
  totalCurrentSpend: 300,
  totalOptimizedSpend: 240,
  totalSavings: 60,
  totalAnnualSavings: 720,
  optimizationScore: 80,
  summary: "secret summary of user A",
  tools: [
    {
      name: "ChatGPT",
      status: "Optimized",
      recommendation: "x",
      currentSpend: 300,
      optimizedSpend: 240,
      savings: 60,
      id: "t1",
      auditId: "audit-a1",
    },
  ],
};

const pdfBlob = () =>
  new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" });

const ctx = { params: Promise.resolve({}) };
const exportRequest = (auditId = "audit-a1") =>
  new Request("http://localhost/api/reports/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auditId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockReset();
  mocks.requireUserOrg.mockReset();
  mocks.requireRole.mockResolvedValue(undefined);
  mocks.rateLimitOrThrow.mockResolvedValue({ remaining: 59 });
  mocks.findFirst.mockReset();
  mocks.auditCount.mockReset();
  mocks.userFindUnique.mockReset();
  mocks.savedReportCount.mockReset();
  mocks.savedReportCreate.mockReset();
  mocks.generatePdfReport.mockReset();
  mocks.generatePdfReport.mockResolvedValue(pdfBlob());
  mocks.createAuditLog.mockReset();
  mocks.createAuditLog.mockResolvedValue(undefined);
  // FREE plan by default: exportLimit 3, nothing used yet.
  mocks.userFindUnique.mockResolvedValue({ id: "user-A", subscription: null });
  mocks.auditCount.mockResolvedValue(0);
  mocks.savedReportCount.mockResolvedValue(0);
  mocks.savedReportCreate.mockResolvedValue({ id: "rep-1" });
});

describe("POST /api/reports/export — HTTP-level authorization (IDOR)", () => {
  it("authenticated owner can export their own audit as a PDF", async () => {
    mocks.requireUserId.mockResolvedValue("user-A");
    mocks.requireUserOrg.mockResolvedValue({ id: "user-A", organizationId: "org-A" });
    mocks.findFirst.mockResolvedValue(auditOwnedByA);

    const res = await POST(exportRequest("audit-a1"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(mocks.savedReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-A", auditId: "audit-a1" }),
      })
    );
  });

  it("User B cannot export User A's audit through the route (cross-org IDOR → 404)", async () => {
    mocks.requireUserId.mockResolvedValue("user-B");
    mocks.requireUserOrg.mockResolvedValue({ id: "user-B", organizationId: "org-B" });
    // Even though an audit row exists, B's scoped lookup finds nothing.
    mocks.findFirst.mockResolvedValue(null);

    const res = await POST(exportRequest("audit-a1"), ctx);

    expect(res.status).toBe(404);
    const where = mocks.findFirst.mock.calls[0]?.[0]?.where;
    expect(where?.id).toBe("audit-a1");
    expect(where?.OR).toEqual([{ userId: "user-B" }, { organizationId: "org-B" }]);
    expect(where?.OR).not.toContainEqual({ userId: "user-A" });
    expect(where?.OR).not.toContainEqual({ organizationId: "org-A" });
    // Nothing else may be produced for the foreign audit.
    expect(mocks.generatePdfReport).not.toHaveBeenCalled();
    expect(mocks.savedReportCreate).not.toHaveBeenCalled();
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("secret summary of user A");
  });

  it("returns 401 for an unauthenticated request before any lookup or generation", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await POST(exportRequest("audit-a1"), ctx);
    expect(res.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.generatePdfReport).not.toHaveBeenCalled();
  });

  it("rejects a malformed/missing auditId with 400 before any lookup", async () => {
    mocks.requireUserId.mockResolvedValue("user-A");
    mocks.requireUserOrg.mockResolvedValue({ id: "user-A", organizationId: "org-A" });

    const res = await POST(
      new Request("http://localhost/api/reports/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auditId: "" }),
      }),
      ctx
    );
    expect(res.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});