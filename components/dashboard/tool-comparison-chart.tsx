"use client";

import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { staggerItem } from "@/lib/motion-variants";
import type { ToolAuditResult } from "@/lib/audit-engine";

interface ToolComparisonChartProps {
  tools: ToolAuditResult[];
}

const COLORS = ["#3B82F6", "#22C55E", "#A855F7", "#F59E0B", "#EC4899", "#14B8A6"];

export default function ToolComparisonChart({ tools }: ToolComparisonChartProps) {
  const data = tools.map((t) => ({
    name: t.tool,
    spend: t.currentSpend,
  }));

  return (
    <motion.div
      variants={staggerItem}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
    >
      <h3 className="text-lg font-bold text-white mb-6">
        Tool Comparison
      </h3>
      <div className="min-w-0">
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 60)}>
          <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20 }}>
            <XAxis type="number" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
                color: "#fff",
                fontSize: "13px",
              }}
              formatter={(value) => [`$${value ?? 0}/mo`, "Spend"]}
            />
            <Bar dataKey="spend" radius={[0, 8, 8, 0]} barSize={24}>
              {data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
