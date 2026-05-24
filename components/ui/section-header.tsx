"use client";

import { motion } from "framer-motion";
import { fadeIn } from "@/lib/motion-variants";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <motion.div
      variants={fadeIn}
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-8"
    >
      <div>
        <h2 className="text-3xl font-bold text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-gray-400">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </motion.div>
  );
}
