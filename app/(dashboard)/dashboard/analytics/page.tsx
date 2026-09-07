"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import AdvancedAnalytics from "@/components/analytics/advanced-analytics";
import UpgradeCard from "@/components/plan/upgrade-card";
import LoadingSkeleton from "@/components/ui/loading-skeleton";

interface Entitlements {
  plan: string;
  features: { ai: boolean; analytics: boolean };
}

export default function AnalyticsPage() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/entitlements")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setEntitlements(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

      {loading ? (
        <LoadingSkeleton variant="chart" count={2} />
      ) : entitlements && !entitlements.features.analytics ? (
        <motion.div variants={staggerItem}>
          <UpgradeCard
            title="Analytics is a Pro feature"
            description="Advanced analytics, cost projections, and team utilization insights are available on the Pro plan. Upgrade to unlock them."
          />
        </motion.div>
      ) : (
        <AdvancedAnalytics />
      )}
    </motion.div>
  );
}
