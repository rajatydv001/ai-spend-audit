"use client";

import { motion } from "framer-motion";
import { staggerItem } from "@/lib/motion-variants";
import AnimatedCounter from "./animated-counter";

interface HealthIndicatorProps {
  score: number;
}

function getHealth(score: number): { label: string; color: string; ring: string; bg: string } {
  if (score >= 85) return { label: "Excellent", color: "text-green-400", ring: "stroke-green-400", bg: "from-green-500/10" };
  if (score >= 70) return { label: "Good", color: "text-blue-400", ring: "stroke-blue-400", bg: "from-blue-500/10" };
  if (score >= 50) return { label: "Moderate", color: "text-amber-400", ring: "stroke-amber-400", bg: "from-amber-500/10" };
  return { label: "Critical", color: "text-red-400", ring: "stroke-red-400", bg: "from-red-500/10" };
}

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function HealthIndicator({ score }: HealthIndicatorProps) {
  const health = getHealth(score);
  const clamped = Math.min(100, Math.max(0, score));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  return (
    <motion.div
      variants={staggerItem}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${health.bg} to-black/40 p-6 backdrop-blur-xl transition-all duration-300 hover:scale-[1.02]`}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-white/[0.03] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex flex-col items-center">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          AI Spend Health
        </p>
        <div className="relative">
          <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="8" />
            <motion.circle
              cx="60" cy="60" r={RADIUS} fill="none"
              strokeWidth="8" strokeLinecap="round"
              className={health.ring}
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: CIRCUMFERENCE }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">
                <AnimatedCounter to={clamped} suffix="%" />
              </p>
            </div>
          </div>
        </div>
        <p className={`mt-2 text-sm font-semibold ${health.color}`}>
          {health.label}
        </p>
      </div>
    </motion.div>
  );
}
