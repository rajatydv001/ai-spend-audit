"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { staggerItem } from "@/lib/motion-variants";

interface YearlyProjectionChartProps {
  monthlySavings: number;
}

export default function YearlyProjectionChart({ monthlySavings }: YearlyProjectionChartProps) {
  const data = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let cumulative = 0;
    return months.map((month) => {
      cumulative += monthlySavings;
      return { month, savings: cumulative };
    });
  }, [monthlySavings]);

  return (
    <motion.div
      variants={staggerItem}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
    >
      <h3 className="text-lg font-bold text-white mb-6">
        Yearly Savings Projection
      </h3>
      <div className="min-w-0">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C55E" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
                color: "#fff",
                fontSize: "13px",
              }}
              formatter={(value) => [`$${value ?? 0}`, "Cumulative Savings"]}
            />
            <Area
              type="monotone"
              dataKey="savings"
              stroke="#22C55E"
              strokeWidth={2}
              fill="url(#savingsGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
