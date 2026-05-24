"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import AdvancedAnalytics from "@/components/analytics/advanced-analytics";

export default function AnalyticsPage() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <p className="text-gray-400 mt-1">Deep insights into your AI spend and utilization</p>
      </motion.div>

      <AdvancedAnalytics />
    </motion.div>
  );
}
