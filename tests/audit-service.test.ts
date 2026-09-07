import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserEntitlements: vi.fn(),
  auditCount: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/lib/services/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/entitlements")>();
  return { ...actual, getUserEntitlements: mocks.getUserEntitlements };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.$transaction,
    audit: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      count: mocks.auditCount,
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { generateAggregateAudit } from "@/lib/audit-engine";
import {
  createAuditInputSchema,
  createAuditWithinLimit,
  getAuditsByUser,
  getAuditById,
  deleteAudit,
  getUserPreferences,
  updateUserPreferences,
} from "@/lib/services/audit-service";

const create = prisma.audit.create as ReturnType<typeof vi.fn>;
const findMany = prisma.audit.findMany as ReturnType<typeof vi.fn>;
const findFirst = prisma.audit.findFirst as ReturnType<typeof vi.fn>;
const delMany = prisma.audit.deleteMany as ReturnType<typeof vi.fn>;
const userFind = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const userUpdate = prisma.user.update as ReturnType<typeof vi.fn>;

beforeEach(() => {
  [create, findMany, findFirst, delMany, userFind, userUpdate].forEach((m) => m.mockReset());
  mocks.getUserEntitlements.mockResolvedValue({ auditLimit: 999999 });
  mocks.auditCount.mockResolvedValue(0);
  mocks.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ audit: { count: mocks.auditCount, create } })
  );
});

// Raw inputs the client is allowed to send. Every derived number is computed by
// the engine server-side; the schema strips anything else.
const rawInput = {
  tools: [
    { tool: "ChatGPT", plan: "Plus", spend: 300, users: 10 },
    { tool: "Claude", spend: 0, users: 5 },
  ],
  department: "Engineering",
};

describe("createAuditInputSchema validation", () => {
  it("accepts valid raw inputs", () => {
    expect(() => createAuditInputSchema.parse(rawInput)).not.toThrow();
  });

  it("accepts tools without a plan", () => {
    const parsed = createAuditInputSchema.parse({ tools: [{ tool: "Claude", spend: 0, users: 2 }] });
    expect(parsed.tools[0].plan).toBeUndefined();
  });

  it("strips client-supplied calculated fields so a tampered result cannot persist", () => {
    const tampered = {
      tools: [{ tool: "ChatGPT", spend: 300, users: 10 }],
      totalSavings: 999999,
      totalCurrentSpend: 1,
      optimizationScore: 0,
      summary: "forged",
      resultData: "bypass",
    };
    const parsed = createAuditInputSchema.parse(tampered);
    expect(parsed).toEqual({ tools: [{ tool: "ChatGPT", spend: 300, users: 10 }] });
    expect((parsed as Record<string, unknown>).totalSavings).toBeUndefined();
    expect((parsed as Record<string, unknown>).resultData).toBeUndefined();
  });

  it("rejects an empty tools array", () => {
    expect(() => createAuditInputSchema.parse({ tools: [] })).toThrow();
  });

  it("rejects more than 50 tools in a single audit", () => {
    const tools = Array.from({ length: 51 }, (_, i) => ({
      tool: `Tool ${i}`,
      spend: 10,
      users: 1,
    }));
    expect(() => createAuditInputSchema.parse({ tools })).toThrow(/Too many tools/);
  });

  it("rejects a tool missing its name", () => {
    expect(() => createAuditInputSchema.parse({ tools: [{ spend: 10, users: 1 }] })).toThrow();
  });

  it("rejects negative spend and non-integer / zero users", () => {
    expect(() => createAuditInputSchema.parse({ tools: [{ tool: "X", spend: -5, users: 1 }] })).toThrow();
    expect(() => createAuditInputSchema.parse({ tools: [{ tool: "X", spend: 5, users: 1.5 }] })).toThrow();
    expect(() => createAuditInputSchema.parse({ tools: [{ tool: "X", spend: 5, users: 0 }] })).toThrow();
  });

  it("rejects absurd spend and seat counts", () => {
    expect(() => createAuditInputSchema.parse({ tools: [{ tool: "X", spend: 2_000_000_000, users: 1 }] })).toThrow();
    expect(() => createAuditInputSchema.parse({ tools: [{ tool: "X", spend: 5, users: 5_000_000 }] })).toThrow();
  });
});

