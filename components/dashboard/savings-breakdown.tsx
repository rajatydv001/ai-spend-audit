"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import ChartWrapper from "@/components/ui/chart-wrapper";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";

interface SavingsBreakdownProps {
  result: AggregateAuditResult;
}

const COLORS = ["#3B82F6", "#22C55E", "#A855F7", "#F59E0B", "#EC4899", "#14B8A6"];

export default function SavingsBreakdown({ result }: SavingsBreakdownProps) {
  const savingsByTool = result.tools
    .filter((t) => t.savings > 0)
    .sort((a, b) => b.savings - a.savings);

  const savingsPieData = savingsByTool.map((t) => ({
    name: t.tool,
    value: t.savings,
  }));

  const noSavingsTools = result.tools.filter((t) => t.savings === 0);
  const totalOptimizable = result.tools.filter((t) => t.savings > 0).length;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Summary */}
      <motion.div variants={staggerItem} className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Savings</p>
          <p className="mt-2 text-2xl font-bold text-green-400">${result.totalSavings}<span className="text-sm text-gray-400 font-normal">/mo</span></p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Annual Savings</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">${result.totalAnnualSavings}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Optimizable Tools</p>
          <p className="mt-2 text-2xl font-bold text-white">{totalOptimizable}/{result.tools.length}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Fully Optimized</p>
          <p className="mt-2 text-2xl font-bold text-white">{noSavingsTools.length}</p>
        </div>
      </motion.div>

      {savingsByTool.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Savings by Tool - Bar Chart */}
          <ChartWrapper title="Savings by Tool" subtitle="Monthly savings per tool">
            <ResponsiveContainer width="100%" height={Math.max(200, savingsByTool.length * 70)}>
              <BarChart data={savingsByTool} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="tool" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "13px" }}
                  formatter={(value) => [`$${value ?? 0}/mo`]}
                />
                <Bar dataKey="savings" radius={[0, 8, 8, 0]} barSize={24}>
                  {savingsByTool.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartWrapper>

          {/* Savings Distribution - Pie */}
          <ChartWrapper title="Savings Distribution" subtitle="Proportion of total savings by tool">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={savingsPieData} dataKey="value" nameKey="name" outerRadius={100} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {savingsPieData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "13px" }}
                  formatter={(value) => [`$${value ?? 0}/mo`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartWrapper>

          {/* Savings Table */}
          <ChartWrapper title="Savings Detail" subtitle="Per-tool breakdown" height={savingsByTool.length * 60 + 80}>
            <div className="space-y-2">
              {savingsByTool.map((t, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="text-sm font-medium text-white">{t.tool}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-400">${t.savings}<span className="text-xs text-gray-400 font-normal">/mo</span></p>
                    <p className="text-xs text-gray-500">${t.optimizedSpend} optimized</p>
                  </div>
                </div>
              ))}
            </div>
          </ChartWrapper>

          {/* Empty slot - summary */}
          <ChartWrapper title="Optimization Summary" subtitle="Tools with no savings identified">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-4xl mb-3">{noSavingsTools.length > 0 ? "✅" : "🎯"}</div>
              {noSavingsTools.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-300">
                    {noSavingsTools.length} tool{noSavingsTools.length !== 1 ? "s" : ""} already optimized:
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {noSavingsTools.map((t, i) => (
                      <span key={i} className="rounded-full border border-green-500/20 bg-green-500/5 px-3 py-1 text-xs text-green-300">
                        {t.tool}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">All tools have optimization opportunities identified.</p>
              )}
            </div>
          </ChartWrapper>
        </div>
      ) : (
        <div className="rounded-3xl border border-green-500/20 bg-green-500/5 p-16 backdrop-blur-xl text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-xl font-bold text-white mb-2">No Savings Needed</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Your AI stack is fully optimized. All tools are on their optimal plans.
          </p>
        </div>
      )}
    </motion.div>
  );
}
