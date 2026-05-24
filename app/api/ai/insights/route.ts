import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  generateOptimizationInsights,
  generateExecutiveSummary,
  generateVendorConsolidationSuggestions,
  generateROIAnalysis,
} from "@/lib/services/ai-service";
import { getUserPlan } from "@/lib/services/subscription-service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!plan.aiRecommendations) {
    return NextResponse.json({ error: "AI recommendations require Pro plan or higher" }, { status: 403 });
  }

  const { auditId, type } = await request.json();
  if (!auditId || !type) {
    return NextResponse.json({ error: "auditId and type required" }, { status: 400 });
  }

  const audit = await prisma.audit.findFirst({
    where: { id: auditId, userId: session.user.id },
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

  let result: any;

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
