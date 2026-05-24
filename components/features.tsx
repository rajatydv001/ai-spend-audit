"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem, slideUp } from "@/lib/motion-variants";

const features = [
  {
    title: "AI Spend Analysis",
    description:
      "Analyze your current AI subscriptions and identify unnecessary spending instantly.",
  },
  {
    title: "Smart Recommendations",
    description:
      "Get intelligent downgrade and alternative suggestions tailored to your team.",
  },
  {
    title: "Annual Savings Reports",
    description:
      "Discover how much money your company can save every year on AI tooling.",
  },
];

export default function Features() {
  return (
    <section
      id="features"
      className="mx-auto max-w-7xl px-6 py-24"
    >
      <motion.div
        variants={slideUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-4xl font-bold">
          Everything You Need to Optimize AI Costs
        </h2>
        <p className="mt-4 text-lg text-gray-400">
          Built for startups, engineering teams, and AI-first companies.
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mt-16 grid gap-6 md:grid-cols-3"
      >
        {features.map((feature) => (
          <motion.div
            key={feature.title}
            variants={staggerItem}
            className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-blue-500/30 hover:bg-white/10"
          >
            <h3 className="text-2xl font-semibold">
              {feature.title}
            </h3>
            <p className="mt-4 leading-7 text-gray-400">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}