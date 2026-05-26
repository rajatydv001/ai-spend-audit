"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import EmptyState from "@/components/ui/empty-state";
import toast from "react-hot-toast";

interface AuditRecord {
  id: string;
  createdAt: string;
  totalCurrentSpend: number;
  totalSavings: number;
  optimizationScore: number;
  summary: string;
  tools: { name: string; status: string; savings: number }[];
  _count: { savedReports: number };
}

export default function AuditsPage() {
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchAudits() {
      try {
        const res = await fetch("/api/audits");
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setAudits(data);
        }
      } catch {
        if (active) toast.error("Failed to load audits");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchAudits();
    return () => {
      active = false;
    };
  }, []);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/audits/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAudits((prev) => prev.filter((a) => a.id !== id));
        toast.success("Audit deleted");
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

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
        <EmptyState icon="🔍" title="No audits found" description="Run your first audit to start tracking your AI spend." action={<Link href="/" className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80">Run an Audit</Link>} />
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-6"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Audit History</h1>
        <p className="text-gray-400 mt-1">{audits.length} audit{audits.length !== 1 ? "s" : ""} saved</p>
      </motion.div>

      <motion.div variants={staggerItem} className="space-y-4">
        {audits.map((audit) => {
          const overpayingCount = audit.tools.filter((t) => t.status === "Overpaying").length;
          return (
            <div
              key={audit.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-bold text-white">
                      Audit {new Date(audit.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-400">
                      {audit.tools.length} tools
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-2">{audit.summary}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-gray-500">
                      Score: <span className="text-white font-medium">{Math.round(audit.optimizationScore)}/100</span>
                    </span>
                    {overpayingCount > 0 && (
                      <span className="text-xs text-red-400">{overpayingCount} overpaying</span>
                    )}
                    <span className="text-xs text-green-400">${audit.totalSavings}/mo savings</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(audit.id)}
                    disabled={deleting === audit.id}
                    className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {deleting === audit.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
