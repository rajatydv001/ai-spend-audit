"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import MetricCard from "@/components/ui/metric-card";
import ChartWrapper from "@/components/ui/chart-wrapper";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";

interface ExecutiveReportProps {
  result: AggregateAuditResult;
}

export default function ExecutiveReport({ result }: ExecutiveReportProps) {
  const savingsPercent = result.totalCurrentSpend > 0
    ? ((result.totalSavings / result.totalCurrentSpend) * 100).toFixed(1)
    : "0";

  const roi = result.totalCurrentSpend > 0
    ? Math.round((result.totalAnnualSavings / result.totalCurrentSpend) * 100)
    : 0;

  const projectionData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let cumulative = 0;
    return months.map((month) => {
      cumulative += result.totalSavings;
      return { month, savings: cumulative, baseline: result.totalCurrentSpend };
    });
  }, [result]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Header Badges */}
      <motion.div variants={staggerItem} className="flex flex-wrap gap-3 mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-300">
          <span className="h-2 w-2 rounded-full bg-blue-400" />
          {result.tools.length} Tool{result.tools.length !== 1 ? "s" : ""} Analyzed
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-300">
          <span className={`h-2 w-2 rounded-full ${result.overallOptimizationScore >= 70 ? "bg-green-400" : "bg-amber-400"}`} />
          Score: {Math.round(result.overallOptimizationScore)}/100
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          ${result.totalAnnualSavings}/yr Savings
        </span>
      </motion.div>

      {/* Premium Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon="💵"
          label="Current Monthly Spend"
          value={result.totalCurrentSpend}
          prefix="$"
          formatter={(v) => v.toLocaleString()}
          gradient="from-purple-500/10 to-black/40"
        />
        <MetricCard
          icon="🔄"
          label="Optimized Monthly"
          value={result.totalOptimizedSpend}
          prefix="$"
          formatter={(v) => v.toLocaleString()}
          gradient="from-blue-500/10 to-black/40"
          delta={`${savingsPercent}% reduction`}
        />
        <MetricCard
          icon="💰"
          label="Monthly Savings"
          value={result.totalSavings}
          prefix="$"
          formatter={(v) => v.toLocaleString()}
          gradient="from-green-500/10 to-black/40"
          trend="up"
          delta={`${savingsPercent}%`}
        />
        <MetricCard
          icon="📈"
          label="Annual Savings"
          value={result.totalAnnualSavings}
          prefix="$"
          formatter={(v) => v.toLocaleString()}
          gradient="from-emerald-500/10 to-black/40"
          delta={`${roi}% ROI`}
        />
      </div>

      {/* Summary Strip */}
      <motion.div variants={staggerItem} className="mt-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Optimization Score</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="text-2xl font-bold text-white">
              {Math.round(result.overallOptimizationScore)}
            </span>
            <span className="text-sm text-gray-400">/100</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600"
              style={{ width: `${result.overallOptimizationScore}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Tools Optimized</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {result.tools.filter((t) => t.status !== "Overpaying").length}/{result.tools.length}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {result.tools.filter((t) => t.status === "Overpaying").length} need attention
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">ROI Estimate</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">{roi}%</p>
          <p className="mt-1 text-xs text-gray-400">Annual return on investment</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">AI Health Status</p>
          <p className={`mt-2 text-lg font-bold ${
            result.overallOptimizationScore >= 85 ? "text-green-400" :
            result.overallOptimizationScore >= 70 ? "text-blue-400" :
            result.overallOptimizationScore >= 50 ? "text-amber-400" :
            "text-red-400"
          }`}>
            {result.overallOptimizationScore >= 85 ? "Excellent" :
             result.overallOptimizationScore >= 70 ? "Good" :
             result.overallOptimizationScore >= 50 ? "Moderate" :
             "Critical"}
          </p>
          <p className="mt-1 text-xs text-gray-400">Overall stack health</p>
        </div>
      </motion.div>

      {/* Savings Projection Chart */}
      <motion.div variants={staggerItem} className="mt-8">
        <ChartWrapper title="Savings Projection" subtitle="12-month cumulative savings forecast">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={projectionData}>
              <defs>
                <linearGradient id="projGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  color: "#fff",
                  fontSize: "13px",
                }}
                formatter={(value) => [`$${value ?? 0}`, "Cumulative Savings"]}
              />
              <Area type="monotone" dataKey="savings" stroke="#22C55E" strokeWidth={2} fill="url(#projGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartWrapper>
      </motion.div>

      {/* Summary */}
      <motion.div variants={staggerItem} className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-500/5 via-white/3 to-transparent p-6">
        <p className="text-sm leading-relaxed text-gray-200">
          {result.summary}
        </p>
      </motion.div>
    </motion.div>
  );
}
