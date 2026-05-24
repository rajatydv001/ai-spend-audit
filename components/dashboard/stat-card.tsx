"use client";

import { motion } from "framer-motion";
import { staggerItem } from "@/lib/motion-variants";
import AnimatedCounter from "./animated-counter";

interface StatCardProps {
  icon: string;
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  formatter?: (value: number) => string;
  gradient?: string;
  children?: React.ReactNode;
}

export default function StatCard({
  icon,
  label,
  value,
  suffix = "",
  prefix = "",
  formatter,
  gradient = "from-white/5 to-black/40",
  children,
}: StatCardProps) {
  return (
    <motion.div
      variants={staggerItem}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} p-6 backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-white/20"
    >
      <div className="absolute inset-0 bg-gradient-to-t from-white/[0.03] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {label}
          </p>
          <span className="text-xl">{icon}</span>
        </div>
        <div className="mt-4">
          <p className="text-4xl font-bold text-white">
            <AnimatedCounter to={value} suffix={suffix} prefix={prefix} formatter={formatter} />
          </p>
          {children}
        </div>
      </div>
    </motion.div>
  );
}
