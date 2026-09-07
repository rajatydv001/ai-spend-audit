"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import { useAuditStore } from "@/lib/store/audit-store";
import MetricCard from "@/components/ui/metric-card";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import ExecutiveReport from "@/components/dashboard/executive-report";
import AiInsights from "@/components/dashboard/ai-insights";
import AuditForm from "@/components/audit-form";
import UpgradeCard from "@/components/plan/upgrade-card";
import toast from "react-hot-toast";

interface Entitlements {
  plan: string;
  audit: { limit: number; used: number; remaining: number };
  export: { limit: number; used: number; remaining: number };
  features: { ai: boolean };
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const [audits, setAudits] = useState<{ id: string; createdAt: string; totalSavings: number; totalCurrentSpend: number; optimizationScore: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<AggregateAuditResult | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const searchParams = useSearchParams();
  const [showNewAuditForm, setShowNewAuditForm] = useState(searchParams.get("new-audit") === "1");
  const auditId = searchParams.get("auditId");
  const isExporting = useAuditStore((s) => s.isExporting);
  const setIsExporting = useAuditStore((s) => s.setIsExporting);

  useEffect(() => {
    fetch("/api/entitlements")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setEntitlements(d);
      })
      .catch(() => {});
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/audits/${id}`);
    if (!res.ok) return;
    const detail = await res.json();
    try {
      setSelectedResult(JSON.parse(detail.resultData));
      setSelectedAuditId(detail.id);
    } catch {}
  }, []);

  const fetchAudits = useCallback(async () => {
    try {
      const res = await fetch("/api/audits");
      if (!res.ok) {
        setAudits([]);
        setSelectedResult(null);
        return;
      }
      const data = await res.json();
      // The API returns an array of audits; only a list can be rendered or
      // reduced below. A non-array payload (e.g. an error object on a 2xx-less
      // path that slipped through, or a legacy shape) must not crash the page.
      if (!Array.isArray(data)) {
        setAudits([]);
        setSelectedResult(null);
        return;
      }
      setAudits(data);
      if (data.length > 0) {
        const target =
          (auditId && data.find((a: { id: string }) => a.id === auditId)) ||
          data[0];
        await loadDetail(target.id);
      } else {
        setSelectedResult(null);
      }
    } catch {
      setAudits([]);
      setSelectedResult(null);
    }
  }, [auditId, loadDetail]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await fetchAudits();
      if (!cancelled) setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchAudits]);

  const handleAuditCreated = useCallback(() => {
    setShowNewAuditForm(false);
    fetchAudits();
  }, [fetchAudits]);

  const handleExportPdf = useCallback(async () => {
    if (!selectedResult || !selectedAuditId) return;
    if (entitlements && entitlements.export.remaining <= 0) {
      toast.error("Export limit reached. Upgrade your plan to export more reports.");
      return;
    }
    setIsExporting(true);
    try {
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: selectedAuditId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Export limit reached. Upgrade your plan to export more reports.");
        return;
      }
      // The export endpoint returns a real PDF (not JSON) and reports the new
      // remaining quota in the x-export-remaining header. Parse BOTH correctly.
      const remaining = Number(res.headers.get("x-export-remaining"));
      if (entitlements && !Number.isNaN(remaining)) {
        setEntitlements({
          ...entitlements,
          export: { ...entitlements.export, remaining },
        });
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai-spend-audit-report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed:", err);
      toast.error("PDF export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [selectedResult, selectedAuditId, entitlements, setIsExporting]);

  const auditLimitReached = entitlements ? entitlements.audit.remaining <= 0 : false;

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
            {entitlements &&
              ` · ${entitlements.audit.remaining} of ${entitlements.audit.limit} audits left this month`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 self-start">
          {selectedResult && (
            <button
              onClick={handleExportPdf}
              disabled={isExporting || !selectedAuditId || (entitlements ? entitlements.export.remaining <= 0 : false)}
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
                  {entitlements && entitlements.export.remaining <= 0
                    ? `Export limit reached (${entitlements.export.limit})`
                    : "Download PDF"}
                </>
              )}
            </button>
          )}
          {auditLimitReached ? (
            <Link
              href="/dashboard/billing"
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:opacity-80"
            >
              Upgrade to run more audits
            </Link>
          ) : (
            <button
              onClick={() => setShowNewAuditForm((v) => !v)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:opacity-80"
            >
              {showNewAuditForm ? "Cancel" : "Run New Audit"}
            </button>
          )}
        </div>
      </motion.div>

      {auditLimitReached && (
        <motion.div variants={staggerItem}>
          <UpgradeCard
            title="Audit limit reached"
            description={
              entitlements!.plan === "FREE"
                ? `You have used all ${entitlements!.audit.limit} audits available this month on your free plan. Upgrade to Pro for 50 audits per month, AI insights, and advanced analytics.`
                : `You have used all ${entitlements!.audit.limit} audits available this month on your ${entitlements!.plan.toLowerCase()} plan. All plans have limits — contact us for enterprise capacity.`
            }
          />
        </motion.div>
      )}

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

      <AiInsights auditId={selectedAuditId} enabled={entitlements?.features.ai === true} />

      {/* Recent audits list */}
      <motion.div variants={staggerItem}>
        <h2 className="text-xl font-bold text-white mb-4">Recent Audits</h2>
        <div className="space-y-3">
          {audits.slice(0, 5).map((audit) => (
            <button
              key={audit.id}
              onClick={() => loadDetail(audit.id)}
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
