import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "ANALYST", "VIEWER"]);

export const subscriptionPlanSchema = z.enum(["FREE", "PRO", "ENTERPRISE"]);

export const notificationTypeSchema = z.enum([
  "WEEKLY_DIGEST",
  "OVERSPENDING_ALERT",
  "OPTIMIZATION_REMINDER",
  "REPORT_READY",
]);

export const orgIdSchema = z.string().min(1, "orgId is required");

export const idSchema = z.string().min(1, "id is required");

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "currency must be a 3-letter code")
  .transform((v) => v.toUpperCase());

export const teamSizeSchema = z
  .number()
  .int("teamSize must be an integer")
  .min(1, "teamSize must be at least 1")
  .max(100000, "teamSize is too large");

export const organizationNameSchema = z
  .string()
  .min(1, "Organization name is required")
  .trim();

export const emailSchema = z.string().email("Enter a valid email address").trim().toLowerCase();

export const analyticsTypeSchema = z.enum([
  "trends",
  "adoption",
  "utilization",
  "projection",
  "all",
]);

export const adminStatsTypeSchema = z.enum([
  "overview",
  "audit-volume",
  "user-growth",
  "audit-logs",
  "all",
]);

export const aiInsightTypeSchema = z.enum([
  "insights",
  "summary",
  "vendor-consolidation",
  "savings",
]);

export const inviteMemberSchema = z.object({
  orgId: orgIdSchema,
  email: emailSchema,
  role: userRoleSchema.default("VIEWER"),
});

export const memberActionSchema = z.object({
  orgId: orgIdSchema,
  memberId: idSchema,
});

export const memberRoleUpdateSchema = z.object({
  orgId: orgIdSchema,
  memberId: idSchema,
  role: userRoleSchema,
});

export const createDepartmentSchema = z.object({
  orgId: orgIdSchema,
  name: z.string().min(1, "Department name is required").trim(),
});

export const onboardingSchema = z
  .object({
    organizationName: organizationNameSchema.optional().or(z.literal("")),
    currency: currencySchema.optional(),
    teamSize: teamSizeSchema.optional(),
  })
  .refine(
    (data) => data.organizationName || data.currency || data.teamSize,
    "At least one field is required"
  );

export const preferencesSchema = z.object({
  currency: currencySchema.optional(),
  teamSize: teamSizeSchema.optional(),
});

export const notificationPreferenceSchema = z.object({
  type: notificationTypeSchema,
  enabled: z.boolean(),
});

export const stripeCheckoutSchema = z.object({
  priceId: z.string().min(1, "priceId is required"),
  plan: subscriptionPlanSchema,
});

export const aiInsightsSchema = z.object({
  auditId: idSchema,
  type: aiInsightTypeSchema,
});

export const exportReportSchema = z.object({
  auditId: idSchema,
});

export const pricingCompareActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("compare"),
    tool: z.string().min(1, "tool is required"),
    plan: z.string().min(1, "plan is required"),
    users: z.number().positive("users must be positive"),
  }),
  z.object({
    action: z.literal("redundant"),
    tools: z.array(z.any()).min(1, "tools array is required"),
  }),
  z.object({
    action: z.literal("project"),
    currentSpend: z.number().nonnegative("currentSpend must be non-negative"),
    growthRate: z.number().optional(),
  }),
]);

/**
 * Body for applying a verified price change to the versioned catalog.
 * `price` is the numeric price for FLAT/PER_USER plans. For CUSTOM / USAGE
 * plans the caller must set billingType accordingly and pass 0 (never an
 * invented estimate). A future `effectiveDate` stays inactive until then.
 */
export const priceChangeSchema = z.object({
  vendor: z.string().min(1),
  product: z.string().min(1),
  plan: z.string().min(1),
  effectiveDate: z
    .string()
    .min(1)
    .transform((v) => new Date(v)),
  price: z.number().nonnegative().default(0),
  currency: z.string().optional(),
  billingType: z.enum(["FLAT", "PER_USER", "USAGE", "CUSTOM"]).optional(),
  billingCadence: z.string().optional(),
  perUser: z.boolean().optional(),
  segment: z.enum(["free", "individual", "team", "business", "enterprise"]).optional(),
  power: z.boolean().optional(),
  minSeats: z.number().int().nonnegative().nullable().optional(),
  usageModel: z.string().optional(),
  officialPricingUrl: z.string().url().nullable().optional(),
  sourceStatus: z.enum(["VERIFIED", "UNVERIFIED", "STALE", "CUSTOM"]).optional(),
  lastVerifiedAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
});
