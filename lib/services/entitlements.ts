import "server-only";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { PLAN_CONFIG, AUDIT_LIMIT_WINDOW_MS } from "@/lib/features/plan-config";
import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

export type PlanFeature = "ai" | "analytics" | "team";

/**
 * Only these subscription states entitle a user to paid-plan features. Any
 * other state — CANCELED, PAST_DUE, INCOMPLETE, an unknown value, or a missing
 * subscription row — resolves to FREE. This is fail-closed: it can never grant
 * paid access, and a canceled subscription stops retaining paid limits.
 */
const PAID_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "ACTIVE",
  "TRIALING",
]);

export class PlanRequiredError extends ApiError {
  constructor(
    message: string,
    public feature: PlanFeature
  ) {
    super(message, 403);
    this.name = "PlanRequiredError";
  }
}

export class PlanLimitError extends ApiError {
  constructor(
    message: string,
    public scope: "audit" | "export"
  ) {
    super(message, 403);
    this.name = "PlanLimitError";
  }
}

export function isPaidPlan(
  plan: SubscriptionPlan,
  status: SubscriptionStatus | null | undefined
): boolean {
  if (plan !== "PRO" && plan !== "ENTERPRISE") return false;
  return status != null && PAID_STATUSES.has(status);
}

export function effectivePlan(
  plan: SubscriptionPlan,
  status: SubscriptionStatus | null | undefined
): SubscriptionPlan {
  return isPaidPlan(plan, status) ? plan : "FREE";
}

export function featuresForPlan(plan: SubscriptionPlan): Record<PlanFeature, boolean> {
  const config = PLAN_CONFIG[plan] ?? PLAN_CONFIG.FREE;
  return {
    ai: config.aiRecommendations,
    analytics: config.analytics,
    team: config.teamCollaboration,
  };
}

export interface UserEntitlements {
  plan: SubscriptionPlan;
  status: SubscriptionStatus | null;
  features: Record<PlanFeature, boolean>;
  auditLimit: number;
  auditCount: number;
  auditRemaining: number;
  exportLimit: number;
  exportCount: number;
  exportRemaining: number;
}

/**
 * Single server-side entitlement lookup. The effective plan is derived from
 * the verified subscription row only (plan + status); limits and features come
 * from the plan config, never from client input or from stored limit columns
 * that a stale webhook could have left behind. Audit usage is measured over
 * the rolling 30-day window the product plan markets ("5 audits per month").
 */
export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  if (!userId) {
    const free = PLAN_CONFIG.FREE;
    return {
      plan: "FREE",
      status: null,
      features: featuresForPlan("FREE"),
      auditLimit: free.auditLimit,
      auditCount: 0,
      auditRemaining: free.auditLimit,
      exportLimit: free.exportLimit,
      exportCount: 0,
      exportRemaining: free.exportLimit,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });
  if (!user) throw new Error("User not found");

  const rawPlan = (user.subscription?.plan ?? "FREE") as SubscriptionPlan;
  const status = user.subscription?.status ?? null;
  const plan = effectivePlan(rawPlan, status);
  const config = PLAN_CONFIG[plan];

  const windowStart = new Date(Date.now() - AUDIT_LIMIT_WINDOW_MS);
  const [auditCount, exportCount] = await Promise.all([
    prisma.audit.count({ where: { userId, createdAt: { gte: windowStart } } }),
    // Exports are metered over the same rolling 30-day window as audits,
    // matching the product marketing ("5 audits/exports per month") instead of
    // counting lifetime usage.
    prisma.savedReport.count({ where: { userId, createdAt: { gte: windowStart } } }),
  ]);

  return {
    plan,
    status,
    features: featuresForPlan(plan),
    auditLimit: config.auditLimit,
    auditCount,
    auditRemaining: Math.max(config.auditLimit - auditCount, 0),
    exportLimit: config.exportLimit,
    exportCount,
    exportRemaining: Math.max(config.exportLimit - exportCount, 0),
  };
}

/**
 * Throws when the user's effective plan does not include `feature`. The client
 * can never declare itself entitled: entitlement is established server-side.
 */
export async function assertFeature(
  userId: string,
  feature: PlanFeature
): Promise<UserEntitlements> {
  const entitlements = await getUserEntitlements(userId);
  if (!entitlements.features[feature]) {
    const messages: Record<PlanFeature, string> = {
      ai: "AI-powered insights require the Pro plan. Upgrade to enable them.",
      analytics: "Advanced analytics require the Pro plan. Upgrade to enable them.",
      team: "Team collaboration requires the Pro plan. Upgrade to enable it.",
    };
    throw new PlanRequiredError(messages[feature], feature);
  }
  return entitlements;
}