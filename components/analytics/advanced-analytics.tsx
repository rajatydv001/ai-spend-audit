"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";

interface Trend {
  date: string;
  spend: number;
  savings: number;
  score: number;
}

interface Adoption {
  name: string;
  auditCount: number;
  avgSpend: number;
  avgSavings: number;
  totalSpend: number;
  totalSavings: number;
}

interface Utilization {
  score: number;
  breakdown: { name: string; status: string; utilization: number }[];
  recommendation: string;
}

interface Projection {
  current: number;
  projected3Months: number;
  projected6Months: number;
  projected12Months: number;
  growthRate: number;
}

export default function AdvancedAnalytics() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [adoption, setAdoption] = useState<Adoption[]>([]);
  const [utilization, setUtilization] = useState<Utilization | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics/trends?type=trends").then((r) => r.json()),
      fetch("/api/analytics/trends?type=adoption").then((r) => r.json()),
      fetch("/api/analytics/trends?type=utilization").then((r) => r.json()),
      fetch("/api/analytics/trends?type=projection").then((r) => r.json()),
    ])
      .then(([t, a, u, p]) => {
        setTrends(t);
        setAdoption(a);
        setUtilization(u);
        setProjection(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
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
      {/* Utilization Score */}
      {utilization && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">AI Utilization Score</h2>
          <div className="flex items-center gap-6">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke={utilization.score >= 70 ? "#22C55E" : utilization.score >= 40 ? "#F59E0B" : "#EF4444"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - utilization.score / 100)}
                />
              </svg>
              <span className="absolute text-2xl font-bold text-white">{utilization.score}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-400">{utilization.recommendation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {utilization.breakdown.map((t) => (
                  <span
                    key={t.name}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      t.utilization >= 80 ? "bg-green-500/20 text-green-300"
                      : t.utilization >= 50 ? "bg-yellow-500/20 text-yellow-300"
                      : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {t.name}: {t.utilization}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Projection */}
      {projection && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Projected Future Spend</h2>
          <p className="text-xs text-gray-500 mb-4">Monthly growth rate: {projection.growthRate}%</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Current", value: projection.current },
              { label: "3 Months", value: projection.projected3Months },
              { label: "6 Months", value: projection.projected6Months },
              { label: "12 Months", value: projection.projected12Months },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="text-lg font-bold text-white mt-1">${Math.round(item.value).toLocaleString()}</p>
                <p className="text-xs text-gray-500">/mo</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Spending Trends */}
      {trends.length > 0 && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Spending Trends</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs text-gray-400 pb-2 border-b border-white/5">
              <span className="w-24">Date</span>
              <span className="flex-1">Spend</span>
              <span className="w-20 text-right">Savings</span>
            </div>
            {trends.slice(-10).map((t, i) => {
              const maxSpend = Math.max(...trends.map((x) => x.spend), 1);
              return (
                <div key={i} className="flex items-center gap-4 text-sm">
                  <span className="w-24 text-gray-400">{t.date}</span>
                  <div className="flex-1 h-4 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                      style={{ width: `${(t.spend / maxSpend) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-white font-medium">${Math.round(t.spend).toLocaleString()}</span>
                  <span className="w-20 text-right text-green-400">${Math.round(t.savings).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Tool Adoption */}
      {adoption.length > 0 && (
        <motion.div variants={staggerItem} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4">Tool Adoption Analytics</h2>
          <div className="space-y-3">
            {adoption.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3">
                <div>
                  <p className="text-sm text-white">{tool.name}</p>
                  <p className="text-xs text-gray-500">{tool.auditCount} audits, avg ${tool.avgSpend}/mo</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">${tool.totalSpend.toLocaleString()}</p>
                  <p className="text-xs text-green-400">${tool.totalSavings.toLocaleString()} saved</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
