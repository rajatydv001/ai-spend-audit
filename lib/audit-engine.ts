// Types
export type AuditStatus = "Overpaying" | "Optimization Available" | "Optimized";

export interface ToolPricingPlan {
  name: string;
  costPerUser: number;
  minUsers?: number;
}

export interface ToolConfig {
  plans: ToolPricingPlan[];
  category: "SaaS" | "API";
}

// Tool pricing is sourced from the versioned, time-aware catalog. The audit
// engine resolves the plans that were active for the audit's `date`, so
// historical audits reuse the pricing valid at that time and future price
// changes never silently rewrite past or current results. The API tools are
// usage-based and carry price 0 by design (never converted to a fixed price).
import {
  getActiveToolPlans,
  isReplacementValid,
  type ActiveToolPlan,
} from "@/lib/pricing/catalog";

// Tools that are usage-based API products, distinct from per-seat SaaS tools.
const API_TOOLS = new Set(["OpenAI API", "Anthropic API", "ChatGPT API", "Claude API"]);

/**
 * Build the effective tool config for an audit date. SaaS tools come from the
 * catalog's plans active on that date for the default MONTHLY cadence (the app
 * does not expose a billing-cadence choice, so annual report-only variants are
 * never silently used for optimization). Custom (contact-sales) plans are kept
 * for display but never treated as a fixed $-priced tier, and usage-based API
 * tools are always usage.
 */
function getPlanSurface(tool: string, date: Date): ActiveToolPlan[] | undefined {
  if (API_TOOLS.has(tool)) return undefined;
  return getActiveToolPlans(tool, date);
}

export interface ToolAuditResult {
  tool: string;
  status: AuditStatus;
  recommendation: string;
  currentSpend: number;
  optimizedSpend: number;
  savings: number;
  optimizationScore: number;
  currentPlan: string;
  recommendedPlan: string;
}

export interface EnhancedRecommendation {
  tool: string;
  priority: "high" | "medium" | "low";
  severity: "critical" | "moderate" | "minor";
  impact: number;
  action: string;
  currentPlan: string;
  recommendedPlan: string;
}

export interface AggregateAuditResult {
  tools: ToolAuditResult[];
  totalCurrentSpend: number;
  totalOptimizedSpend: number;
  totalSavings: number;
  totalAnnualSavings: number;
  overallOptimizationScore: number;
  priorityRecommendations: string[];
  summary: string;
  savingsRate: number;
  teamEfficiencyScore: number;
  enhancedRecommendations: EnhancedRecommendation[];
}

/** Round money to 2 decimals to avoid float drift. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface OptimalPlan {
  currentPlan: ActiveToolPlan;
  /** Verified, eligible lower-cost replacement (never a free tier). */
  replacement: ActiveToolPlan | null;
  /** Verified total cost of the current plan at the given seat count, or null
   *  when no defensible figure exists (unverified, custom, seat bounds...). */
  currentCost: number | null;
  /** Verified total cost of the replacement at the given seat count. */
  replacementCost: number | null;
  savings: number;
  /**
   * Why no verified savings is claimed. Present exactly when savings === 0 so
   * the recommendation can explain itself honestly instead of fabricating an
   * ungrounded downgrade.
   */
  noReplacementReason:
    | "custom"
    | "free_current"
    | "unverified_current"
    | "seat_bounds"
    | "consumer_seats"
    | "no_eligible"
    | null;
}

/**
 * Verified cost of a plan at a given seat count, or null when the plan has no
 * defensible fixed price for `users`:
 *   - custom (contact-sales) and usage-based plans carry no fixed list price;
 *   - unverified plans (no official-source confirmation) are never priced;
 *   - min/max seat violations make the tier unavailable at `users`;
 *   - a consumer (non-seat-based) plan is billed per identifiable PERSON, so it
 *     is only priced for exactly one user. Multiplying a consumer license by an
 *     arbitrary seat count would fabricate cost.
 */
function planCostForUsers(plan: ActiveToolPlan, users: number): number | null {
  if (!plan.verified) return null;
  if (plan.custom || plan.usageBased) return null;
  if (plan.costPerUser <= 0) return null;
  if (plan.minUsers && users < plan.minUsers) return null;
  if (plan.maxUsers && users > plan.maxUsers) return null;
  if (!plan.seatBased && users !== 1) return null;
  return round2(plan.costPerUser * users);
}

