"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import MetricCard from "@/components/ui/metric-card";
import EmptyState from "@/components/ui/empty-state";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import ExecutiveReport from "@/components/dashboard/executive-report";

export default function DashboardPage() {
  const [audits, setAudits] = useState<{ id: string; createdAt: string; totalSavings: number; totalCurrentSpend: number; optimizationScore: number; resultData: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<AggregateAuditResult | null>(null);

  useEffect(() => {
    fetch("/api/audits")
      .then((r) => r.json())
      .then((data) => {
        setAudits(data);
        if (data.length > 0) {
          try {
            setSelectedResult(JSON.parse(data[0].resultData));
          } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <LoadingSkeleton variant="metric" count={4} />
        <LoadingSkeleton variant="chart" count={2} />
      </div>
    );
  }

  if (audits.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon="📊"
          title="No audits yet"
          description="Run your first AI spend audit to see your dashboard."
          action={
            <a
              href="/"
              className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80"
            >
              Run an Audit
            </a>
          }
        />
      </div>
    );
  }

  const latest = audits[0];
  const totalSavings = audits.reduce((s, a) => s + a.totalSavings, 0);
  const avgScore = audits.length > 0
    ? Math.round(audits.reduce((s, a) => s + a.optimizationScore, 0) / audits.length)
    : 0;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          {audits.length} audit{audits.length !== 1 ? "s" : ""} completed
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon="🔍" label="Total Audits" value={audits.length} gradient="from-blue-500/10 to-black/40" />
        <MetricCard icon="💰" label="Total Savings Found" value={totalSavings} prefix="$" formatter={(v) => v.toLocaleString()} gradient="from-green-500/10 to-black/40" />
        <MetricCard icon="📊" label="Avg Optimization Score" value={avgScore} suffix="/100" gradient="from-purple-500/10 to-black/40" />
        <MetricCard icon="📈" label="Latest Savings" value={latest.totalSavings} prefix="$" gradient="from-emerald-500/10 to-black/40" />
      </div>

      {selectedResult && <ExecutiveReport result={selectedResult} />}

      {/* Recent audits list */}
      <motion.div variants={staggerItem}>
        <h2 className="text-xl font-bold text-white mb-4">Recent Audits</h2>
        <div className="space-y-3">
          {audits.slice(0, 5).map((audit) => (
            <button
              key={audit.id}
              onClick={() => {
                try { setSelectedResult(JSON.parse(audit.resultData)); } catch {}
              }}
              className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
            >
              <div>
                <p className="text-sm text-white font-medium">
                  Audit {new Date(audit.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <p className="text-xs text-gray-400">
                  Score: {Math.round(audit.optimizationScore)}/100
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-green-400">${audit.totalSavings}<span className="text-xs text-gray-400 font-normal">/mo</span></p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
