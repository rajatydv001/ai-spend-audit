"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import PricingIntelligence from "@/components/pricing/pricing-intelligence";

export default function PricingPage() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Pricing Intelligence</h1>
        <p className="text-gray-400 mt-1">Compare tool pricing, detect redundancies, and project costs</p>
      </motion.div>

      <PricingIntelligence />
    </motion.div>
  );
}