/**
 * Human reason why the current plan yields no verified cost, in precedence
 * order. Mirrors the null branches of planCostForUsers so messages distinguish
 * custom pricing, a free tier, a per-person consumer tier carrying seats, an
 * unverified list price, and out-of-bounds seat counts.
 */
function currentPlanNoCostReason(
  plan: ActiveToolPlan,
  users: number
): OptimalPlan["noReplacementReason"] {
  if (plan.custom) return "custom";
  if (plan.segment === "free") return "free_current";
  if (!plan.verified) return "unverified_current";
  if (plan.costPerUser <= 0) return "unverified_current";
  if (plan.minUsers && users < plan.minUsers) return "seat_bounds";
  if (plan.maxUsers && users > plan.maxUsers) return "seat_bounds";
  if (!plan.seatBased && users !== 1) return "consumer_seats";
  return null;
}

/**
 * Determine the current plan (the active tier whose per-seat list price is
 * closest to the reported spend-per-seat) and the best VERIFIED eligible
 * downgrade.
 *
 * Savings are only ever claimed as verified current cost − verified replacement
 * cost, capped at the spread across the user's real reported spend (never more
 * than the user actually pays, never when reported spend already sits at or
 * below the replacement's verified cost). Claimed numbers are grounded in
 * VERIFIED official list prices:
 *   - a free tier is never an automatic replacement — its $0 price is an
 *     absence of charge, not a verified entitlement to downgrade;
 *   - unverified, custom, and usage-based plans carry no defensible price;
 *   - consumer/individual licenses are per-person and never multiply by seats;
 *   - organization tiers respect official per-seat pricing and seat bounds.
 * When no verified lower-cost replacement exists, savings is 0, no plan is
 * recommended, and `noReplacementReason` lets the message explain honestly.
 */
function calculateOptimalPlan(
  tool: string,
  spend: number,
  users: number,
  date: Date,
  plan?: string
): OptimalPlan | null {
  const surface = getPlanSurface(tool, date);
  if (!surface) return null;

  // Custom + usage plans have no fixed price — excluded from pricing.
  const priced = surface.filter((p) => !p.custom && !p.usageBased);
  const validPlans = priced.filter(
    (p) =>
      (!p.minUsers || p.minUsers <= users) &&
      (!p.maxUsers || p.maxUsers >= users)
  );

  if (validPlans.length === 0) return null;

  const costPerSeat = users > 0 ? spend / users : 0;

  // For a paid audit (spend > 0) a free tier is not a plausible current plan —
  // the user pays for this tool, so detection must land on a priced tier.
  const detectionPool =
    spend > 0 ? validPlans.filter((p) => p.segment !== "free") : validPlans;
  const detected =
    detectionPool.length > 0
      ? detectionPool.reduce((closest, candidate) => {
          const diff = Math.abs(candidate.costPerUser - costPerSeat);
          const closestDiff = Math.abs(closest.costPerUser - costPerSeat);
          return diff < closestDiff ? candidate : closest;
        })
      : validPlans[0];

  // An explicitly selected plan is authoritative when it exists in the active
  // surface and satisfies its seat bounds; otherwise fall back to the
  // spend-per-seat estimate.
  const currentPlan = plan
    ? (surface.find(
        (p) =>
          p.name === plan &&
          (!p.minUsers || p.minUsers <= users) &&
          (!p.maxUsers || p.maxUsers >= users)
      ) ?? detected)
    : detected;

  const currentCost = planCostForUsers(currentPlan, users);
  let replacement: ActiveToolPlan | null = null;
  let replacementCost: number | null = null;
  let savings = 0;
  let noReplacementReason: OptimalPlan["noReplacementReason"] = null;

  if (currentCost === null) {
    noReplacementReason = currentPlanNoCostReason(currentPlan, users);
  } else {
    // Strictly-cheaper, VERIFIED, segment-eligible replacements only. Free tiers
    // are excluded: a $0 plan is not a verified enforceable cost, so claiming it
    // as a replacement would invent savings. Custom/usage never enter `priced`.
    const cheaper = validPlans
      .filter((p) => p.verified && p.costPerUser > 0 && p.segment !== "free")
      .filter((p) => p.costPerUser < currentPlan.costPerUser)
      .filter((p) => isReplacementValid(p, currentPlan))
      .sort((a, b) => a.costPerUser - b.costPerUser);

    for (const candidate of cheaper) {
      const cost = planCostForUsers(candidate, users);
      if (cost !== null) {
        replacement = candidate;
        replacementCost = cost;
        break;
      }
    }

    if (
      replacement &&
      replacementCost !== null &&
      currentCost > replacementCost
    ) {
      const verifiedSavings = currentCost - replacementCost;
      const claimableBySpend = spend - replacementCost;
      if (claimableBySpend > 0) {
        savings = round2(Math.min(verifiedSavings, claimableBySpend));
      } else {
        // Reported spend already at/below the verified replacement's cost —
        // nothing defensible to claim.
        noReplacementReason = "no_eligible";
      }
    } else {
      noReplacementReason = "no_eligible";
    }
  }

  return {
    currentPlan,
    replacement,
    currentCost,
    replacementCost,
    savings,
    noReplacementReason,
  };
}

