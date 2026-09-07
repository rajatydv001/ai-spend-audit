import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  hasPermission,
  hasMinimumRole,
  requireRole,
  requireOrgMembership,
  requireOrgPermission,
  requireUserOrg,
  AuthorizationError,
} from "@/lib/auth/authorization";

const mockFindFirst = prisma.user.findFirst as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFindFirst.mockReset();
  mockFindUnique.mockReset();
});

describe("hasPermission", () => {
  it("allows roles listed for a permission", () => {
    expect(hasPermission("ADMIN", "audit:delete")).toBe(true);
    expect(hasPermission("ANALYST", "audit:delete")).toBe(true);
    expect(hasPermission("VIEWER", "audit:read")).toBe(true);
  });

  it("forbids roles not listed for a permission", () => {
    expect(hasPermission("VIEWER", "audit:delete")).toBe(false);
    expect(hasPermission("VIEWER", "member:invite")).toBe(false);
    expect(hasPermission("ANALYST", "org:manage")).toBe(false);
  });

  it("returns false for an unknown permission", () => {
    expect(hasPermission("ADMIN", "unknown:perm")).toBe(false);
  });
});

describe("hasMinimumRole", () => {
  it("honors the role hierarchy", () => {
    expect(hasMinimumRole("ADMIN", "VIEWER")).toBe(true);
    expect(hasMinimumRole("ADMIN", "ADMIN")).toBe(true);
    expect(hasMinimumRole("ANALYST", "ADMIN")).toBe(false);
    expect(hasMinimumRole("VIEWER", "ANALYST")).toBe(false);
  });
});

describe("requireRole (user-id form)", () => {
  it("resolves when the user's role is allowed", async () => {
    mockFindUnique.mockResolvedValue({ role: "ANALYST" });
    await expect(requireRole("user-1", "ANALYST", "VIEWER")).resolves.toBeUndefined();
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } })
    );
  });

  it("throws 404 when the user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(requireRole("ghost", "ADMIN")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when the user's role is forbidden", async () => {
    mockFindUnique.mockResolvedValue({ role: "VIEWER" });
    await expect(requireRole("user-1", "ADMIN")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("organization membership + isolation", () => {
  it("rejects a user who is not a member of the org (403)", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(requireOrgMembership("user-1", "org-A")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireOrgMembership("user-1", "org-A")).rejects.toMatchObject({ statusCode: 403 });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1", organizationId: "org-A" },
      })
    );
  });

  it("resolves for a member and returns their membership", async () => {
    mockFindFirst.mockResolvedValue({ id: "user-1", role: "VIEWER", organizationId: "org-A" });
    const m = await requireOrgMembership("user-1", "org-A");
    expect(m.role).toBe("VIEWER");
  });
});

describe("requireOrgPermission", () => {
  it("grants an ADMIN member the manage permission", async () => {
    mockFindFirst.mockResolvedValue({ id: "user-1", role: "ADMIN", organizationId: "org-A" });
    await expect(requireOrgPermission("user-1", "org-A", "member:invite")).resolves.toMatchObject({
      role: "ADMIN",
    });
  });

  it("forbids a member whose role lacks the permission (403)", async () => {
    mockFindFirst.mockResolvedValue({ id: "user-1", role: "VIEWER", organizationId: "org-A" });
    await expect(requireOrgPermission("user-1", "org-A", "member:invite")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("forbids a non-member even if they supply a valid orgId + permission (cross-org isolation)", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(requireOrgPermission("user-1", "org-B", "member:invite")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("requireUserOrg", () => {
  it("throws 404 when the user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(requireUserOrg("ghost")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when the user belongs to no org", async () => {
    mockFindUnique.mockResolvedValue({ id: "user-1", role: "ANALYST", organizationId: null });
    await expect(requireUserOrg("user-1")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns the user when they belong to an org", async () => {
    mockFindUnique.mockResolvedValue({ id: "user-1", role: "ANALYST", organizationId: "org-A" });
    await expect(requireUserOrg("user-1")).resolves.toMatchObject({ organizationId: "org-A" });
  });
});
