import { describe, it, expect } from "vitest";
import {
  userRoleSchema,
  subscriptionPlanSchema,
  notificationTypeSchema,
  orgIdSchema,
  idSchema,
  currencySchema,
  teamSizeSchema,
  organizationNameSchema,
  emailSchema,
  analyticsTypeSchema,
  adminStatsTypeSchema,
  inviteMemberSchema,
  createDepartmentSchema,
  onboardingSchema,
  preferencesSchema,
  notificationPreferenceSchema,
  stripeCheckoutSchema,
  aiInsightsSchema,
  pricingCompareActionSchema,
  priceChangeSchema,
} from "@/lib/validation/schemas";

describe("primitive schemas", () => {
  it("userRole / plan / notification type enforce enum membership", () => {
    expect(userRoleSchema.parse("ADMIN")).toBe("ADMIN");
    expect(() => userRoleSchema.parse("SUPERUSER")).toThrow();
    expect(subscriptionPlanSchema.parse("PRO")).toBe("PRO");
    expect(() => subscriptionPlanSchema.parse("PLATINUM")).toThrow();
    expect(() => notificationTypeSchema.parse("UNKNOWN")).toThrow();
  });

  it("orgId / id reject empty strings", () => {
    expect(() => orgIdSchema.parse("")).toThrow();
    expect(() => idSchema.parse("")).toThrow();
    expect(orgIdSchema.parse("abc")).toBe("abc");
  });

  it("currency validates 3-letter codes and uppercases them (transform runs after validation)", () => {
    expect(currencySchema.parse("USD")).toBe("USD");
    expect(currencySchema.parse("EUR")).toBe("EUR");
    expect(() => currencySchema.parse("usd")).toThrow();
    expect(() => currencySchema.parse("US")).toThrow();
    expect(() => currencySchema.parse("USDD")).toThrow();
  });

  it("teamSize enforces integer range", () => {
    expect(teamSizeSchema.parse(1)).toBe(1);
    expect(teamSizeSchema.parse(500)).toBe(500);
    expect(() => teamSizeSchema.parse(0)).toThrow();
    expect(() => teamSizeSchema.parse(100001)).toThrow();
    expect(() => teamSizeSchema.parse(2.5)).toThrow();
  });

  it("organizationName trims surrounding whitespace", () => {
    expect(organizationNameSchema.parse("  Acme  ")).toBe("Acme");
    expect(organizationNameSchema.parse("Acme")).toBe("Acme");
  });

  it("email validates format and lowercases/trims via transform", () => {
    expect(emailSchema.parse("Foo@Bar.COM")).toBe("foo@bar.com");
    expect(() => emailSchema.parse("not-an-email")).toThrow();
    expect(() => emailSchema.parse("  Foo@Bar.COM ")).toThrow();
  });

  it("analytics / admin stats types reject unknown values", () => {
    expect(analyticsTypeSchema.parse("trends")).toBe("trends");
    expect(() => analyticsTypeSchema.parse("bogus")).toThrow();
    expect(adminStatsTypeSchema.parse("overview")).toBe("overview");
    expect(() => adminStatsTypeSchema.parse("nope")).toThrow();
  });
});

describe("inviteMemberSchema", () => {
  it("passes valid input and defaults role to VIEWER", () => {
    const out = inviteMemberSchema.parse({ orgId: "o1", email: "a@b.com" });
    expect(out.role).toBe("VIEWER");
  });

  it("rejects missing orgId / bad email / bad role", () => {
    expect(() => inviteMemberSchema.parse({ orgId: "", email: "a@b.com" })).toThrow();
    expect(() => inviteMemberSchema.parse({ orgId: "o1", email: "nope" })).toThrow();
    expect(() =>
      inviteMemberSchema.parse({ orgId: "o1", email: "a@b.com", role: "VICE_PRESIDENT" })
    ).toThrow();
  });
});

describe("createDepartmentSchema", () => {
  it("passes valid input and trims name", () => {
    expect(createDepartmentSchema.parse({ orgId: "o1", name: "  Engineering " }).name).toBe(
      "Engineering"
    );
  });
  it("rejects an empty department name", () => {
    // Strictly-empty string fails min(1)
    expect(() => createDepartmentSchema.parse({ orgId: "o1", name: "" })).toThrow();
  });
});

describe("onboardingSchema", () => {
  it("passes when at least one field is provided", () => {
    expect(onboardingSchema.parse({ teamSize: 10 })).toMatchObject({ teamSize: 10 });
    expect(onboardingSchema.parse({ currency: "USD" }).currency).toBe("USD");
    expect(onboardingSchema.parse({ organizationName: "Acme" }).organizationName).toBe("Acme");
  });

  it("rejects when all fields absent (refine)", () => {
    expect(() => onboardingSchema.parse({})).toThrow(/At least one field is required/);
  });

  it("rejects invalid currency/teamSize", () => {
    expect(() => onboardingSchema.parse({ currency: "GB" })).toThrow();
    expect(() => onboardingSchema.parse({ teamSize: 0 })).toThrow();
  });
});

