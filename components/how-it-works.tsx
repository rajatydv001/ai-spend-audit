"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem, slideUp } from "@/lib/motion-variants";

const steps = [
  {
    step: "01",
    title: "Connect Your AI Stack",
    description:
      "Enter the AI tools your company currently pays for, including plans, seats, and monthly spend.",
  },
  {
    step: "02",
    title: "Analyze Spending",
    description:
      "Our audit engine identifies overspending, inefficient plans, and cheaper alternatives instantly.",
  },
  {
    step: "03",
    title: "Save Thousands",
    description:
      "Receive a personalized optimization report with projected monthly and annual savings.",
  },
];

export default function HowItWorks() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <motion.div
        variants={slideUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-4xl font-bold">
          How It Works
        </h2>
        <p className="mt-4 text-lg text-gray-400">
          Simple workflow designed for fast-moving AI teams.
        </p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mt-16 grid gap-6 md:grid-cols-3"
      >
        {steps.map((item) => (
          <motion.div
            key={item.step}
            variants={staggerItem}
            className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] hover:border-blue-500/30"
          >
            <span className="text-sm text-blue-400">
              {item.step}
            </span>
            <h3 className="mt-4 text-2xl font-semibold">
              {item.title}
            </h3>
            <p className="mt-4 leading-7 text-gray-400">
              {item.description}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}