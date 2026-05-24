"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import Charts from "@/components/charts";
import Badge from "@/components/ui/badge";

interface AuditResultsProps {
  result: AggregateAuditResult;
}

export default function AuditResults({ result }: AuditResultsProps) {
  const overpayingCount = result.tools.filter((t) => t.status === "Overpaying").length;
  const optimizationCount = result.tools.filter(
    (t) => t.status === "Optimization Available"
  ).length;

  return (
    <motion.div
      key="audit-results"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-12 space-y-8"
    >
      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-2xl font-bold text-white">
          Your AI Spend Analysis
        </h3>
        <p className="text-gray-400">
          {result.tools.length} tool{result.tools.length !== 1 ? "s" : ""} analyzed
          {overpayingCount > 0 && (
            <> • <span className="text-red-400">{overpayingCount} overpaying</span></>
          )}
          {optimizationCount > 0 && (
            <> • <span className="text-amber-400">{optimizationCount} can be optimized</span></>
          )}
        </p>
      </div>

      {/* Premium Summary Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-black/40 p-6 backdrop-blur-xl transition hover:border-blue-500/30 hover:from-blue-500/15">
          <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-300/80 uppercase tracking-widest">Optimization Score</p>
              <div className="text-2xl">📊</div>
            </div>
            <div className="mt-4">
              <p className="text-4xl font-bold text-white">
                {Math.round(result.overallOptimizationScore)}
                <span className="text-xl text-gray-400 font-normal">/100</span>
              </p>
              <div className="mt-3 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600" style={{ width: `${result.overallOptimizationScore}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-green-500/10 to-black/40 p-6 backdrop-blur-xl transition hover:border-green-500/30 hover:from-green-500/15">
          <div className="absolute inset-0 bg-gradient-to-t from-green-500/5 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-green-300/80 uppercase tracking-widest">Monthly Savings</p>
              <div className="text-2xl">💰</div>
            </div>
            <div className="mt-4">
              <p className="text-4xl font-bold text-green-400">
                ${result.totalSavings}
                <span className="text-xl text-gray-400 font-normal">/mo</span>
              </p>
              {result.totalSavings > 0 && (
                <p className="mt-2 text-xs text-green-300/80">
                  {((result.totalSavings / result.totalCurrentSpend) * 100).toFixed(1)}% reduction
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-black/40 p-6 backdrop-blur-xl transition hover:border-emerald-500/30 hover:from-emerald-500/15">
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-300/80 uppercase tracking-widest">Annual Savings</p>
              <div className="text-2xl">📈</div>
            </div>
            <div className="mt-4">
              <p className="text-4xl font-bold text-emerald-400">${result.totalAnnualSavings}</p>
              <p className="mt-2 text-xs text-emerald-300/80">{result.roiEstimate}% ROI</p>
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 to-black/40 p-6 backdrop-blur-xl transition hover:border-purple-500/30 hover:from-purple-500/15">
          <div className="absolute inset-0 bg-gradient-to-t from-purple-500/5 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-purple-300/80 uppercase tracking-widest">Current Spend</p>
              <div className="text-2xl">💵</div>
            </div>
            <div className="mt-4">
              <p className="text-4xl font-bold text-purple-300">
                ${result.totalCurrentSpend}
                <span className="text-xl text-gray-400 font-normal">/mo</span>
              </p>
              <p className="mt-2 text-xs text-purple-300/80">Total monthly investment</p>
            </div>
          </div>
        </div>
      </div>

      {/* Priority Recommendations */}
      {result.priorityRecommendations.length > 0 && (
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-white/3 to-black/40 p-8 backdrop-blur-xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="text-2xl">🎯</div>
            <div>
              <h3 className="text-xl font-bold text-white">Top Recommendations</h3>
              <p className="text-sm text-gray-400">Highest-impact changes to implement</p>
            </div>
          </div>
          <div className="space-y-3">
            {result.priorityRecommendations.map((rec, idx) => {
              const tool = result.tools[idx];
              return (
                <div key={idx} className="flex gap-4 rounded-xl bg-white/5 border border-white/5 p-4 hover:border-white/10 transition">
                  <div className="flex-shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
                      <span className="text-xs font-bold text-blue-300">{idx + 1}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-300 leading-relaxed">{rec}</p>
                  </div>
                  {tool && tool.savings > 0 && (
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-bold text-green-400">${tool.savings}<span className="text-xs text-gray-400 font-normal">/mo</span></p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detailed Tool Analysis */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white">Detailed Tool Analysis</h3>
          <p className="mt-1 text-sm text-gray-400">Per-tool recommendations and potential savings</p>
        </div>
        <div className="grid gap-4">
          {result.tools.map((tool, index) => (
            <div key={index} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-black/40 p-6 backdrop-blur-xl transition hover:border-white/20">
              <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="relative space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="text-lg font-semibold text-white">{tool.tool}</h4>
                      <Badge
                        variant={tool.status === "Overpaying" ? "error" : tool.status === "Optimization Available" ? "warning" : "success"}
                      >
                        {tool.status}
                      </Badge>
                    </div>
                  </div>
                  {tool.savings > 0 && (
                    <div className="text-right">
                      <p className="text-3xl font-bold text-green-400">${tool.savings}</p>
                      <p className="text-xs text-gray-400">monthly savings</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Current</p>
                    <p className="mt-2 text-2xl font-bold text-white">${tool.currentSpend}<span className="text-xs text-gray-400 font-normal">/mo</span></p>
                  </div>
                  <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3">
                    <p className="text-xs text-green-300 uppercase tracking-wider">Optimized</p>
                    <p className="mt-2 text-2xl font-bold text-green-400">${tool.optimizedSpend}<span className="text-xs text-green-300 font-normal">/mo</span></p>
                  </div>
                </div>

                <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4">
                  <p className="text-sm text-blue-100 leading-relaxed">{tool.recommendation}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Insights Section */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-white/5 to-black/40 p-8 backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="text-2xl">✨</div>
          <div>
            <h3 className="text-xl font-bold text-white">AI Insights</h3>
            <p className="text-sm text-gray-400">Executive summary of your AI spending health</p>
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-r from-indigo-500/5 via-white/3 to-transparent border border-indigo-500/20 p-6">
          <p className="text-base leading-relaxed text-gray-200">{result.summary}</p>
        </div>
      </div>

      {/* Dashboard Charts */}
      <Charts result={result} />
    </motion.div>
  );
}