describe("preferencesSchema", () => {
  it("accepts an empty update", () => {
    expect(preferencesSchema.parse({})).toEqual({});
  });
  it("rejects invalid currency", () => {
    expect(() => preferencesSchema.parse({ currency: "x" })).toThrow();
  });
});

describe("notificationPreferenceSchema", () => {
  it("requires a valid type and boolean enabled", () => {
    expect(notificationPreferenceSchema.parse({ type: "WEEKLY_DIGEST", enabled: true })).toBeTruthy();
    expect(() => notificationPreferenceSchema.parse({ type: "WEEKLY_DIGEST", enabled: "yes" })).toThrow();
    expect(() => notificationPreferenceSchema.parse({ type: "NOPE", enabled: true })).toThrow();
  });
});

describe("stripeCheckoutSchema / aiInsightsSchema", () => {
  it("validates checkout payload", () => {
    expect(() => stripeCheckoutSchema.parse({ priceId: "", plan: "PRO" })).toThrow();
    expect(() => stripeCheckoutSchema.parse({ priceId: "p_1", plan: "PLATINUM" })).toThrow();
    expect(stripeCheckoutSchema.parse({ priceId: "p_1", plan: "ENTERPRISE" })).toMatchObject({
      plan: "ENTERPRISE",
    });
  });

  it("validates ai insights payload", () => {
    expect(() => aiInsightsSchema.parse({ auditId: "", type: "insights" })).toThrow();
    expect(() => aiInsightsSchema.parse({ auditId: "a1", type: "bogus" })).toThrow();
  });
});

describe("pricingCompareActionSchema (discriminated union)", () => {
  it("dispatches on action = compare", () => {
    const out = pricingCompareActionSchema.parse({
      action: "compare",
      tool: "ChatGPT",
      plan: "Plus",
      users: 5,
    });
    expect(out.action).toBe("compare");
  });

  it("rejects compare without a positive users count", () => {
    expect(() =>
      pricingCompareActionSchema.parse({ action: "compare", tool: "ChatGPT", plan: "Plus", users: 0 })
    ).toThrow();
  });

  it("dispatches on action = redundant and requires a non-empty tools array", () => {
    const out = pricingCompareActionSchema.parse({ action: "redundant", tools: [{ name: "x" }] });
    expect(out.action).toBe("redundant");
    expect(() => pricingCompareActionSchema.parse({ action: "redundant", tools: [] })).toThrow();
  });

  it("dispatches on action = project and validates spend", () => {
    const out = pricingCompareActionSchema.parse({ action: "project", currentSpend: 100 });
    expect(out.action).toBe("project");
    expect(() =>
      pricingCompareActionSchema.parse({ action: "project", currentSpend: -1 })
    ).toThrow();
  });
});

describe("priceChangeSchema", () => {
  it("parses a verified price change and coerces effectiveDate", () => {
    const out = priceChangeSchema.parse({
      vendor: "cursor",
      product: "Cursor",
      plan: "Pro",
      effectiveDate: "2026-03-01",
      price: 25,
      sourceStatus: "VERIFIED",
      officialPricingUrl: "https://cursor.com/pricing",
    });
    expect(out.effectiveDate).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(out.price).toBe(25);
    expect(out.billingType).toBeUndefined();
  });

  it("defaults price to 0 for custom/usage plans (never a fabricated number)", () => {
    const out = priceChangeSchema.parse({
      vendor: "openai",
      product: "OpenAI API",
      plan: "Pay-as-you-go",
      effectiveDate: "2026-01-01",
      billingType: "USAGE",
    });
    expect(out.price).toBe(0);
    expect(out.billingType).toBe("USAGE");
  });

  it("rejects a negative price and a missing effective date", () => {
    expect(() =>
      priceChangeSchema.parse({ vendor: "a", product: "b", plan: "c", effectiveDate: "2026-01-01", price: -1 })
    ).toThrow();
    expect(() =>
      priceChangeSchema.parse({ vendor: "a", product: "b", plan: "c" })
    ).toThrow();
  });

  it("accepts segment and power for downgrade-eligibility metadata", () => {
    const out = priceChangeSchema.parse({
      vendor: "anthropic",
      product: "Claude",
      plan: "Max",
      effectiveDate: "2026-01-01",
      price: 100,
      sourceStatus: "VERIFIED",
      segment: "individual",
      power: true,
    });
    expect(out.segment).toBe("individual");
    expect(out.power).toBe(true);
  });

  it("rejects an unknown segment value", () => {
    expect(() =>
      priceChangeSchema.parse({
        vendor: "a", product: "b", plan: "c", effectiveDate: "2026-01-01",
        price: 10, segment: "ultra",
      })
    ).toThrow();
  });
});
