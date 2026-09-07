import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { parseEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/ai-spend-audit",
  SESSION_SECRET: "a".repeat(32),
  NODE_ENV: "development",
};

describe("env validation — rate limiting config", () => {
  it("dev/test may run without any Upstash config (in-process memory fallback)", () => {
    expect(parseEnv({ ...base, NODE_ENV: "development" })).toBeDefined();
    expect(parseEnv({ ...base, NODE_ENV: "test" })).toBeDefined();
  });

  it("production REQUIRES a complete distributed limiter config (fail closed at startup)", () => {
    for (const partial of [
      {},
      { UPSTASH_REDIS_REST_URL: "https://db.upstash.io" },
      { UPSTASH_REDIS_REST_TOKEN: "token" },
    ]) {
      let thrown: ZodError | null = null;
      try {
        parseEnv({
          ...base,
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://app.example.com",
          ...partial,
        });
      } catch (error) {
        thrown = error as ZodError;
      }
      expect(thrown).toBeInstanceOf(ZodError);
      expect(thrown?.issues.map((i) => i.path.join("."))).toContain("UPSTASH_REDIS_REST_URL");
    }
  });

  it("production with valid Upstash config passes", () => {
    expect(
      parseEnv({
        ...base,
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        UPSTASH_REDIS_REST_URL: "https://valid-db.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "token",
      })
    ).toBeDefined();
  });

  it("a partial Upstash config fails closed in DEV too (never silently ignored)", () => {
    let thrown: ZodError | null = null;
    try {
      parseEnv({ ...base, NODE_ENV: "development", UPSTASH_REDIS_REST_URL: "https://db.upstash.io" });
    } catch (error) {
      thrown = error as ZodError;
    }
    expect(thrown).toBeInstanceOf(ZodError);
    expect(thrown?.issues.map((i) => i.path.join("."))).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("rejects a malformed Upstash URL", () => {
    let thrown: ZodError | null = null;
    try {
      parseEnv({
        ...base,
        NODE_ENV: "development",
        UPSTASH_REDIS_REST_URL: "not-a-url",
        UPSTASH_REDIS_REST_TOKEN: "token",
      });
    } catch (error) {
      thrown = error as ZodError;
    }
    expect(thrown).toBeInstanceOf(ZodError);
  });
});