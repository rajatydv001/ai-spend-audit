interface PricingData {
  tool: string;
  plan: string;
  costPerUser: number;
  minUsers: number;
  category: "SaaS" | "API";
}

const PRICING_DB: PricingData[] = [
  { tool: "ChatGPT", plan: "Free", costPerUser: 0, minUsers: 1, category: "SaaS" },
  { tool: "ChatGPT", plan: "Plus", costPerUser: 20, minUsers: 1, category: "SaaS" },
  { tool: "ChatGPT", plan: "Team", costPerUser: 30, minUsers: 2, category: "SaaS" },
  { tool: "ChatGPT", plan: "Enterprise", costPerUser: 50, minUsers: 10, category: "SaaS" },
  { tool: "Claude", plan: "Free", costPerUser: 0, minUsers: 1, category: "SaaS" },
  { tool: "Claude", plan: "Pro", costPerUser: 20, minUsers: 1, category: "SaaS" },
  { tool: "Claude", plan: "Max", costPerUser: 100, minUsers: 1, category: "SaaS" },
  { tool: "Claude", plan: "Team", costPerUser: 30, minUsers: 2, category: "SaaS" },
  { tool: "Claude", plan: "Enterprise", costPerUser: 60, minUsers: 10, category: "SaaS" },
  { tool: "Cursor", plan: "Hobby", costPerUser: 0, minUsers: 1, category: "SaaS" },
  { tool: "Cursor", plan: "Pro", costPerUser: 20, minUsers: 1, category: "SaaS" },
  { tool: "Cursor", plan: "Business", costPerUser: 40, minUsers: 2, category: "SaaS" },
  { tool: "Cursor", plan: "Enterprise", costPerUser: 80, minUsers: 10, category: "SaaS" },
  { tool: "Copilot", plan: "Individual", costPerUser: 10, minUsers: 1, category: "SaaS" },
  { tool: "Copilot", plan: "Business", costPerUser: 30, minUsers: 1, category: "SaaS" },
  { tool: "Copilot", plan: "Enterprise", costPerUser: 50, minUsers: 10, category: "SaaS" },
  { tool: "Gemini", plan: "Pro", costPerUser: 0, minUsers: 1, category: "SaaS" },
  { tool: "Gemini", plan: "Ultra", costPerUser: 30, minUsers: 1, category: "SaaS" },
  { tool: "Windsurf", plan: "Hobby", costPerUser: 0, minUsers: 1, category: "SaaS" },
  { tool: "Windsurf", plan: "Pro", costPerUser: 15, minUsers: 1, category: "SaaS" },
  { tool: "Windsurf", plan: "Business", costPerUser: 35, minUsers: 2, category: "SaaS" },
  { tool: "Windsurf", plan: "Enterprise", costPerUser: 75, minUsers: 10, category: "SaaS" },
];

export function getToolAlternatives(toolName: string, currentPlan: string, users: number) {
  const similarTools = PRICING_DB
    .filter((p) => p.tool !== toolName)
    .reduce<Record<string, { plan: string; monthlyCost: number; annualCost: number }[]>>((acc, p) => {
      if (!acc[p.tool]) acc[p.tool] = [];
      acc[p.tool].push({
        plan: p.plan,
        monthlyCost: p.costPerUser * Math.max(users, p.minUsers),
        annualCost: p.costPerUser * Math.max(users, p.minUsers) * 12,
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
  users: number
) {
  const current = PRICING_DB.find(
    (p) => p.tool === currentTool && p.plan === currentPlan
  );

  const alternatives = PRICING_DB
    .filter((p) => p.tool !== currentTool)
    .map((p) => ({
      tool: p.tool,
      plan: p.plan,
      monthlyCost: p.costPerUser * Math.max(users, p.minUsers),
      annualCost: p.costPerUser * Math.max(users, p.minUsers) * 12,
      savings: current
        ? Math.round((current.costPerUser * Math.max(users, current.minUsers) - p.costPerUser * Math.max(users, p.minUsers)) * 100) / 100
        : 0,
      category: p.category,
    }))
    .sort((a, b) => b.savings - a.savings);

  return { current, alternatives };
}
