"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import BillingPlans from "@/components/billing/billing-plans";
import toast from "react-hot-toast";

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState("FREE");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.plan) setCurrentPlan(data.plan);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async (priceId: string, plan: string) => {
    setProcessing(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Stripe not configured. This is a demo.");
      }
    } catch {
      toast.error("Failed to start checkout");
    } finally {
      setProcessing(false);
    }
  };

  const handleBillingPortal = async () => {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error("Failed to open billing portal");
    }
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="p-6 space-y-8"
    >
      <motion.div variants={staggerItem}>
        <h1 className="text-3xl font-bold text-white">Billing</h1>
        <p className="text-gray-400 mt-1">Manage your subscription and billing</p>
      </motion.div>

      {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      ) : (
        <motion.div variants={staggerItem}>
          <BillingPlans
            currentPlan={currentPlan}
            onUpgrade={handleUpgrade}
            loading={processing}
          />
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleBillingPortal}
              className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm text-gray-300 hover:bg-white/10"
            >
              Manage Billing Portal
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
