import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  generateOptimizationInsights,
  generateExecutiveSummary,
  generateVendorConsolidationSuggestions,
  generateROIAnalysis,
} from "@/lib/services/ai-service";

export async function POST(request: Request) {
  const { auditId, type } = await request.json();
  if (!auditId || !type) {
    return NextResponse.json({ error: "auditId and type required" }, { status: 400 });
  }

  const audit = await prisma.audit.findFirst({
    where: { id: auditId },
    include: { tools: true },
  });
  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const auditData = {
    tools: audit.tools.map((t) => ({
      tool: t.name,
      status: t.status,
      currentSpend: t.currentSpend,
      optimizedSpend: t.optimizedSpend,
      savings: t.savings,
      recommendation: t.recommendation,
    })),
    totalCurrentSpend: audit.totalCurrentSpend,
    totalSavings: audit.totalSavings,
    overallOptimizationScore: audit.optimizationScore,
    summary: audit.summary,
  };

  let result: string | string[];

  switch (type) {
    case "insights":
      result = await generateOptimizationInsights(auditData);
      break;
    case "summary":
      result = await generateExecutiveSummary(auditData);
      break;
    case "vendor-consolidation":
      result = await generateVendorConsolidationSuggestions(auditData.tools);
      break;
    case "roi":
      result = await generateROIAnalysis(auditData);
      break;
    default:
      return NextResponse.json({ error: "Invalid insight type" }, { status: 400 });
  }

  return NextResponse.json({ data: result });
}
