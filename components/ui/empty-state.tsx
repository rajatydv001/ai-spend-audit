"use client";

import { motion } from "framer-motion";
import { fadeIn } from "@/lib/motion-variants";

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-16 backdrop-blur-xl text-center"
    >
      <div className="text-6xl mb-6">{icon}</div>
      <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
      <p className="text-gray-400 max-w-md mb-6">{description}</p>
      {action}
    </motion.div>
  );
}
