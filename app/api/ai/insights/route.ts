import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/dal";
import { requireUserOrg, requireRole } from "@/lib/auth/authorization";
import { assertFeature } from "@/lib/services/entitlements";
import { parseBody, withErrorHandling } from "@/lib/errors";
import { rateLimitOrThrow } from "@/lib/services/rate-limit";
import { aiInsightsSchema } from "@/lib/validation/schemas";
import { env } from "@/lib/env";
import {
  generateOptimizationInsights,
  generateExecutiveSummary,
  generateVendorConsolidationSuggestions,
  generateSavingsAnalysis,
} from "@/lib/services/ai-service";

export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  const user = await requireUserOrg(userId);
  const orgId = user.organizationId;
  await requireRole(userId, "ADMIN", "ANALYST");
  await assertFeature(userId, "ai");

  await rateLimitOrThrow(`ai:insights:${userId}`, 20, 60000);

  const { auditId, type } = await parseBody(request, aiInsightsSchema);

  const audit = await prisma.audit.findFirst({
    where: {
      id: auditId,
      OR: [{ userId }, ...(orgId ? [{ organizationId: orgId }] : [])],
    },
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
    case "savings":
      result = await generateSavingsAnalysis(auditData);
      break;
  }

  // Honest provenance: without an OpenAI key the generators return the
  // deterministic offline fallback, so the response flags that explicitly
  // rather than impersonating an LLM-generated result.
  const source = env.OPENAI_API_KEY ? "openai" : "generatedOffline";

  return NextResponse.json({ data: result, source });
});

export const runtime = "nodejs";
