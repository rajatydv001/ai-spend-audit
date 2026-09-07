import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/dal";
import { getUserEntitlements } from "@/lib/services/entitlements";
import { withErrorHandling } from "@/lib/errors";

/**
 * Server-derived entitlement summary for the authenticated user. Used by client
 * components to render locked/upgrade states and remaining limits. The client
 * can never seed this: plan, features, and counters are all computed here from
 * the verified subscription state.
 */
export const GET = withErrorHandling(async () => {
  const userId = await requireUserId();
  const entitlements = await getUserEntitlements(userId);

  return NextResponse.json({
    plan: entitlements.plan,
    status: entitlements.status,
    features: entitlements.features,
    audit: {
      limit: entitlements.auditLimit,
      used: entitlements.auditCount,
      remaining: entitlements.auditRemaining,
    },
    export: {
      limit: entitlements.exportLimit,
      used: entitlements.exportCount,
      remaining: entitlements.exportRemaining,
    },
  });
});
export const runtime = "nodejs";
