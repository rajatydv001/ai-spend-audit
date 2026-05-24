"use client";

import { motion } from "framer-motion";
import { staggerItem } from "@/lib/motion-variants";
import AnimatedCounter from "@/components/dashboard/animated-counter";

interface MetricCardProps {
  icon: string;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  formatter?: (v: number) => string;
  trend?: "up" | "down" | "neutral";
  delta?: string;
  gradient?: string;
}

const trendColors = {
  up: "text-green-400",
  down: "text-red-400",
  neutral: "text-gray-400",
};

const trendIcons = {
  up: "↑",
  down: "↓",
  neutral: "→",
};

export default function MetricCard({
  icon,
  label,
  value,
  prefix = "",
  suffix = "",
  formatter,
  trend,
  delta,
  gradient = "from-white/5 to-black/40",
}: MetricCardProps) {
  return (
    <motion.div
      variants={staggerItem}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} p-6 backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-white/20`}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-white/[0.03] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {label}
          </p>
          <span className="text-xl">{icon}</span>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <p className="text-4xl font-bold text-white">
            <AnimatedCounter to={value} suffix={suffix} prefix={prefix} formatter={formatter} />
          </p>
          {trend && (
            <span className={`text-sm font-medium ${trendColors[trend]}`}>
              {trendIcons[trend]} {delta}
            </span>
          )}
        </div>
        {delta && !trend && (
          <p className="mt-1 text-xs text-gray-400">{delta}</p>
        )}
      </div>
    </motion.div>
  );
}
