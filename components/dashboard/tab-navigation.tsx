"use client";

import { motion } from "framer-motion";
import type { DashboardTab } from "@/lib/store/audit-store";

interface Tab {
  id: DashboardTab;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "recommendations", label: "Recommendations", icon: "🎯" },
  { id: "analytics", label: "Analytics", icon: "📈" },
  { id: "savings", label: "Savings Breakdown", icon: "💰" },
];

interface TabNavigationProps {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

export default function TabNavigation({ active, onChange }: TabNavigationProps) {
  return (
    <nav className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-xl overflow-x-auto" role="tablist">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="tab-indicator"
                className="absolute inset-0 rounded-xl bg-white/[0.08]"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2 whitespace-nowrap">
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