describe("createAuditWithinLimit", () => {
  it("persists server-computed results derived from the audit engine", async () => {
    create.mockResolvedValue({ id: "a1" });
    await createAuditWithinLimit("user-1", rawInput, "org-1");

    const expected = generateAggregateAudit(rawInput.tools, new Date());
    const arg = create.mock.calls[0][0];

    expect(arg.data.userId).toBe("user-1");
    expect(arg.data.organizationId).toBe("org-1");
    expect(arg.data.department).toBe("Engineering");
    expect(arg.data.totalCurrentSpend).toBe(expected.totalCurrentSpend);
    expect(arg.data.totalOptimizedSpend).toBe(expected.totalOptimizedSpend);
    expect(arg.data.totalSavings).toBe(expected.totalSavings);
    expect(arg.data.totalAnnualSavings).toBe(expected.totalAnnualSavings);
    expect(arg.data.optimizationScore).toBe(expected.overallOptimizationScore);
    expect(arg.data.summary).toBe(expected.summary);
    expect(arg.data.resultData).toBe(JSON.stringify(expected));
    expect(arg.data.tools.create).toEqual(
      expected.tools.map((t) => ({
        name: t.tool,
        status: t.status,
        currentSpend: t.currentSpend,
        optimizedSpend: t.optimizedSpend,
        savings: t.savings,
        recommendation: t.recommendation,
      }))
    );
    expect((arg.data as Record<string, unknown>).totalSavings).not.toBeUndefined();
  });

  it("ignores forged totals/resultData in the input and recomputes them server-side", async () => {
    create.mockResolvedValue({ id: "a1" });

    const tamperedInput = {
      tools: [{ tool: "ChatGPT", spend: 300, users: 10 }],
      totalSavings: 9001,
      totalCurrentSpend: 1,
      optimizationScore: 0,
      summary: "forged",
      resultData: JSON.stringify({ hacked: true }),
    } as unknown as typeof rawInput;

    await createAuditWithinLimit("user-1", tamperedInput, "org-1");

    const expected = generateAggregateAudit(tamperedInput.tools, new Date());
    const arg = create.mock.calls[0][0];

    // Persisted numbers derive strictly from the engine, not the payload.
    expect(arg.data.totalSavings).toBe(expected.totalSavings);
    expect(arg.data.totalSavings).not.toBe(9001);
    expect(arg.data.totalCurrentSpend).toBe(expected.totalCurrentSpend);
    expect(arg.data.optimizationScore).toBe(expected.overallOptimizationScore);
    expect(arg.data.summary).toBe(expected.summary);
    expect(arg.data.resultData).toBe(JSON.stringify(expected));
    expect(arg.data.tools.create[0]).toEqual(
      expect.objectContaining({
        name: "ChatGPT",
        currentSpend: expected.tools[0].currentSpend,
        optimizedSpend: expected.tools[0].optimizedSpend,
        savings: expected.tools[0].savings,
      })
    );
  });
});

describe("getAuditsByUser / getAuditById", () => {
  it("scopes to the session user's own audits", async () => {
    findMany.mockResolvedValue([]);
    await getAuditsByUser("user-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: "user-1" }] },
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("adds org scoping when organizationId is provided", async () => {
    findMany.mockResolvedValue([]);
    await getAuditsByUser("user-1", "org-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: "user-1" }, { organizationId: "org-1" }] },
      })
    );
  });

  it("getAuditById filters by id and user/org scope", async () => {
    findFirst.mockResolvedValue({ id: "a1" });
    await getAuditById("a1", "user-1", "org-1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1", OR: [{ userId: "user-1" }, { organizationId: "org-1" }] },
      })
    );
  });

  it("never leaks another org's audits into a user's list (cross-org isolation)", async () => {
    findMany.mockResolvedValue([]);
    await getAuditsByUser("user-A", "org-A");
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ userId: "user-A" }, { organizationId: "org-A" }]);
    expect(where.OR).not.toContainEqual({ organizationId: "org-B" });
    expect(where.OR).not.toContainEqual({ userId: "user-B" });
  });

  it("deleteAudit only touches audits within the caller's own scope (cross-org isolation)", async () => {
    delMany.mockResolvedValue({ count: 1 });
    await deleteAudit("a1", "user-A", "org-A");
    const where = delMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ userId: "user-A" }, { organizationId: "org-A" }]);
    expect(where.OR).not.toContainEqual({ organizationId: "org-B" });
  });
});

describe("deleteAudit", () => {
  it("deletes only within the user's scope", async () => {
    delMany.mockResolvedValue({ count: 1 });
    await deleteAudit("a1", "user-1");
    expect(delMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1", OR: [{ userId: "user-1" }] } })
    );
  });
});

describe("user preferences", () => {
  it("reads preferences by user id", async () => {
    userFind.mockResolvedValue({ currency: "USD", teamSize: 5 });
    await expect(getUserPreferences("user-1")).resolves.toMatchObject({ currency: "USD", teamSize: 5 });
    expect(userFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-1" } }));
  });

  it("updates preferences for a user", async () => {
    userUpdate.mockResolvedValue({ currency: "EUR", teamSize: 3 });
    await updateUserPreferences("user-1", { currency: "EUR", teamSize: 3 });
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" }, data: { currency: "EUR", teamSize: 3 } })
    );
  });
});