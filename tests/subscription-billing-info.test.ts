import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));

import { getBillingInfo } from "@/lib/services/subscription-service";

describe("getBillingInfo — effective plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports FREE for a user with no subscription row", async () => {
    mocks.findUnique.mockResolvedValue({ id: "u1", subscription: null });
    const info = await getBillingInfo("u1");
    expect(info.plan).toBe("FREE");
    expect(info.status).toBeNull();
  });

  it("reports the paid plan only while the status is ACTIVE/TRIALING", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "u1",
      subscription: { plan: "PRO", status: "ACTIVE" },
    });
    const info = await getBillingInfo("u1");
    expect(info.plan).toBe("PRO");
    expect(info.status).toBe("ACTIVE");
  });

  it("resolves a CANCELED/PAST_DUE paid row to FREE (fail-closed display)", async () => {
    for (const status of ["CANCELED", "PAST_DUE", "INCOMPLETE"]) {
      mocks.findUnique.mockResolvedValue({
        id: "u1",
        subscription: { plan: "ENTERPRISE", status },
      });
      const info = await getBillingInfo("u1");
      expect(info.plan).toBe("FREE");
      expect(info.status).toBe(status);
    }
  });
});