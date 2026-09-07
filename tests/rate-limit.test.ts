import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  rateLimit,
  rateLimitOrThrow,
  getClientIp,
  trustProxy,
  clearRateLimits,
  resetRateLimitBackendForTests,
  selectBackendFromEnv,
  getRateLimitBackend,
} from "@/lib/services/rate-limit";
import { ApiError } from "@/lib/errors";

// NODE_ENV is a read-only, non-deletable property on node's ProcessEnv type at
// runtime it is a plain string, so these tests mutate it through a loose view.
const env = process.env as Record<string, string | undefined>;

async function withNodeEnv(value: string, fn: () => Promise<void>) {
  const prev = env.NODE_ENV;
  env.NODE_ENV = value;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prev;
    resetRateLimitBackendForTests();
  }
}

describe("rate-limit core", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  afterEach(() => {
    clearRateLimits();
  });

  it("allows requests below the limit and decrements remaining", async () => {
    const first = await rateLimit("k", 3, 60000);
    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(2);

    const second = await rateLimit("k", 3, 60000);
    expect(second.ok).toBe(true);
    expect(second.remaining).toBe(1);
  });

  it("returns ok=false once the limit is exceeded", async () => {
    await rateLimit("k", 2, 60000);
    await rateLimit("k", 2, 60000);
    const exceeded = await rateLimit("k", 2, 60000);
    expect(exceeded.ok).toBe(false);
    expect(exceeded.remaining).toBe(0);
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    try {
      expect((await rateLimit("k", 1, 1000)).ok).toBe(true);
      expect((await rateLimit("k", 1, 1000)).ok).toBe(false);
      vi.setSystemTime(Date.now() + 1001);
      expect((await rateLimit("k", 1, 1000)).ok).toBe(true);
    } finally {
      vi.useRealTimers();
      clearRateLimits();
    }
  });

  it("isolates different keys", async () => {
    await rateLimit("a", 1, 60000);
    await rateLimit("a", 1, 60000);
    expect((await rateLimit("a", 1, 60000)).ok).toBe(false);
    expect((await rateLimit("b", 1, 60000)).ok).toBe(true);
  });

  it("isolates different clients by IP (extracted via getClientIp)", async () => {
    const ipA = getClientIp(
      new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.1" } })
    );
    const ipB = getClientIp(
      new Request("http://x/", { headers: { "x-forwarded-for": "198.51.100.2" } })
    );
    await rateLimit(ipA, 1, 60000);
    expect((await rateLimit(ipA, 1, 60000)).ok).toBe(false);
    expect((await rateLimit(ipB, 1, 60000)).ok).toBe(true);
  });

  it("rateLimitOrThrow returns remaining when under the limit", async () => {
    const result = await rateLimitOrThrow("k", 3, 60000);
    expect(result.remaining).toBe(2);
  });

  it("rateLimitOrThrow throws ApiError(429) when exceeded", async () => {
    await rateLimit("k", 1, 60000);
    await expect(rateLimitOrThrow("k", 1, 60000)).rejects.toThrow(ApiError);
    try {
      await rateLimitOrThrow("k", 1, 60000);
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(429);
    }
  });

  it("getClientIp returns the first x-forwarded-for entry", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("getClientIp falls back to x-real-ip then anonymous", () => {
    expect(getClientIp(new Request("http://localhost/"))).toBe("anonymous");
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "198.51.100.5" },
    });
    expect(getClientIp(req)).toBe("198.51.100.5");
  });

  it("trustProxy is opt-in only", () => {
    const prev = process.env.TRUST_PROXY;
    try {
      delete process.env.TRUST_PROXY;
      expect(trustProxy()).toBe(false);
      process.env.TRUST_PROXY = "0";
      expect(trustProxy()).toBe(false);
      process.env.TRUST_PROXY = "false";
      expect(trustProxy()).toBe(false);
      process.env.TRUST_PROXY = "1";
      expect(trustProxy()).toBe(true);
      process.env.TRUST_PROXY = "true";
      expect(trustProxy()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  it("ignores spoofed forwarded headers when TRUST_PROXY is off (no bypass)", () => {
    const prev = process.env.TRUST_PROXY;
    try {
      delete process.env.TRUST_PROXY;
      const spoofed = new Request("http://localhost/", {
        headers: {
          "x-forwarded-for": "203.0.113.9",
          "x-real-ip": "198.51.100.5",
        },
      });
      expect(getClientIp(spoofed)).toBe("anonymous");
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });
});

describe("rate-limit backend selection", () => {
  afterEach(() => {
    resetRateLimitBackendForTests();
  });

  it("selects memory by default (no Upstash env configured)", () => {
    expect(selectBackendFromEnv({})).toBe("memory");
    expect(selectBackendFromEnv({ DATABASE_URL: "x" })).toBe("memory");
  });

  it("selects upstash only when BOTH url and token are set", () => {
    // A partial config is a misconfiguration in any environment — it must never
    // silently downgrade to the in-process memory store.
    expect(
      selectBackendFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" }, "test")
    ).toBe("misconfigured");
    expect(
      selectBackendFromEnv({ UPSTASH_REDIS_REST_TOKEN: "abc" }, "test")
    ).toBe("misconfigured");
    expect(
      selectBackendFromEnv({
        UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "abc",
      }, "test")
    ).toBe("upstash");
  });

  it("selects memory in dev/test when no distributed config is present", () => {
    expect(selectBackendFromEnv({}, "development")).toBe("memory");
    expect(selectBackendFromEnv({}, "test")).toBe("memory");
    expect(selectBackendFromEnv({ DATABASE_URL: "x" }, "development")).toBe("memory");
  });

  it("treats production WITHOUT a distributed limiter as misconfigured (fail closed)", () => {
    expect(selectBackendFromEnv({}, "production")).toBe("misconfigured");
    expect(
      selectBackendFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" }, "production")
    ).toBe("misconfigured");
    expect(
      selectBackendFromEnv(
        { UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "abc" },
        "production"
      )
    ).toBe("upstash");
  });

  it("runs the default backend as in-process memory without Upstash env", () => {
    // Tests run without UPSTASH vars: the resolved backend must be memory.
    resetRateLimitBackendForTests();
    const backend = getRateLimitBackend();
    expect(backend.constructor.name).toBe("MemoryRateLimitBackend");
  });

  it("resolves to a fail-closed backend in production without Upstash config", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    await withNodeEnv("production", async () => {
      resetRateLimitBackendForTests();
      const backend = getRateLimitBackend();
      expect(backend.constructor.name).toBe("UnavailableRateLimitBackend");
      await expect(rateLimit("k", 1, 60000)).rejects.toThrow(/UPSTASH_REDIS_REST_URL/);
    });
  });
});

describe("upstash backend", () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimitBackendForTests();
  });

  it("parses the real {result: N} envelope and enforces the limit via the REST API", async () => {
    resetRateLimitBackendForTests();
    process.env.UPSTASH_REDIS_REST_URL = "https://demo.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const body = JSON.parse(String(init?.body)) as string[];
        if (body[0] === "INCR") {
          return new Response(JSON.stringify({ result: 2 }));
        }
        return new Response(JSON.stringify(1));
      });

    const ok = await rateLimit("pricing:compare:u1", 1, 60000);
    // Regression: {result: 2} must read as count=2 (> limit 1), NOT as a bare
    // number that made every request look within-limits.
    expect(ok.ok).toBe(false);
    expect(ok.remaining).toBe(0);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://demo.upstash.io",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
        body: expect.stringContaining("INCR"),
      })
    );
    // PEXPIRE is issued after INCR.
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit | undefined)?.body)));
    expect(bodies).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(["PEXPIRE"]),
      ])
    );
    fetchMock.mockRestore();
  });

  it("counts an at-limit {result: N} as within limits and below-limit counts as remaining", async () => {
    resetRateLimitBackendForTests();
    process.env.UPSTASH_REDIS_REST_URL = "https://demo.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    let count = 1;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const body = JSON.parse(String(init?.body)) as string[];
        return new Response(JSON.stringify({ result: body[0] === "INCR" ? count : 1 }));
      });

    const under = await rateLimit("k", 3, 60000);
    expect(under).toEqual({ ok: true, remaining: 2 });

    count = 3;
    const atLimit = await rateLimit("k", 3, 60000);
    expect(atLimit).toEqual({ ok: true, remaining: 0 });

    count = 4;
    const over = await rateLimit("k", 3, 60000);
    expect(over).toEqual({ ok: false, remaining: 0 });
    fetchMock.mockRestore();
  });

  it("fails open in dev/test when the REST backend is unreachable", async () => {
    resetRateLimitBackendForTests();
    process.env.UPSTASH_REDIS_REST_URL = "https://demo.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("backend down"));

    try {
      const ok = await rateLimit("k", 1, 60000);
      expect(ok.ok).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("fails closed (throws) in production when the REST backend errors", async () => {
    await withNodeEnv("production", async () => {
      resetRateLimitBackendForTests();
      process.env.UPSTASH_REDIS_REST_URL = "https://demo.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token";

      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("backend down"));

      try {
        await expect(rateLimit("k", 1, 60000)).rejects.toThrow("Rate limiting backend unavailable");
      } finally {
        fetchMock.mockRestore();
      }
    });
  });

  it("fails closed in production on a non-ok HTTP response from the backend", async () => {
    await withNodeEnv("production", async () => {
      resetRateLimitBackendForTests();
      process.env.UPSTASH_REDIS_REST_URL = "https://demo.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token";

      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("rate limited upstream", { status: 429 }));

      try {
        await expect(rateLimit("k", 1, 60000)).rejects.toThrow("Rate limiting backend unavailable");
      } finally {
        fetchMock.mockRestore();
      }
    });
  });
});

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireUserOrg: vi.fn(),
  requireRole: vi.fn(),
  findFirst: vi.fn(),
  genInsights: vi.fn(),
  assertFeature: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requireUserOrg: mocks.requireUserOrg,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/db", () => ({ prisma: { audit: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/services/entitlements", () => ({
  assertFeature: mocks.assertFeature,
}));
vi.mock("@/lib/services/ai-service", () => ({
  generateOptimizationInsights: mocks.genInsights,
  generateExecutiveSummary: mocks.genInsights,
  generateVendorConsolidationSuggestions: mocks.genInsights,
  generateSavingsAnalysis: mocks.genInsights,
}));

