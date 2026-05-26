"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion-variants";

interface PlanFeature {
  text: string;
  included: boolean;
}

const PLANS = [
  {
    name: "Free",
    price: "$0",
    description: "Get started with basic audits",
    features: [
      { text: "5 audits per month", included: true },
      { text: "3 PDF exports", included: true },
      { text: "Basic analytics", included: true },
      { text: "AI-powered insights", included: false },
      { text: "Team collaboration", included: false },
      { text: "Priority support", included: false },
    ],
    cta: "Current Plan",
    popular: false,
    priceId: null,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For growing teams that need deeper insights",
    features: [
      { text: "50 audits per month", included: true },
      { text: "100 PDF exports", included: true },
      { text: "Advanced analytics", included: true },
      { text: "AI-powered insights", included: true },
      { text: "Team collaboration", included: true },
      { text: "Priority support", included: true },
    ],
    cta: "Upgrade to Pro",
    popular: true,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || "price_pro_monthly",
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/month",
    description: "For organizations requiring full control",
    features: [
      { text: "Unlimited audits", included: true },
      { text: "Unlimited exports", included: true },
      { text: "Enterprise analytics", included: true },
      { text: "AI-powered insights", included: true },
      { text: "Team collaboration", included: true },
      { text: "Dedicated support", included: true },
    ],
    cta: "Contact Sales",
    popular: false,
    priceId: process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID || "price_enterprise_monthly",
  },
];

export default function BillingPlans({
  currentPlan,
  onUpgrade,
  loading,
}: {
  currentPlan?: string;
  onUpgrade?: (priceId: string, plan: string) => void;
  loading?: boolean;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {PLANS.map((plan) => {
        const isCurrent = currentPlan?.toLowerCase() === plan.name.toLowerCase();
        return (
          <motion.div
            key={plan.name}
            variants={staggerItem}
            className={`relative rounded-3xl border p-8 backdrop-blur-xl ${
              plan.popular
                ? "border-blue-500/40 bg-blue-500/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-4 py-1 text-xs font-medium text-white">
                Most Popular
              </span>
            )}

            <h3 className="text-xl font-bold text-white">{plan.name}</h3>
            <p className="mt-1 text-sm text-gray-400">{plan.description}</p>

            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-white">{plan.price}</span>
              {plan.period && (
                <span className="text-sm text-gray-400">{plan.period}</span>
              )}
            </div>

            <ul className="mt-6 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature.text} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full ${
                      feature.included ? "bg-green-500/20 text-green-400" : "bg-white/5 text-gray-500"
                    }`}
                  >
                    {feature.included ? "✓" : "×"}
                  </span>
                  <span className={feature.included ? "text-gray-300" : "text-gray-500"}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => {
                if (plan.priceId && onUpgrade) {
                  onUpgrade(plan.priceId, plan.name.toUpperCase());
                }
              }}
              disabled={isCurrent || loading || !plan.priceId}
              className={`mt-8 w-full rounded-2xl py-3 text-sm font-medium transition ${
                isCurrent
                  ? "border border-white/10 bg-white/5 text-gray-400 cursor-default"
                  : plan.popular
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? "Processing..." : isCurrent ? "Current Plan" : plan.cta}
            </button>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