/**
 * Generate recommendation for the audited tool. When verified savings exist the
 * message names the replacement and the exact numbers. Otherwise it explains WHY
 * no verified lower-cost replacement is claimable based on the current plan's
 * data quality and eligibility, so the UI never fabricates a downgrade claim.
 */
function generateRecommendation(
  tool: string,
  spend: number,
  users: number,
  optimal: OptimalPlan | null
): string {
  if (!optimal) return "";
  const planName = optimal.currentPlan.name;
  const userPhrase = `${users} user${users > 1 ? "s" : ""} / $${spend}/mo`;

  if (
    optimal.savings > 0 &&
    optimal.replacement &&
    optimal.replacementCost !== null
  ) {
    return `Switch to the ${optimal.replacement.name} plan. Estimated savings: $${optimal.savings}/mo ($${spend}/mo → $${optimal.replacementCost}/mo).`;
  }

  switch (optimal.noReplacementReason) {
    case "custom":
      return `No verified lower-cost replacement found for your ${tool} setup (${planName}) at ${userPhrase}. ${planName} pricing is custom (contact-sales), so it cannot be compared to published monthly list prices here — ask your account team for a rate review.`;
    case "free_current":
      return `No verified lower-cost replacement found for your ${tool} setup (${planName}) at ${userPhrase}. ${planName} is a free tier with no monthly cost, so there is nothing to optimize.`;
    case "consumer_seats":
      return `No verified lower-cost replacement found for your ${tool} setup (${planName}) at ${userPhrase}. ${planName} is a per-person consumer plan; multiplying its list price by ${users} seats would fabricate savings, and a separate verified lower-cost plan was not found for ${users} seats.`;
    case "unverified_current":
      return `No verified lower-cost replacement found for your ${tool} setup (${planName}) at ${userPhrase}. ${planName}'s list price is not verified against an official source, so an estimated downgrade would not produce a defensible savings number.`;
    case "seat_bounds":
      return `No verified lower-cost replacement found for your ${tool} setup (${planName}) at ${userPhrase}. ${planName} is only available outside this seat count (${users} seats), so it cannot price a verified reduction.`;
    case "no_eligible":
    default:
      return `No verified lower-cost replacement found for your ${tool} setup (${planName}) at ${userPhrase}. Every currently-cheaper plan is either not verified, not an eligible downgrade for your segment, or below its minimum seat count.`;
  }
}

/**
 * Calculate optimization score (0-100)
 */
function calculateOptimizationScore(savings: number, currentSpend: number): number {
  if (currentSpend === 0) return 100;
  const savingsPercentage = (savings / currentSpend) * 100;
  return Math.min(100, Math.max(0, 100 - savingsPercentage));
}

/**
 * Generate professional executive summary for audit results
 */
function generateExecutiveSummary(
  toolCount: number,
  optimizationScore: number,
  totalSavings: number,
  annualSavings: number,
  totalSpend: number,
  overpayingCount: number
): string {
  // Determine health status
  let healthStatus: string;
  if (optimizationScore >= 85) {
    healthStatus = "excellent";
  } else if (optimizationScore >= 70) {
    healthStatus = "good";
  } else if (optimizationScore >= 50) {
    healthStatus = "moderate";
  } else {
    healthStatus = "critical";
  }

  // Build summary components
  const spendMessage = `You're currently spending $${totalSpend}/mo on ${toolCount} AI tool${toolCount !== 1 ? "s" : ""}.`;

  let optimizationMessage: string;
  if (totalSavings === 0) {
    optimizationMessage = `Your AI stack shows ${healthStatus} optimization health with no immediate savings opportunities identified.`;
  } else {
    const savingsPercentage = ((totalSavings / totalSpend) * 100).toFixed(1);
    optimizationMessage = `Your AI stack shows ${healthStatus} optimization health. By implementing our recommendations, you could reduce spending by ${savingsPercentage}%, saving $${totalSavings}/mo ($${annualSavings}/year).`;
  }

  // Build recommendation message
  let recommendationMessage: string;
  if (overpayingCount > 0) {
    recommendationMessage = `${overpayingCount} tool${overpayingCount !== 1 ? "s" : ""} ${overpayingCount !== 1 ? "are" : "is"} currently overpaying—prioritize these for immediate cost reduction.`;
  } else {
    recommendationMessage = `Review our detailed recommendations to unlock additional efficiency gains.`;
  }

  return `${spendMessage} ${optimizationMessage} ${recommendationMessage}`;
}

