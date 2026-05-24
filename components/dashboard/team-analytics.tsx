"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import ChartWrapper from "@/components/ui/chart-wrapper";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area,
} from "recharts";
import { useMemo } from "react";

interface TeamAnalyticsProps {
  result: AggregateAuditResult;
}

export default function TeamAnalytics({ result }: TeamAnalyticsProps) {
  const totalOptimizedCount = result.tools.filter((t) => t.status !== "Overpaying").length;
  const efficiencyScore = result.tools.length > 0
    ? Math.round((totalOptimizedCount / result.tools.length) * 100)
    : 100;

  const currentVsOptimizedData = result.tools.map((t) => ({
    name: t.tool,
    Current: t.currentSpend,
    Optimized: t.optimizedSpend,
  }));

  const projectionData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let monthly = 0;
    return months.map((month) => {
      monthly += result.totalSavings;
      return { month, cumulative: monthly };
    });
  }, [result]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Efficiency Metrics */}
      <motion.div variants={staggerItem} className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Team Efficiency</p>
          <p className="mt-2 text-2xl font-bold text-white">{efficiencyScore}%</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600" style={{ width: `${efficiencyScore}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Current Monthly</p>
          <p className="mt-2 text-2xl font-bold text-white">${result.totalCurrentSpend}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Optimized Monthly</p>
          <p className="mt-2 text-2xl font-bold text-green-400">${result.totalOptimizedSpend}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Monthly Difference</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">${result.totalSavings}</p>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current vs Optimized */}
        <ChartWrapper title="Current vs Optimized Spend" subtitle="Per-tool comparison">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={currentVsOptimizedData} barGap={4}>
              <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "13px" }}
                formatter={(value) => [`$${value ?? 0}/mo`]}
              />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#9CA3AF" }} iconType="circle" />
              <Bar dataKey="Current" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={18} />
              <Bar dataKey="Optimized" fill="#22C55E" radius={[6, 6, 0, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>

        {/* Monthly vs Annual Projection */}
        <ChartWrapper title="Monthly vs Annual Projection" subtitle="Cumulative savings over 12 months">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={projectionData}>
              <defs>
                <linearGradient id="monthlyVsAnnual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "13px" }}
                formatter={(value) => [`$${value ?? 0}`, "Cumulative"]}
              />
              <Area type="monotone" dataKey="cumulative" stroke="#22C55E" strokeWidth={2} fill="url(#monthlyVsAnnual)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartWrapper>

        {/* Tool Comparison */}
        <ChartWrapper title="Tool Comparison" subtitle="Current spend across all tools">
          <ResponsiveContainer width="100%" height={Math.max(200, result.tools.length * 60)}>
            <BarChart data={result.tools} layout="vertical" margin={{ left: 80, right: 20 }}>
              <XAxis type="number" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="tool" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff", fontSize: "13px" }}
                formatter={(value) => [`$${value ?? 0}/mo`]}
              />
              <Bar dataKey="currentSpend" radius={[0, 8, 8, 0]} barSize={20} fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrapper>

        {/* Status Distribution */}
        <ChartWrapper title="Status Distribution" subtitle="Optimization status across tools">
          <div className="flex flex-col items-center justify-center py-8">
            <div className="flex flex-wrap gap-3 justify-center">
              {result.tools.map((t, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                  <span className={`h-3 w-3 rounded-full ${
                    t.status === "Overpaying" ? "bg-red-400" :
                    t.status === "Optimization Available" ? "bg-amber-400" : "bg-green-400"
                  }`} />
                  <span className="text-sm text-gray-300">{t.tool}</span>
                  <span className={`text-xs font-medium ${
                    t.status === "Overpaying" ? "text-red-300" :
                    t.status === "Optimization Available" ? "text-amber-300" : "text-green-300"
                  }`}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartWrapper>
      </div>
    </motion.div>
  );
}
