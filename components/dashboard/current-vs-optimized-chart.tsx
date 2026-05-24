"use client";

import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { staggerItem } from "@/lib/motion-variants";
import type { ToolAuditResult } from "@/lib/audit-engine";

interface CurrentVsOptimizedChartProps {
  tools: ToolAuditResult[];
}

export default function CurrentVsOptimizedChart({ tools }: CurrentVsOptimizedChartProps) {
  const data = tools.map((t) => ({
    name: t.tool,
    Current: t.currentSpend,
    Optimized: t.optimizedSpend,
  }));

  return (
    <motion.div
      variants={staggerItem}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
    >
      <h3 className="text-lg font-bold text-white mb-6">
        Current vs Optimized
      </h3>
      <div className="min-w-0">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} barGap={4}>
            <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
                color: "#fff",
                fontSize: "13px",
              }}
              formatter={(value) => [`$${value ?? 0}/mo`]}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", color: "#9CA3AF" }}
              iconType="circle"
            />
            <Bar dataKey="Current" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={20} />
            <Bar dataKey="Optimized" fill="#22C55E" radius={[6, 6, 0, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
