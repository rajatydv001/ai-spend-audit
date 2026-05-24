import { create } from "zustand";
import type { AggregateAuditResult } from "@/lib/audit-engine";

export type DashboardTab = "overview" | "recommendations" | "analytics" | "savings";

interface AuditState {
  result: AggregateAuditResult | null;
  activeTab: DashboardTab;
  isGenerating: boolean;
  isExporting: boolean;

  setResult: (r: AggregateAuditResult) => void;
  clearResult: () => void;
  setActiveTab: (tab: DashboardTab) => void;
  setIsGenerating: (v: boolean) => void;
  setIsExporting: (v: boolean) => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  result: null,
  activeTab: "overview",
  isGenerating: false,
  isExporting: false,

  setResult: (r) => set({ result: r }),
  clearResult: () => set({ result: null, activeTab: "overview" }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsGenerating: (v) => set({ isGenerating: v }),
  setIsExporting: (v) => set({ isExporting: v }),
}));
