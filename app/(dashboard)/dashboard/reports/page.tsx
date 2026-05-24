"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import EmptyState from "@/components/ui/empty-state";

export default function ReportsPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/audits")
      .then((r) => r.json())
      .then((data) => setAudits(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <LoadingSkeleton variant="card" count={3} />
      </div>
    );
  }

  if (audits.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon="📄" title="No reports yet" description="Run an audit and export a PDF report to see it here." action={<a href="/" className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80">Run an Audit</a>} />
      </div>
    );
  }

  const savingsTrend = audits
    .slice()
    .reverse()
    .map((a, i) => ({ month: `Audit ${i + 1}`, savings: a.totalSavings }));

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Reports</h1>
        <p className="text-gray-400 mt-1">Export and manage your audit reports</p>
      </motion.div>

      <motion.div variants={staggerItem} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {audits.map((audit) => (
          <div
            key={audit.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl">📄</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-400">
                {audit.tools?.length || 0} tools
              </span>
            </div>
            <p className="text-sm font-medium text-white">
              Audit Report — {new Date(audit.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
            <p className="text-xs text-gray-400 mt-1">Score: {Math.round(audit.optimizationScore)}/100</p>
            <p className="text-lg font-bold text-green-400 mt-3">${audit.totalSavings}<span className="text-xs text-gray-400 font-normal">/mo</span></p>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `audit-${audit.id.slice(0, 8)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-gray-300 transition hover:bg-white/10"
            >
              Download Report
            </button>
          </div>
        ))}
      </motion.div>

      {savingsTrend.length > 1 && (
        <motion.div variants={staggerItem} className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">Savings Trend</h3>
          <div className="space-y-3">
            {savingsTrend.map((point, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="w-16 text-xs text-gray-400">{point.month}</span>
                <div className="flex-1 h-4 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                    style={{ width: `${Math.min(100, (point.savings / Math.max(...savingsTrend.map((p) => p.savings))) * 100)}%` }}
                  />
                </div>
                <span className="w-20 text-right text-xs text-green-400 font-medium">${point.savings}/mo</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