/**
 * Audit a single tool
 */
function auditSingleTool(
  tool: string,
  spend: number,
  users: number,
  date: Date = new Date(),
  plan?: string
): ToolAuditResult {
  if (!tool || users <= 0 || spend < 0) {
    return {
      tool,
      status: "Optimized",
      recommendation: "Please provide valid input values.",
      currentSpend: Math.max(0, spend),
      optimizedSpend: Math.max(0, spend),
      savings: 0,
      optimizationScore: 100,
      currentPlan: "",
      recommendedPlan: "",
    };
  }

  // A genuine free plan ($0 spend) is a valid, already-optimized result — never
  // treated as an invalid/empty input. No negative savings and no meaningless
  // optimization is invented for it.
  if (spend === 0) {
    return {
      tool,
      status: "Optimized",
      recommendation: `${tool} is on a free plan at $0/month. There is no cost to optimize.`,
      currentSpend: 0,
      optimizedSpend: 0,
      savings: 0,
      optimizationScore: 100,
      currentPlan: "Free",
      recommendedPlan: "",
    };
  }

  // Usage-based API products are not fixed per-seat subscriptions and cannot be
  // "downgraded" to an estimated fixed price. Never fabricate savings; explain
  // that real savings require usage/cost data.
  if (API_TOOLS.has(tool)) {
    return {
      tool,
      status: "Optimized",
      recommendation: `${tool} is billed on usage (pay-as-you-go). Savings can only be estimated from actual usage/cost data — they are not fabricated from published monthly list prices here.`,
      currentSpend: spend,
      optimizedSpend: spend,
      savings: 0,
      optimizationScore: 100,
      currentPlan: "",
      recommendedPlan: "",
    };
  }

  const optimal = calculateOptimalPlan(tool, spend, users, date, plan);
  const savings = optimal?.savings ?? 0;
  const optimizationScore = calculateOptimizationScore(savings, spend);

  let status: AuditStatus = "Optimized";
  if (savings > 20) status = "Overpaying";
  else if (savings > 5) status = "Optimization Available";

  const recommendation = generateRecommendation(tool, spend, users, optimal);

  return {
    tool,
    status,
    recommendation,
    currentSpend: spend,
    optimizedSpend: Math.max(0, spend - savings),
    savings,
    optimizationScore,
    currentPlan: optimal?.currentPlan.name ?? "",
    recommendedPlan: optimal?.replacement?.name ?? "",
  };
}

/**
 * Generate audit for single tool (backward compatible)
 *
 * @param date optional audit date; defaults to now. Pricing valid at `date` is
 *   used so historical audits reuse the pricing that applied then.
 */
export function generateAudit(
  tool: string,
  spend: number,
  users: number,
  date: Date = new Date(),
  plan?: string
): ToolAuditResult {
  return auditSingleTool(tool, spend, users, date, plan);
}

/**
 * Generate aggregate audit for multiple tools
 *
 * @param date optional audit date; defaults to now.
 * @param plan optional user-selected plan; when present in the active surface
 *   (and satisfying its seat minimum) it is used as the current tier instead of
 *   the spend-per-seat estimate, so e.g. a custom Cursor Enterprise tier
 *   displays as "Enterprise" rather than a misdetected list-price plan.
 */