import { POST } from "@/app/api/ai/insights/route";

describe("ai/insights route with real rate limiter", () => {
  const fakeAudit = {
    id: "a1",
    userId: "user-1",
    organizationId: "org-1",
    tools: [],
    totalCurrentSpend: 0,
    totalSavings: 0,
    optimizationScore: 80,
    summary: "summary",
  };

  beforeEach(() => {
    clearRateLimits();
    vi.clearAllMocks();
    mocks.requireUserOrg.mockResolvedValue({ id: "user-1", organizationId: "org-1" });
    mocks.requireRole.mockResolvedValue(undefined);
    mocks.assertFeature.mockResolvedValue(undefined);
    mocks.findFirst.mockResolvedValue(fakeAudit);
    mocks.genInsights.mockResolvedValue("optimization insight");
  });

  afterEach(() => {
    clearRateLimits();
  });

  const makeReq = (body: unknown) =>
    new Request("http://localhost/api/ai/insights", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.50" },
    });

  it("returns 401 when unauthenticated, before rate limiting", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await POST(makeReq({ auditId: "a1", type: "insights" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid payload when under the limit", async () => {
    mocks.requireUserId.mockResolvedValue("user-1");
    const res = await POST(makeReq({ auditId: "a1", type: "not-a-type" }));
    expect(res.status).toBe(400);
  });

  it("succeeds below the limit (20 requests)", async () => {
    mocks.requireUserId.mockResolvedValue("user-1");
    for (let i = 0; i < 20; i++) {
      const res = await POST(makeReq({ auditId: "a1", type: "insights" }));
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 once the limit is exceeded (21st request)", async () => {
    mocks.requireUserId.mockResolvedValue("user-1");
    for (let i = 0; i < 20; i++) {
      await POST(makeReq({ auditId: "a1", type: "insights" }));
    }
    const blocked = await POST(makeReq({ auditId: "a1", type: "insights" }));
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error?: string };
    expect(body.error?.length).toBeGreaterThan(0);
  });

  it("isolates different users (user-2 not blocked when user-1 is)", async () => {
    mocks.requireUserId.mockResolvedValue("user-1");
    for (let i = 0; i < 20; i++) {
      await POST(makeReq({ auditId: "a1", type: "insights" }));
    }
    expect((await POST(makeReq({ auditId: "a1", type: "insights" }))).status).toBe(429);

    mocks.requireUserId.mockResolvedValue("user-2");
    const res = await POST(makeReq({ auditId: "a1", type: "insights" }));
    expect(res.status).toBe(200);
  });

  it("recovers after the rate-limit window expires", async () => {
    vi.useFakeTimers();
    try {
      mocks.requireUserId.mockResolvedValue("user-1");
      for (let i = 0; i < 20; i++) {
        await POST(makeReq({ auditId: "a1", type: "insights" }));
      }
      expect((await POST(makeReq({ auditId: "a1", type: "insights" }))).status).toBe(429);

      vi.setSystemTime(Date.now() + 60001);
      const res = await POST(makeReq({ auditId: "a1", type: "insights" }));
      expect(res.status).toBe(200);
    } finally {
      vi.useRealTimers();
      clearRateLimits();
    }
  });
});