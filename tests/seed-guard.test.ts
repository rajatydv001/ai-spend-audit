import { describe, it, expect } from "vitest";
import { shouldSeedAdmin } from "@/lib/services/seed-guard";

describe("shouldSeedAdmin", () => {
  it("allows seeding in development without extra config (unchanged default)", () => {
    expect(shouldSeedAdmin({ NODE_ENV: "development" })).toEqual({ allowed: true });
  });

  it("refuses the elevated admin seed in production unless explicitly opted in", () => {
    const decision = shouldSeedAdmin({ NODE_ENV: "production" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/ALLOW_ADMIN_SEED_IN_PRODUCTION/);
  });

  it("refuses the fixed dev default password in production", () => {
    const decision = shouldSeedAdmin({
      NODE_ENV: "production",
      ALLOW_ADMIN_SEED_IN_PRODUCTION: "true",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/SEED_ADMIN_PASSWORD/);
  });

  it("allows seeding only with the explicit opt-in AND a production password", () => {
    expect(
      shouldSeedAdmin({
        NODE_ENV: "production",
        ALLOW_ADMIN_SEED_IN_PRODUCTION: "true",
        SEED_ADMIN_PASSWORD: "a-true-secret",
      })
    ).toEqual({ allowed: true });
  });

  it("still refuses when the opt-in flag is not explicitly 'true'", () => {
    expect(
      shouldSeedAdmin({
        NODE_ENV: "production",
        ALLOW_ADMIN_SEED_IN_PRODUCTION: "1",
        SEED_ADMIN_PASSWORD: "a-true-secret",
      }).allowed
    ).toBe(false);
  });
});