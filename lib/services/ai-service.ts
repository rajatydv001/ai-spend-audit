import { env } from "@/lib/env";

let openaiClient: any = null;

async function getOpenAI() {
  if (!env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    const { default: OpenAI } = await import("openai");
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

interface AuditData {
  tools: Array<{
    tool: string;
    status: string;
    currentSpend: number;
    optimizedSpend: number;
    savings: number;
    recommendation: string;
  }>;
  totalCurrentSpend: number;
  totalSavings: number;
  overallOptimizationScore: number;
  summary: string;
}

export async function generateOptimizationInsights(
  auditData: AuditData
): Promise<string[]> {
  const openai = await getOpenAI();
  if (!openai) return getFallbackInsights(auditData);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an AI cost optimization expert. Analyze the audit data and provide actionable insights. Return exactly 3-5 concise bullet points.",
        },
        {
          role: "user",
          content: JSON.stringify({
            tools: auditData.tools,
            totalSpend: auditData.totalCurrentSpend,
            totalSavings: auditData.totalSavings,
            score: auditData.overallOptimizationScore,
          }),
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    return content
      .split("\n")
      .filter((l: string) => l.trim().startsWith("-") || l.trim().startsWith("*"))
      .map((l: string) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  } catch {
    return getFallbackInsights(auditData);
  }
}

export async function generateExecutiveSummary(auditData: AuditData): Promise<string> {
  const openai = await getOpenAI();
  if (!openai) return auditData.summary;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a financial analyst. Write a professional executive summary (2-3 paragraphs) of the AI spend audit results.",
        },
        {
          role: "user",
          content: JSON.stringify(auditData),
        },
      ],
      max_tokens: 500,
      temperature: 0.5,
    });

    return response.choices[0]?.message?.content || auditData.summary;
  } catch {
    return auditData.summary;
  }
}

export async function generateVendorConsolidationSuggestions(
  tools: AuditData["tools"]
): Promise<string[]> {
  const openai = await getOpenAI();
  if (!openai) return ["Evaluate overlapping AI tool subscriptions for consolidation opportunities."];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a procurement strategist. Analyze the list of AI tools and suggest vendor consolidation strategies. Return 2-3 specific suggestions.",
        },
        {
          role: "user",
          content: JSON.stringify(tools.map((t) => ({ name: t.tool, spend: t.currentSpend, status: t.status }))),
        },
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    return content
      .split("\n")
      .filter((l: string) => l.trim().startsWith("-") || l.trim().startsWith("*") || /^\d+\./.test(l.trim()))
      .map((l: string) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean);
  } catch {
    return ["Evaluate overlapping AI tool subscriptions for consolidation opportunities."];
  }
}

export async function generateROIAnalysis(auditData: AuditData): Promise<string> {
  const openai = await getOpenAI();
  if (!openai) {
    const annualSavings = auditData.totalSavings * 12;
    const roi = auditData.totalCurrentSpend > 0
      ? ((annualSavings / auditData.totalCurrentSpend) * 100).toFixed(1)
      : "N/A";
    return `Based on your current spend of $${auditData.totalCurrentSpend.toLocaleString()}/month, optimizing could save $${auditData.totalSavings.toLocaleString()}/month ($${annualSavings.toLocaleString()}/year). Your estimated ROI is ${roi}%.`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a financial analyst. Write a detailed ROI analysis paragraph based on the audit data.",
        },
        {
          role: "user",
          content: JSON.stringify(auditData),
        },
      ],
      max_tokens: 300,
      temperature: 0.5,
    });

    return response.choices[0]?.message?.content || "";
  } catch {
    return `ROI analysis available with OpenAI API key configured.`;
  }
}

function getFallbackInsights(auditData: AuditData): string[] {
  const insights: string[] = [];
  const overpaying = auditData.tools.filter((t) => t.status === "Overpaying");

  if (overpaying.length > 0) {
    insights.push(
      `${overpaying.length} tool${overpaying.length > 1 ? "s are" : " is"} overpaying — review plan downgrades to save $${overpaying.reduce((s, t) => s + t.savings, 0).toLocaleString()}/month.`
    );
  }

  if (auditData.overallOptimizationScore < 50) {
    insights.push("Your overall optimization score is low. Consider consolidating redundant subscriptions.");
  }

  if (auditData.totalSavings > 1000) {
    insights.push(`Annual savings potential of $${(auditData.totalSavings * 12).toLocaleString()} — prioritize a full optimization review.`);
  }

  insights.push("Schedule monthly audits to track savings and identify new optimization opportunities.");
  return insights;
}
