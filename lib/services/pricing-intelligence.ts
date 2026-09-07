import { VENDOR_PRICING, getActiveToolPlans } from "@/lib/pricing/catalog";

/**
 * Pricing intelligence utilities.
 *
 * All pricing is read synchronously from the versioned, time-aware catalog
 * (the same source of truth the audit engine uses) instead of a second,
 * divergent hardcoded table — so the two can never drift. Prices resolve for a
 * given `date` (defaults to now) and are never invented: unknown plans yield
 * no match rather than a made-up number. Custom/usage pricing stays as-is and
 * is never converted into an estimated fixed number.
 */

interface PricingSurface {
  tool: string;
  plan: string;
  costPerUser: number;
  minUsers: number;
  category: "SaaS" | "API";
  /** Negotiated/custom contracts carry no public list price — never converted. */
  custom: boolean;
  /** Usage-metered plans have no fixed per-user cost — not comparable. */
  usageBased: boolean;
}

const CATEGORY: Record<string, "SaaS" | "API"> = {
  ChatGPT: "SaaS",
  Claude: "SaaS",
  Cursor: "SaaS",
  Copilot: "SaaS",
  Gemini: "SaaS",
  Windsurf: "SaaS",
  "OpenAI API": "API",
  "Anthropic API": "API",
  "ChatGPT API": "API",
  "Claude API": "API",
};

function activeSurface(date: Date = new Date()): PricingSurface[] {
  const products = new Set(VENDOR_PRICING.map((v) => v.product));
  const surface: PricingSurface[] = [];
  for (const product of products) {
    const plans = getActiveToolPlans(product, date);
    for (const p of plans) {
      surface.push({
        tool: product,
        plan: p.name,
        costPerUser: p.costPerUser,
        minUsers: p.minUsers ?? 1,
        category: CATEGORY[product] ?? "SaaS",
        custom: p.custom,
        usageBased: p.usageBased,
      });
    }
  }
  return surface;
}

export function getToolAlternatives(
  toolName: string,
  currentPlan: string,
  users: number,
  date: Date = new Date()
) {
  const db = activeSurface(date);
  const similarTools = db
    .filter((p) => p.tool !== toolName)
    .reduce<Record<string, { plan: string; monthlyCost: number | null; annualCost: number | null }[]>>((acc, p) => {
      if (!acc[p.tool]) acc[p.tool] = [];
      // Custom and usage-metered plans have no fixed public price, so a number
      // would be invented — they surface as null (not comparable) instead.
      const monthly = p.custom || p.usageBased ? null : p.costPerUser * Math.max(users, p.minUsers);
      acc[p.tool].push({
        plan: p.plan,
        monthlyCost: monthly,
        annualCost: monthly === null ? null : monthly * 12,
      });
      return acc;
    }, {});
  return similarTools;
}

export function estimateAnnualSpend(currentSpend: number, growthRate: number = 0.1) {
  const monthly = [];
  let spend = currentSpend;
  for (let i = 0; i < 12; i++) {
    monthly.push(Math.round(spend * 100) / 100);
    spend *= 1 + growthRate;
  }
  const total = monthly.reduce((s, m) => s + m, 0);
  return { monthly, total: Math.round(total * 100) / 100 };
}

export function detectRedundantSubscriptions(
  tools: Array<{ name: string; plan: string; spend: number; users: number }>
) {
  const redundant: Array<{
    tools: string[];
    reason: string;
    potentialSavings: number;
  }> = [];

  const categories = [
    { name: "General Chat", tools: ["ChatGPT", "Claude", "Gemini"] },
    { name: "Code Generation", tools: ["Cursor", "Copilot", "Windsurf"] },
  ];

  for (const category of categories) {
    const found = tools.filter((t) => category.tools.includes(t.name));
    if (found.length > 1) {
      const sorted = [...found].sort((a, b) => a.spend - b.spend);
      const redundantOnes = sorted.slice(1);
      const potentialSavings = redundantOnes.reduce((s, t) => s + t.spend, 0);
      redundant.push({
        tools: redundantOnes.map((t) => `${t.name} (${t.plan})`),
        reason: `Redundant ${category.name} AI tool — consider consolidating to one provider`,
        potentialSavings,
      });
    }
  }

  return redundant;
}

export function compareToolPricing(
  currentTool: string,
  currentPlan: string,
  users: number,
  date: Date = new Date()
) {
  const db = activeSurface(date);
  const current = db.find(
    (p) => p.tool === currentTool && p.plan === currentPlan
  );

  // A comparison is only meaningful when BOTH sides have a fixed, priced list
  // plan. When the current plan is unknown OR custom/usage-based, savings is
  // null — never a fabricated 0 ("free" is a claim, not a number).
  const currentComparable =
    current != null && !current.custom && !current.usageBased;
  const currentPrice =
    currentComparable && current
      ? current.costPerUser * Math.max(users, current.minUsers)
      : null;

  const alternatives = db
    .filter((p) => p.tool !== currentTool)
    .map((p) => {
      const altComparable = !p.custom && !p.usageBased;
      const altPrice = altComparable
        ? p.costPerUser * Math.max(users, p.minUsers)
        : null;
      return {
        tool: p.tool,
        plan: p.plan,
        monthlyCost: altPrice,
        annualCost: altPrice === null ? null : Math.round(altPrice * 12 * 100) / 100,
        savings:
          currentPrice !== null && altPrice !== null
            ? Math.round((currentPrice - altPrice) * 100) / 100
            : null,
        category: p.category,
      };
    })
    // Non-comparable rows (custom/usage alternatives) sort last, never above a
    // real dollar figure.
    .sort(
      (a, b) =>
        (b.savings ?? -Infinity) - (a.savings ?? -Infinity)
    );

  return { current, alternatives };
}