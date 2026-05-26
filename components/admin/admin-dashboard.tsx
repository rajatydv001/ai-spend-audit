"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";

interface AdminStats {
  totalUsers: number;
  totalOrganizations: number;
  totalAudits: number;
  activeSubscriptions: number;
  mrr: number;
  churnRate: number;
  planBreakdown: Record<string, number>;
  recentAudits: Array<{
    id: string;
    totalSavings: number;
    createdAt: string;
    user: { name: string | null; email: string };
  }>;
  recentPayments: Array<{
    amount: number;
    currency: string;
    description: string;
    createdAt: string;
  }>;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  createdAt: string;
  user: { name: string | null; email: string } | null;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditVolume, setAuditVolume] = useState<{ date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats?type=overview").then((r) => r.json()),
      fetch("/api/admin/stats?type=audit-volume").then((r) => r.json()),
      fetch("/api/admin/stats?type=audit-logs").then((r) => r.json()),
    ])
      .then(([s, v, l]) => {
        setStats(s);
        setAuditVolume(v);
        setAuditLogs(l);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-400">Admin access required</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Metrics */}
      <motion.div variants={staggerItem} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-black/40 p-5">
          <p className="text-xs text-gray-400">Total Users</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.totalUsers}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-green-500/10 to-black/40 p-5">
          <p className="text-xs text-gray-400">MRR</p>
          <p className="text-2xl font-bold text-white mt-1">${stats.mrr.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 to-black/40 p-5">
          <p className="text-xs text-gray-400">Active Subscriptions</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.activeSubscriptions}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-black/40 p-5">
          <p className="text-xs text-gray-400">Total Audits</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.totalAudits}</p>
        </div>
      </motion.div>

      {/* Plan Breakdown */}
      <motion.div variants={staggerItem} className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Plan Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(stats.planBreakdown).map(([plan, count]) => {
              const total = Object.values(stats.planBreakdown).reduce((s, c) => s + c, 0);
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={plan} className="flex items-center gap-3">
                  <span className="min-w-0 w-24 shrink-0 text-sm text-gray-300">{plan}</span>
                  <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        plan === "FREE" ? "bg-gray-500"
                        : plan === "PRO" ? "bg-blue-500"
                        : "bg-purple-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs text-gray-400">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Key Metrics</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Churn Rate</span>
              <span className="text-sm font-medium text-white">{stats.churnRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Organizations</span>
              <span className="text-sm font-medium text-white">{stats.totalOrganizations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Avg Audits/User</span>
              <span className="text-sm font-medium text-white">
                {stats.totalUsers > 0 ? (stats.totalAudits / stats.totalUsers).toFixed(1) : 0}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Recent Payments */}
      {stats.recentPayments.length > 0 && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Recent Payments</h2>
          <div className="space-y-2">
            {stats.recentPayments.map((p, i) => (
              <div key={i} className="flex justify-between items-center rounded-xl bg-black/20 px-4 py-3">
                <div>
                  <p className="text-sm text-white">{p.description}</p>
                  <p className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</p>
                </div>
                <p className="text-sm font-bold text-green-400">
                  ${(p.amount / 100).toLocaleString()} {p.currency.toUpperCase()}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Audit Logs */}
      {auditLogs.length > 0 && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Audit Log</h2>
          <div className="space-y-1 max-h-80 overflow-y-auto overflow-x-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs hover:bg-white/5">
                <span className="w-20 text-gray-500">
                  {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-gray-400">{log.action}</span>
                <span className="text-gray-400 truncate">{log.entity}</span>
                <span className="ml-auto text-gray-500">{log.user?.email || "system"}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
