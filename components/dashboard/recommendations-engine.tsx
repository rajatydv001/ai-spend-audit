"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import Badge from "@/components/ui/badge";

interface RecommendationsEngineProps {
  result: AggregateAuditResult;
}

function getPriority(tool: { status: string; savings: number }): { level: "high" | "medium" | "low"; badge: "error" | "warning" | "info" } {
  if (tool.status === "Overpaying") return { level: "high", badge: "error" };
  if (tool.status === "Optimization Available") return { level: "medium", badge: "warning" };
  return { level: "low", badge: "info" };
}

function getSeverity(savings: number): { label: string; badge: "error" | "warning" | "neutral" } {
  if (savings >= 50) return { label: "Critical", badge: "error" };
  if (savings >= 20) return { label: "High", badge: "warning" };
  if (savings >= 5) return { label: "Moderate", badge: "warning" };
  return { label: "Low", badge: "neutral" };
}

function getImpactLabel(savings: number): string {
  if (savings >= 100) return "Very High Impact";
  if (savings >= 50) return "High Impact";
  if (savings >= 20) return "Medium Impact";
  if (savings >= 5) return "Low Impact";
  return "Minimal Impact";
}

export default function RecommendationsEngine({ result }: RecommendationsEngineProps) {
  const sortedTools = [...result.tools].sort((a, b) => b.savings - a.savings);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Top Priority Recommendations */}
      <motion.div variants={staggerItem} className="mb-8">
        <h3 className="text-xl font-bold text-white mb-1">Priority Actions</h3>
        <p className="text-sm text-gray-400 mb-6">Ordered by highest savings impact</p>

        {result.priorityRecommendations.length > 0 ? (
          <div className="space-y-4">
            {result.priorityRecommendations.map((rec, idx) => {
              const tool = sortedTools[idx];
              const priority = tool ? getPriority(tool) : { level: "medium" as const, badge: "warning" as const };
              const severity = tool ? getSeverity(tool.savings) : { label: "Moderate", badge: "warning" as const };

              return (
                <motion.div
                  key={idx}
                  variants={staggerItem}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-black/40 p-6 backdrop-blur-xl transition hover:border-white/20"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent opacity-0 transition group-hover:opacity-100" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
                          <span className="text-xs font-bold text-blue-300">{idx + 1}</span>
                        </div>
                        <Badge variant={priority.badge}>
                          {priority.level === "high" ? "High Priority" : priority.level === "medium" ? "Medium Priority" : "Low Priority"}
                        </Badge>
                        <Badge variant={severity.badge}>
                          {severity.label} Severity
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-200 leading-relaxed">{rec}</p>
                    </div>
                    {tool && tool.savings > 0 && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-2xl font-bold text-green-400">${tool.savings}</span>
                        <span className="text-xs text-gray-400">/mo savings</span>
                        <span className="mt-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-300">
                          {getImpactLabel(tool.savings)}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-8 text-center">
            <p className="text-green-300 font-medium">Your AI stack is fully optimized — no priority actions needed.</p>
          </div>
        )}
      </motion.div>

      {/* Detailed Tool Analysis */}
      <motion.div variants={staggerItem}>
        <h3 className="text-xl font-bold text-white mb-1">Detailed Tool Analysis</h3>
        <p className="text-sm text-gray-400 mb-6">Per-tool optimization status and recommendations</p>

        <div className="grid gap-4">
          {sortedTools.map((tool, idx) => {
            const priority = getPriority(tool);
            const severity = getSeverity(tool.savings);

            return (
              <motion.div
                key={idx}
                variants={staggerItem}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-black/40 p-6 backdrop-blur-xl transition hover:border-white/20"
              >
                <div className="relative space-y-4">
                  {/* Header */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-semibold text-white">{tool.tool}</h4>
                      <Badge variant={tool.status === "Overpaying" ? "error" : tool.status === "Optimization Available" ? "warning" : "success"}>
                        {tool.status}
                      </Badge>
                    </div>
                    {tool.savings > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge variant={priority.badge}>
                          {priority.level === "high" ? "High" : priority.level === "medium" ? "Medium" : "Low"} Priority
                        </Badge>
                        <Badge variant={severity.badge}>{severity.label}</Badge>
                      </div>
                    )}
                  </div>

                  {/* Spend Comparison */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Current</p>
                      <p className="mt-2 text-2xl font-bold text-white">
                        ${tool.currentSpend}
                        <span className="text-xs text-gray-400 font-normal">/mo</span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3">
                      <p className="text-xs text-green-300 uppercase tracking-wider">Optimized</p>
                      <p className="mt-2 text-2xl font-bold text-green-400">
                        ${tool.optimizedSpend}
                        <span className="text-xs text-green-300 font-normal">/mo</span>
                      </p>
                    </div>
                  </div>

                  {/* Savings if any */}
                  {tool.savings > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                      <span className="text-lg">💡</span>
                      <p className="text-sm text-emerald-200">
                        Potential savings: <span className="font-bold">${tool.savings}/mo</span> ({getImpactLabel(tool.savings)})
                      </p>
                    </div>
                  )}

                  {/* Actionable Step */}
                  <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4">
                    <p className="text-xs text-blue-300 uppercase tracking-wider font-semibold mb-1">Recommended Action</p>
                    <p className="text-sm text-blue-100 leading-relaxed">{tool.recommendation}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
