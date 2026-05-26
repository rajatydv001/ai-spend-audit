"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { detectRedundantSubscriptions, estimateAnnualSpend, compareToolPricing } from "@/lib/services/pricing-intelligence";

interface ToolEntry {
  name: string;
  plan: string;
  spend: number;
  users: number;
}

export default function PricingIntelligence() {
  const [tools, setTools] = useState<ToolEntry[]>([{ name: "ChatGPT", plan: "Plus", spend: 0, users: 1 }]);
  const [redundant, setRedundant] = useState<any[] | null>(null);
  const [projection, setProjection] = useState<{ monthly: number[]; total: number } | null>(null);

  const checkRedundancies = () => {
    const result = detectRedundantSubscriptions(tools);
    setRedundant(result);
  };

  const calculateProjection = () => {
    const totalMonthlySpend = tools.reduce((s, t) => s + t.spend, 0);
    const result = estimateAnnualSpend(totalMonthlySpend);
    setProjection(result);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <h2 className="text-lg font-bold text-white mb-4">Pricing Intelligence</h2>
        <p className="text-sm text-gray-400 mb-6">Analyze your AI tool stack for redundancies, savings, and cost projections.</p>

        <div className="space-y-4">
          {tools.map((tool, i) => (
            <div key={i} className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tool</label>
                <select
                  value={tool.name}
                  onChange={(e) => {
                    const updated = [...tools];
                    updated[i] = { ...updated[i], name: e.target.value };
                    setTools(updated);
                  }}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                >
                  {["ChatGPT", "Claude", "Cursor", "Copilot", "Gemini", "Windsurf"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Plan</label>
                <select
                  value={tool.plan}
                  onChange={(e) => {
                    const updated = [...tools];
                    updated[i] = { ...updated[i], plan: e.target.value };
                    setTools(updated);
                  }}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                >
                  {["Free", "Pro", "Team", "Enterprise", "Plus", "Max", "Hobby", "Business", "Individual", "Ultra"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Monthly Spend ($)</label>
                <input
                  type="number"
                  value={tool.spend || ""}
                  onChange={(e) => {
                    const updated = [...tools];
                    updated[i] = { ...updated[i], spend: Number(e.target.value) };
                    setTools(updated);
                  }}
                  className="w-full sm:w-28 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Users</label>
                <input
                  type="number"
                  value={tool.users || ""}
                  onChange={(e) => {
                    const updated = [...tools];
                    updated[i] = { ...updated[i], users: Number(e.target.value) };
                    setTools(updated);
                  }}
                  className="w-full sm:w-20 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
                />
              </div>
              <button
                onClick={() => setTools(tools.filter((_, j) => j !== i))}
                className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400 hover:bg-red-500/20"
              >
                Remove
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setTools([...tools, { name: "ChatGPT", plan: "Plus", spend: 0, users: 1 }])}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
            >
              + Add Tool
            </button>
            <button
              onClick={checkRedundancies}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
            >
              Check Redundancies
            </button>
            <button
              onClick={calculateProjection}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-80"
            >
              Project Annual Spend
            </button>
          </div>
        </div>
      </div>

      {/* Redundancies */}
      {redundant && redundant.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 backdrop-blur-xl"
        >
          <h3 className="text-lg font-bold text-white mb-4">Redundant Subscriptions Detected</h3>
          <div className="space-y-3">
            {redundant.map((r, i) => (
              <div key={i} className="rounded-xl bg-black/40 p-4">
                <p className="text-sm text-white">{r.reason}</p>
                <p className="text-xs text-gray-400 mt-1">Tools: {r.tools.join(", ")}</p>
                <p className="text-sm font-bold text-red-400 mt-2">Potential savings: ${r.potentialSavings}/mo</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {redundant && redundant.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6 backdrop-blur-xl"
        >
          <p className="text-sm text-green-400">No redundant subscriptions detected in your current stack.</p>
        </motion.div>
      )}

      {/* Projection */}
      {projection && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
        >
          <h3 className="text-lg font-bold text-white mb-4">Annual Spend Projection</h3>
          <div className="space-y-2">
            {projection.monthly.map((amount, i) => {
              const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              const maxAmount = Math.max(...projection.monthly, 1);
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-8 text-gray-400">{months[i]}</span>
                  <div className="flex-1 h-5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${(amount / maxAmount) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-white font-medium">${Math.round(amount).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-lg font-bold text-white">
              Annual Total: <span className="text-green-400">${Math.round(projection.total).toLocaleString()}</span>
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
