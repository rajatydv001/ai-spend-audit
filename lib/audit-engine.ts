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

interface OptimalPlan {
  currentPlan: ActiveToolPlan;
  cheapestEligible: ActiveToolPlan | null;
  estimatedCost: number;
  savings: number;
}

/**
 * Determine the current plan (the active tier whose per-seat list price is
 * closest to the reported spend-per-seat) and the best ELIGIBLE downgrade.
 *
 * Eligibility is segment-aware (see `isReplacementValid`): cheapest is NOT
 * automatically the right answer. A strictly-cheaper replacement is only
 * offered when it addresses an equal-or-lower customer segment and does not
 * illegally cross an organization/consumer or power/free boundary. If no
 * eligible lower-cost replacement exists, savings is 0 and no plan is
 * recommended (we never claim 100% savings via a forbidden downgrade).
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

  // Custom + usage plans have no fixed price — exclude from pricing optimization.
  const priced = surface.filter((p) => !p.custom && !p.usageBased);
  const validPlans = priced.filter(
    (plan) => !plan.minUsers || plan.minUsers <= users
  );

  if (validPlans.length === 0) return null;

  const costPerSeat = users > 0 ? spend / users : 0;
  const detected = validPlans.reduce((closest, candidate) => {
    const diff = Math.abs(candidate.costPerUser - costPerSeat);
    const closestDiff = Math.abs(closest.costPerUser - costPerSeat);
    return diff < closestDiff ? candidate : closest;
  });

  // An explicitly selected plan is authoritative when it exists in the active
  // surface and satisfies its seat minimum; otherwise fall back to the
  // spend-per-seat estimate. Custom (contact-sales) plans are valid selections:
  // they are displayed as the current tier, but having no fixed price
  // (costPerUser 0) they can never produce a fabricated cheaper downgrade.
  const currentPlan = plan
    ? (surface.find(
        (p) => p.name === plan && (!p.minUsers || p.minUsers <= users)
      ) ?? detected)
    : detected;

  // Strictly-cheaper, segment-eligible replacements only.
  const eligible = validPlans
    .filter((p) => p.costPerUser < currentPlan.costPerUser)
    .filter((p) => isReplacementValid(p, currentPlan))
    .sort((a, b) => a.costPerUser - b.costPerUser);

  const cheapestEligible = eligible[0] ?? null;
  const estimatedCost = cheapestEligible
    ? cheapestEligible.costPerUser * users
    : spend;
  const savings = cheapestEligible
    ? Math.max(0, spend - estimatedCost)
    : 0;

  return { currentPlan, cheapestEligible, estimatedCost, savings };
}

/**
 * Generate recommendation based on tool and usage patterns.
 */
function generateRecommendation(
  tool: string,
  spend: number,
  users: number,
  savings: number,
  date: Date,
  plan?: string
): string {
  const optimal = calculateOptimalPlan(tool, spend, users, date, plan);

  if (savings === 0 || !optimal?.cheapestEligible) {
    if (!optimal) return "";
    const planName = optimal.currentPlan.name;
    if (optimal.currentPlan.custom) {
      return `No verified lower-cost replacement found for your ${tool} setup (${planName}) at ${users} user${users > 1 ? "s" : ""} / $${spend}/mo. ${planName} pricing is custom (contact-sales), so it cannot be compared to published monthly list prices here — ask your account team for a rate review.`;
    }
    return `No verified lower-cost replacement found for your ${tool} setup (${planName}) at ${users} user${users > 1 ? "s" : ""} / $${spend}/mo. Downgrading would require a plan that is not an eligible replacement (e.g. an organization tier dropping to a consumer tier) or a free plan that is not appropriate.`;
  }

  return `Switch to the ${optimal.cheapestEligible.name} plan. Estimated savings: $${savings}/mo ($${spend}/mo → $${optimal.estimatedCost}/mo).`;
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

  const recommendation = generateRecommendation(tool, spend, users, savings, date, plan);

  return {
    tool,
    status,
    recommendation,
    currentSpend: spend,
    optimizedSpend: Math.max(0, spend - savings),
    savings,
    optimizationScore,
    currentPlan: optimal?.currentPlan.name ?? "",
    recommendedPlan: optimal?.cheapestEligible?.name ?? "",
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