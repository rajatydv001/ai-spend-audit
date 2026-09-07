// Single source of truth for the plan names shown to users in UI dropdowns.
// The lists derive from the versioned, time-aware pricing catalog so they can
// never drift from what the audit engine actually optimizes against. They are
// ordered low→high by customer segment then by per-user price. Usage-based API
// products are not fixed per-seat plans, so they expose a single selection.
import {
  getActiveToolPlans,
  type ActiveToolPlan,
} from "@/lib/pricing/catalog";

const SEGMENT_ORDER: Record<string, number> = {
  free: 0,
  individual: 1,
  team: 2,
  business: 3,
  enterprise: 4,
};

function comparePlans(a: ActiveToolPlan, b: ActiveToolPlan): number {
  const segmentDiff =
    (SEGMENT_ORDER[a.segment] ?? 99) - (SEGMENT_ORDER[b.segment] ?? 99);
  if (segmentDiff !== 0) return segmentDiff;
  return a.costPerUser - b.costPerUser;
}

export function getToolPlanNames(tool: string, date: Date = new Date()): string[] {
  return getActiveToolPlans(tool, date)
    .sort(comparePlans)
    .map((p) => p.name);
}

export const TOOL_PLAN_NAMES: Record<string, string[]> = {
  ChatGPT: getToolPlanNames("ChatGPT"),
  Claude: getToolPlanNames("Claude"),
  Cursor: getToolPlanNames("Cursor"),
  Copilot: getToolPlanNames("Copilot"),
  Gemini: getToolPlanNames("Gemini"),
  Windsurf: getToolPlanNames("Windsurf"),
  "OpenAI API": ["Pay-as-you-go"],
  "Anthropic API": ["Pay-as-you-go"],
};