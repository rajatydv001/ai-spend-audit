"use client";

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { staggerContainer, slideUp } from "@/lib/motion-variants";
import { useAuditStore } from "@/lib/store/audit-store";
import type { AggregateAuditResult } from "@/lib/audit-engine";
import { generatePdfReport } from "@/lib/pdf-export";
import TabNavigation from "@/components/dashboard/tab-navigation";
import ExecutiveReport from "@/components/dashboard/executive-report";
import RecommendationsEngine from "@/components/dashboard/recommendations-engine";
import TeamAnalytics from "@/components/dashboard/team-analytics";
import SavingsBreakdown from "@/components/dashboard/savings-breakdown";
import EmptyState from "@/components/ui/empty-state";

interface ChartsProps {
  result: AggregateAuditResult | null;
}

const tabComponents: Record<string, React.FC<{ result: AggregateAuditResult }>> = {
  overview: ExecutiveReport,
  recommendations: RecommendationsEngine,
  analytics: TeamAnalytics,
  savings: SavingsBreakdown,
};

export default function Charts({ result }: ChartsProps) {
  const activeTab = useAuditStore((s) => s.activeTab);
  const setActiveTab = useAuditStore((s) => s.setActiveTab);
  const isExporting = useAuditStore((s) => s.isExporting);
  const setIsExporting = useAuditStore((s) => s.setIsExporting);

  const handleExport = useCallback(async () => {
    if (!result) return;
    setIsExporting(true);
    try {
      const blob = await generatePdfReport(result);
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
  }, [result, setIsExporting]);

  if (!result || result.tools.length === 0) {
    return (
      <section id="dashboard" className="mx-auto max-w-7xl px-6 py-24">
        <EmptyState
          icon="📊"
          title="Your Dashboard Awaits"
          description="Run an audit to see your AI spend breakdown, savings projections, and optimization insights."
          action={
            <a
              href="#audit"
              className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80"
            >
              Start an Audit
            </a>
          }
        />
      </section>
    );
  }

  const TabContent = tabComponents[activeTab];

  return (
    <section id="dashboard" className="mx-auto max-w-7xl px-6 py-24">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        {/* Header with Tab Nav and Export */}
        <motion.div variants={slideUp} className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-4xl font-bold text-white">Audit Dashboard</h2>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
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
                  Export Report
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-gray-400">
            Real-time analysis of your AI spending across {result.tools.length} tool{result.tools.length !== 1 ? "s" : ""}
          </p>
        </motion.div>

        {/* Tab Navigation */}
        <motion.div variants={slideUp} className="mb-8">
          <TabNavigation active={activeTab} onChange={setActiveTab} />
        </motion.div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <TabContent result={result} />
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
