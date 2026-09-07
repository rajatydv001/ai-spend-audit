import type { SubscriptionPlan } from "@prisma/client";

export interface PlanConfig {
  auditLimit: number;
  exportLimit: number;
  aiRecommendations: boolean;
  teamCollaboration: boolean;
  analytics: boolean;
}

export const AUDIT_LIMIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The single source of truth for plan entitlements. Values are derived from
 * the product plan (see billing-plans.tsx / PRICING_DATA.md): Free is 5 audits
 * per month and 3 PDF exports; Pro expands both and enables AI insights and
 * advanced analytics; Enterprise is unlimited. Nothing here is client-derived.
 */
export const PLAN_CONFIG: Record<SubscriptionPlan, PlanConfig> = {
  FREE: {
    auditLimit: 5,
    exportLimit: 3,
    aiRecommendations: false,
    teamCollaboration: false,
    analytics: false,
  },
  PRO: {
    auditLimit: 50,
    exportLimit: 100,
    aiRecommendations: true,
    teamCollaboration: true,
    analytics: true,
  },
  ENTERPRISE: {
    auditLimit: 999999,
    exportLimit: 999999,
    aiRecommendations: true,
    teamCollaboration: true,
    analytics: true,
  },
};