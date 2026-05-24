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

export interface ToolAuditResult {
  tool: string;
  status: AuditStatus;
  recommendation: string;
  currentSpend: number;
  optimizedSpend: number;
  savings: number;
  optimizationScore: number;
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
  roiEstimate: number;
  teamEfficiencyScore: number;
  enhancedRecommendations: EnhancedRecommendation[];
}

// Tool Pricing Configuration
const TOOL_CONFIGS: Record<string, ToolConfig> = {
  ChatGPT: {
    category: "SaaS",
    plans: [
      { name: "Free", costPerUser: 0 },
      { name: "Plus", costPerUser: 20 },
      { name: "Team", costPerUser: 30, minUsers: 2 },
      { name: "Enterprise", costPerUser: 50, minUsers: 10 },
      { name: "API", costPerUser: 0 },
    ],
  },
  Claude: {
    category: "SaaS",
    plans: [
      { name: "Free", costPerUser: 0 },
      { name: "Pro", costPerUser: 20 },
      { name: "Max", costPerUser: 20 },
      { name: "Team", costPerUser: 25, minUsers: 2 },
      { name: "Enterprise", costPerUser: 45, minUsers: 10 },
      { name: "API", costPerUser: 0 },
    ],
  },
  Cursor: {
    category: "SaaS",
    plans: [
      { name: "Hobby", costPerUser: 0 },
      { name: "Pro", costPerUser: 20 },
      { name: "Business", costPerUser: 40, minUsers: 3 },
      { name: "Enterprise", costPerUser: 60, minUsers: 10 },
    ],
  },
  Copilot: {
    category: "SaaS",
    plans: [
      { name: "Individual", costPerUser: 20 },
      { name: "Business", costPerUser: 15, minUsers: 5 },
      { name: "Enterprise", costPerUser: 25, minUsers: 20 },
    ],
  },
  Gemini: {
    category: "SaaS",
    plans: [
      { name: "Free", costPerUser: 0 },
      { name: "Pro", costPerUser: 20 },
      { name: "Ultra", costPerUser: 20 },
      { name: "API", costPerUser: 0 },
    ],
  },
  "OpenAI API": {
    category: "API",
    plans: [{ name: "Pay-as-you-go", costPerUser: 0 }],
  },
  "Anthropic API": {
    category: "API",
    plans: [{ name: "Pay-as-you-go", costPerUser: 0 }],
  },
  Windsurf: {
    category: "SaaS",
    plans: [
      { name: "Hobby", costPerUser: 0 },
      { name: "Pro", costPerUser: 20 },
      { name: "Business", costPerUser: 40, minUsers: 3 },
      { name: "Enterprise", costPerUser: 60, minUsers: 10 },
    ],
  },
};

/**
 * Calculate the optimal plan and estimated cost for a given tool
 */
function calculateOptimalPlan(
  tool: string,
  spend: number,
  users: number
): { plan: string; estimatedCost: number; savings: number } | null {
  const config = TOOL_CONFIGS[tool];
  if (!config) return null;

  if (config.category === "SaaS") {
    const validPlans = config.plans.filter(
      (plan) => !plan.minUsers || plan.minUsers <= users
    );

    if (validPlans.length === 0) return null;

    const bestPlan = validPlans.reduce((best, current) =>
      current.costPerUser * users < best.costPerUser * users ? current : best
    );

    const estimatedCost = bestPlan.costPerUser * users;
    const savings = Math.max(0, spend - estimatedCost);

    return { plan: bestPlan.name, estimatedCost, savings };
  }

  if (config.category === "API" && spend > 100) {
    const potentialSavings = Math.floor(spend * 0.15);
    return {
      plan: "Volume Pricing",
      estimatedCost: spend - potentialSavings,
      savings: potentialSavings,
    };
  }

  return null;
}

/**
 * Generate recommendation based on tool and usage patterns
 */
function generateRecommendation(
  tool: string,
  spend: number,
  users: number,
  savings: number
): string {
  if (savings === 0) {
    return `Your ${tool} setup appears well-optimized for ${users} user${users > 1 ? "s" : ""} at $${spend}/mo.`;
  }

  const optimal = calculateOptimalPlan(tool, spend, users);
  if (!optimal) return "";

  if (tool === "ChatGPT" || tool === "Claude" || tool === "Cursor") {
    if (spend > 80 && users < 3) {
      return `Downgrade to a lower tier or free plan. Current spend: $${spend}/mo → Recommended: $${optimal.estimatedCost}/mo ($${savings}/mo savings).`;
    }
    if (spend > 150 && users >= 10) {
      return `Consider negotiating an Enterprise plan with volume discounts. Potential savings: $${savings}/mo.`;
    }
  }

  if (tool === "OpenAI API" || tool === "Anthropic API") {
    return `Optimize API usage with volume pricing or reserved credits. Potential savings: $${savings}/mo through efficient usage patterns.`;
  }

  return `Switch to ${optimal.plan} plan. Estimated savings: $${savings}/mo.`;
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
  users: number
): ToolAuditResult {
  if (!tool || spend <= 0 || users <= 0) {
    return {
      tool,
      status: "Optimized",
      recommendation: "Please provide valid input values.",
      currentSpend: spend,
      optimizedSpend: spend,
      savings: 0,
      optimizationScore: 100,
    };
  }

  const optimal = calculateOptimalPlan(tool, spend, users);
  const savings = optimal?.savings ?? 0;
  const optimizationScore = calculateOptimizationScore(savings, spend);

  let status: AuditStatus = "Optimized";
  if (savings > 20) status = "Overpaying";
  else if (savings > 5) status = "Optimization Available";

  const recommendation = generateRecommendation(tool, spend, users, savings);

  return {
    tool,
    status,
    recommendation,
    currentSpend: spend,
    optimizedSpend: Math.max(0, spend - savings),
    savings,
    optimizationScore,
  };
}

/**
 * Generate audit for single tool (backward compatible)
 */
export function generateAudit(
  tool: string,
  spend: number,
  users: number
): ToolAuditResult {
  return auditSingleTool(tool, spend, users);
}

/**
 * Generate aggregate audit for multiple tools
 */
export function generateAggregateAudit(
  tools: Array<{ tool: string; spend: number; users: number }>
): AggregateAuditResult {
  const validTools = tools.filter((t) => t.tool && t.spend > 0 && t.users > 0);

  if (validTools.length === 0) {
    return {
      tools: [],
      totalCurrentSpend: 0,
      totalOptimizedSpend: 0,
      totalSavings: 0,
      totalAnnualSavings: 0,
      overallOptimizationScore: 100,
      priorityRecommendations: [],
      summary: "No tools provided. Please add at least one AI tool to begin your audit.",
      roiEstimate: 0,
      teamEfficiencyScore: 100,
      enhancedRecommendations: [],
    };
  }

  const toolResults = validTools.map((t) =>
    auditSingleTool(t.tool, t.spend, t.users)
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

  // ROI estimate
  const roiEstimate = totalCurrentSpend > 0
    ? Math.round((totalSavings * 12 / totalCurrentSpend) * 100)
    : 0;

  // Team efficiency score (weighted by spend)
  const optimizedCount = toolResults.filter(
    (t) => t.status !== "Overpaying"
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
      currentPlan: "Current",
      recommendedPlan: "Optimized",
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
    roiEstimate,
    teamEfficiencyScore,
    enhancedRecommendations,
  };
}