import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  rateLimitOrThrow: vi.fn(),
  createOrganization: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/services/rate-limit", () => ({
  rateLimitOrThrow: mocks.rateLimitOrThrow,
}));
vi.mock("@/lib/services/organization-service", () => ({
  createOrganization: mocks.createOrganization,
}));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate } },
}));

import { POST } from "@/app/api/user/onboarding/route";
const ctx = { params: Promise.resolve({}) };
const makeReq = (body: unknown) =>
  new Request("http://localhost/api/user/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("u1");
  mocks.rateLimitOrThrow.mockResolvedValue({ remaining: 4 });
  mocks.createOrganization.mockResolvedValue({ id: "org-1" });
  // New users without an organization by default.
  mocks.userFindUnique.mockResolvedValue({ organizationId: null });
  mocks.userUpdate.mockResolvedValue({});
});

describe("POST /api/user/onboarding", () => {
  it("creates the organization and finalizes onboarding when org name is given", async () => {
    const res = await POST(makeReq({ organizationName: "Acme", currency: "USD", teamSize: 10 }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.createOrganization).toHaveBeenCalledWith("Acme", "u1");
    expect(mocks.userUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { onboarded: true } })
    );
  });

  it("skips org creation when only preferences are provided", async () => {
    const res = await POST(makeReq({ currency: "EUR" }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.createOrganization).not.toHaveBeenCalled();
    expect(mocks.userUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "u1" },
      data: { currency: "EUR" },
    });
    expect(mocks.userUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "u1" },
      data: { onboarded: true },
    });
  });

  it("never creates a second organization when the user already belongs to one (signup workspace)", async () => {
    mocks.userFindUnique.mockResolvedValue({ organizationId: "org-existing" });
    const res = await POST(makeReq({ organizationName: "Acme" }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.createOrganization).not.toHaveBeenCalled();
  });

  it("rejects an empty payload (at least one field required)", async () => {
    const res = await POST(makeReq({}), ctx);
    expect(res.status).toBe(400);
    expect(mocks.createOrganization).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("returns 429 when the onboarding rate limit is hit", async () => {
    mocks.rateLimitOrThrow.mockRejectedValue(new ApiError("Too many requests", 429));
    const res = await POST(makeReq({ organizationName: "Acme" }), ctx);
    expect(res.status).toBe(429);
    expect(mocks.createOrganization).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await POST(makeReq({ organizationName: "Acme" }), ctx);
    expect(res.status).toBe(401);
    expect(mocks.createOrganization).not.toHaveBeenCalled();
  });
});