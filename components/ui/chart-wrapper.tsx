"use client";

import { motion } from "framer-motion";
import { staggerItem } from "@/lib/motion-variants";

interface ChartWrapperProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
}

export default function ChartWrapper({ title, subtitle, children, height }: ChartWrapperProps) {
  return (
    <motion.div
      variants={staggerItem}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
    >
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-gray-400">{subtitle}</p>}
      </div>
      <div className="min-w-0" style={height ? { height } : undefined}>
        {children}
      </div>
    </motion.div>
  );
}
