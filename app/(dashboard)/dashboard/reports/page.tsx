"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import EmptyState from "@/components/ui/empty-state";
import toast from "react-hot-toast";

interface ReportAudit {
  id: string;
  createdAt: string;
  tools?: { name: string; status: string; savings: number }[];
  optimizationScore: number;
  totalSavings: number;
}

interface Entitlements {
  plan: string;
  audit: { limit: number; used: number; remaining: number };
  export: { limit: number; used: number; remaining: number };
}

export default function ReportsPage() {
  const [audits, setAudits] = useState<ReportAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchAudits() {
      try {
        const res = await fetch("/api/audits");
        if (!active) return;
        if (!res.ok) {
          setAudits([]);
          return;
        }
        const data = await res.json();
        // Only a list is renderable; never treat an error object as a report.
        setAudits(Array.isArray(data) ? data : []);
      } catch {
        if (active) {
          setAudits([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchAudits();
    fetch("/api/entitlements")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setEntitlements(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleDownload = useCallback(
    async (audit: ReportAudit) => {
      if (entitlements && entitlements.export.remaining <= 0) {
        toast.error("Export limit reached. Upgrade your plan to export more reports.");
        return;
      }
      setExportingId(audit.id);
      try {
        const res = await fetch("/api/reports/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auditId: audit.id }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? "Export limit reached. Upgrade your plan to export more reports.");
          return;
        }
        const remaining = Number(res.headers.get("x-export-remaining"));
        if (entitlements && Number.isFinite(remaining)) {
          setEntitlements({
            ...entitlements,
            export: { ...entitlements.export, remaining },
          });
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ai-spend-audit-report-${audit.id.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Report downloaded as PDF");
      } catch {
        toast.error("Export failed. Please try again.");
      } finally {
        setExportingId(null);
      }
    },
    [entitlements]
  );

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
        <EmptyState icon="📄" title="No reports yet" description="Run an audit and export a PDF report to see it here." action={<Link href="/" className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80">Run an Audit</Link>} />
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
        <p className="text-gray-400 mt-1">
          Export and manage your audit reports
          {entitlements &&
            ` · ${entitlements.export.remaining} of ${entitlements.export.limit} exports left this month`}
        </p>
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
              onClick={() => handleDownload(audit)}
              disabled={exportingId === audit.id || (entitlements ? entitlements.export.remaining <= 0 : false)}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              {exportingId === audit.id
                ? "Exporting..."
                : entitlements && entitlements.export.remaining <= 0
                  ? `Export limit reached (${entitlements.export.limit})`
                  : "Download PDF"}
            </button>
          </div>
        ))}
      </motion.div>

      {savingsTrend.length > 1 && (
        <motion.div variants={staggerItem} className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">Savings Trend</h3>
          <div className="space-y-3">
            {savingsTrend.map((point, i) => {
              // When every audit reports $0 savings the max is 0 and the width
              // would be 0/0 = NaN% — render a 0% bar instead.
              const maxSavings = Math.max(...savingsTrend.map((p) => p.savings));
              const width = maxSavings > 0 ? (point.savings / maxSavings) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-4">
                  <span className="w-16 text-xs text-gray-400">{point.month}</span>
                  <div className="flex-1 h-4 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
                      style={{ width: `${Math.min(100, width)}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-xs text-green-400 font-medium">${point.savings}/mo</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
