"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";
import BillingPlans from "@/components/billing/billing-plans";
import toast from "react-hot-toast";

interface BillingStatus {
  plan: string;
  status: string | null;
  stripeConfigured: boolean;
  prices: { PRO: string | null; ENTERPRISE: string | null };
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  TRIALING: "Trialing",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
  INCOMPLETE: "Incomplete",
};

const FALLBACK: BillingStatus = {
  plan: "FREE",
  status: null,
  stripeConfigured: false,
  prices: { PRO: null, ENTERPRISE: null },
};

export default function BillingPage() {
  const [info, setInfo] = useState<BillingStatus>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (data?.plan) setInfo(data);
      })
      .catch(() => toast.error("Failed to load billing status"))
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
      } else if (res.status === 503) {
        toast.error("Stripe is not configured in this environment.");
      } else {
        toast.error(data.error ?? "Failed to start checkout");
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
      } else if (res.status === 503) {
        toast.error("Stripe is not configured in this environment.");
      } else {
        toast.error(data.error ?? "Failed to open billing portal");
      }
    } catch {
      toast.error("Failed to open billing portal");
    }
  };

  const statusLabel =
    info.plan === "FREE" ? "Free plan" : (STATUS_LABEL[info.status ?? ""] ?? "Not subscribed");

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
        <>
          {!info.stripeConfigured && (
            <motion.div
              variants={staggerItem}
              className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200"
            >
              Stripe is not configured in this environment. Billing is disabled —
              you are on the Free plan. Configure <code className="font-mono">STRIPE_SECRET_KEY</code> and the
              plan price ids to enable upgrades.
            </motion.div>
          )}

          <motion.div
            variants={staggerItem}
            className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-xl flex items-center justify-between gap-4 flex-wrap"
          >
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Current plan</p>
              <p className="mt-1 text-xl font-bold text-white">{info.plan}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-gray-500">Status</p>
              <p className="mt-1 text-sm font-medium text-gray-300">{statusLabel}</p>
            </div>
          </motion.div>

          <motion.div variants={staggerItem}>
            <BillingPlans
              currentPlan={info.plan}
              onUpgrade={handleUpgrade}
              loading={processing}
              prices={info.prices}
            />
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleBillingPortal}
                disabled={!info.stripeConfigured}
                className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {info.stripeConfigured ? "Manage Billing Portal" : "Billing portal unavailable"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}