export function generateAggregateAudit(
  tools: Array<{ tool: string; spend: number; users: number; plan?: string }>,
  date: Date = new Date()
): AggregateAuditResult {
  // Drop only entries with a missing tool or no seats. Zero-spend free plans are
  // valid and must surface as an (already optimized) $0 tool rather than being
  // silently dropped; negative spend is handled as invalid inside auditSingleTool.
  const validTools = tools.filter((t) => t.tool && t.users > 0);

  if (validTools.length === 0) {
    // Distinguish "no tools at all" from "tools present but missing seats" so
    // the empty state never lies about why nothing was audited.
    const hasToolWithoutSeats = tools.some((t) => t.tool && !(t.users > 0));
    const summary = hasToolWithoutSeats
      ? "The audit could not run because one or more tools are missing seats. Enter at least one seat per tool to continue."
      : "No tools provided. Please add at least one AI tool to begin your audit.";
    return {
      tools: [],
      totalCurrentSpend: 0,
      totalOptimizedSpend: 0,
      totalSavings: 0,
      totalAnnualSavings: 0,
      overallOptimizationScore: 100,
      priorityRecommendations: [],
      summary,
      savingsRate: 0,
      teamEfficiencyScore: 100,
      enhancedRecommendations: [],
    };
  }

  // Duplicate entries for the same product would be audited independently and
  // inflate savings: ChatGPT twice would claim a Free downgrade on BOTH. The
  // same product is one subscription surface, so duplicate rows are merged
  // into a single audited tool (spend and seats are summed; the first row's
  // explicit plan wins when present). This is the only place deduping lives —
  // the persisted Audit row then matches exactly what the engine audited.
  const deduped = validTools.reduce<
    Record<string, { tool: string; spend: number; users: number; plan?: string }>
  >((acc, t) => {
    const existing = acc[t.tool];
    if (existing) {
      existing.spend += t.spend;
      existing.users += t.users;
    } else {
      acc[t.tool] = { tool: t.tool, spend: t.spend, users: t.users, plan: t.plan };
    }
    return acc;
  }, {});
  const mergedTools = Object.values(deduped);

  const toolResults = mergedTools.map((t) =>
    auditSingleTool(t.tool, t.spend, t.users, date, t.plan)
  );

  const totalCurrentSpend = toolResults.reduce((sum, t) => sum + t.currentSpend, 0);
  const totalOptimizedSpend = toolResults.reduce(
    (sum, t) => sum + t.optimizedSpend,
    0
  );
  const totalSavings = totalCurrentSpend - totalOptimizedSpend;
  const overallOptimizationScore = calculateOptimizationScore(
    totalSavings,
    totalCurrentSpend
  );

  // Generate priority recommendations
  const priorityRecommendations = toolResults
    .filter((t) => t.status !== "Optimized")
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 3)
    .map((t) => `${t.tool}: ${t.recommendation}`);

  // Count overpaying tools
  const overpayingCount = toolResults.filter(
    (t) => t.status === "Overpaying"
  ).length;

  // Generate executive summary
  const summary = generateExecutiveSummary(
    toolResults.length,
    overallOptimizationScore,
    totalSavings,
    totalSavings * 12,
    totalCurrentSpend,
    overpayingCount
  );

  // Savings Rate: monthly savings / current monthly spend * 100 (compare like
  // to like; never call a subscription cost reduction an "ROI").
  const savingsRate = totalCurrentSpend > 0
    ? Math.round((totalSavings / totalCurrentSpend) * 100)
    : 0;

  // Team efficiency score (only fully-Optimized tools count)
  const optimizedCount = toolResults.filter(
    (t) => t.status === "Optimized"
  ).length;
  const teamEfficiencyScore = toolResults.length > 0
    ? Math.round((optimizedCount / toolResults.length) * 100)
    : 100;

  // Enhanced structured recommendations
  const enhancedRecommendations: EnhancedRecommendation[] = toolResults
    .filter((t) => t.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .map((t) => ({
      tool: t.tool,
      priority: t.savings > 50 ? "high" : t.savings > 20 ? "medium" : "low",
      severity: t.savings >= 50 ? "critical" : t.savings >= 20 ? "moderate" : "minor",
      impact: t.savings,
      action: t.recommendation,
      currentPlan: t.currentPlan || "Current",
      recommendedPlan: t.recommendedPlan || "Optimized",
    }));

  return {
    tools: toolResults,
    totalCurrentSpend,
    totalOptimizedSpend,
    totalSavings,
    totalAnnualSavings: totalSavings * 12,
    overallOptimizationScore,
    priorityRecommendations,
    summary,
    savingsRate,
    teamEfficiencyScore,
    enhancedRecommendations,
  };
}