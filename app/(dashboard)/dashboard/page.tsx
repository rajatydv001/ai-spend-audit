"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import { generatePdfReport } from "@/lib/pdf-export";
import { useAuditStore } from "@/lib/store/audit-store";
import MetricCard from "@/components/ui/metric-card";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import ExecutiveReport from "@/components/dashboard/executive-report";
import AuditForm from "@/components/audit-form";

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const [audits, setAudits] = useState<{ id: string; createdAt: string; totalSavings: number; totalCurrentSpend: number; optimizationScore: number; resultData: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<AggregateAuditResult | null>(null);
  const searchParams = useSearchParams();
  const [showNewAuditForm, setShowNewAuditForm] = useState(searchParams.get("new-audit") === "1");
  const auditId = searchParams.get("auditId");
  const isExporting = useAuditStore((s) => s.isExporting);
  const setIsExporting = useAuditStore((s) => s.setIsExporting);

  const fetchAudits = useCallback(async () => {
    const res = await fetch("/api/audits");
    const data = await res.json();
    setAudits(data);
    if (data.length > 0) {
      let target;
      if (auditId) {
        target = data.find((a: { id: string }) => a.id === auditId);
      }
      if (!target) target = data[0];
      try {
        setSelectedResult(JSON.parse(target.resultData));
      } catch {}
    } else {
      setSelectedResult(null);
    }
  }, [auditId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await fetchAudits();
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [fetchAudits]);

  const handleAuditCreated = useCallback(() => {
    setShowNewAuditForm(false);
    fetchAudits();
  }, [fetchAudits]);

  const handleExportPdf = useCallback(async () => {
    if (!selectedResult) return;
    setIsExporting(true);
    try {
      const blob = await generatePdfReport(selectedResult);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai-spend-audit-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [selectedResult, setIsExporting]);

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
      <div className="p-6 space-y-8 mx-auto w-full max-w-7xl">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">
          No audits yet — run your first one below.
        </p>
        <AuditForm variant="dashboard" onAuditCreated={handleAuditCreated} />
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
      className="p-6 space-y-8 mx-auto w-full max-w-7xl"
    >
      <motion.div variants={staggerItem} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            {audits.length} audit{audits.length !== 1 ? "s" : ""} completed
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 self-start">
          {selectedResult && (
            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download PDF
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setShowNewAuditForm((v) => !v)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:opacity-80"
          >
            {showNewAuditForm ? "Cancel" : "Run New Audit"}
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showNewAuditForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <AuditForm variant="dashboard" onAuditCreated={handleAuditCreated} />
          </motion.div>
        )}
      </AnimatePresence>

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
