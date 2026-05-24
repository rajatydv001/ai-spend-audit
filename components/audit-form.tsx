"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { generateAggregateAudit, type AggregateAuditResult } from "@/lib/audit-engine";
import { useAuditStore } from "@/lib/store/audit-store";
import AuditResults from "@/components/audit-results";
import LoadingSkeleton from "@/components/ui/loading-skeleton";
import toast from "react-hot-toast";

interface ToolConfig {
  name: string;
  plans: string[];
  category: "SaaS" | "API";
}

const TOOL_CONFIGURATION: Record<string, ToolConfig> = {
  ChatGPT: {
    name: "ChatGPT",
    category: "SaaS",
    plans: ["Plus", "Team", "Enterprise", "API"],
  },
  Claude: {
    name: "Claude",
    category: "SaaS",
    plans: ["Free", "Pro", "Max", "Team", "Enterprise", "API"],
  },
  Cursor: {
    name: "Cursor",
    category: "SaaS",
    plans: ["Hobby", "Pro", "Business", "Enterprise"],
  },
  Copilot: {
    name: "Copilot",
    category: "SaaS",
    plans: ["Individual", "Business", "Enterprise"],
  },
  Gemini: {
    name: "Gemini",
    category: "SaaS",
    plans: ["Pro", "Ultra", "API"],
  },
  "OpenAI API": {
    name: "OpenAI API",
    category: "API",
    plans: ["Pay-as-you-go"],
  },
  "Anthropic API": {
    name: "Anthropic API",
    category: "API",
    plans: ["Pay-as-you-go"],
  },
  Windsurf: {
    name: "Windsurf",
    category: "SaaS",
    plans: ["Hobby", "Pro", "Business", "Enterprise"],
  },
};

const TOOLS = Object.keys(TOOL_CONFIGURATION);

type ToolEntry = {
  tool: string;
  plan: string;
  spend: string;
  users: string;
};

export default function AuditForm() {
  const [toolEntries, setToolEntries] = useState<ToolEntry[]>([
    { tool: "", plan: "", spend: "", users: "" }
  ]);

  const [isHydrated, setIsHydrated] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const setResult = useAuditStore((s) => s.setResult);

  const [auditResult, setAuditResult] = useState<AggregateAuditResult | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aiAuditToolEntries");
      if (saved) {
        const parsed = JSON.parse(saved) as ToolEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setToolEntries(parsed);
        }
      }
    } catch (error) {
      console.error("Failed to load audit data from localStorage:", error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Save to localStorage whenever toolEntries changes
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem("aiAuditToolEntries", JSON.stringify(toolEntries));
      } catch (error) {
        console.error("Failed to save audit data to localStorage:", error);
      }
    }
  }, [toolEntries, isHydrated]);

  // Auto-scroll to dashboard when audit completes
  useEffect(() => {
    if (auditResult) {
      const timer = setTimeout(() => {
        document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [auditResult]);

  const scrollToAudit = useCallback(() => {
    document.getElementById("audit")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const updateEntry = (index: number, field: keyof ToolEntry, value: string) => {
    const updated = [...toolEntries];
    updated[index][field] = value;
    
    if (field === "tool") {
      updated[index].plan = "";
    }
    
    setToolEntries(updated);
  };

  const addToolEntry = () => {
    setToolEntries([...toolEntries, { tool: "", plan: "", spend: "", users: "" }]);
  };

  const removeToolEntry = (index: number) => {
    setToolEntries(toolEntries.filter((_, i) => i !== index));
  };

  const { data: session } = useSession();

  const persistAudit = useCallback(async (result: AggregateAuditResult, entries: { tool: string; spend: number; users: number }[]) => {
    if (!session?.user?.id) return;

    try {
      await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalCurrentSpend: result.totalCurrentSpend,
          totalOptimizedSpend: result.totalOptimizedSpend,
          totalSavings: result.totalSavings,
          totalAnnualSavings: result.totalAnnualSavings,
          optimizationScore: result.overallOptimizationScore,
          summary: result.summary,
          resultData: JSON.stringify(result),
          tools: result.tools.map((t) => ({
            name: t.tool,
            status: t.status,
            currentSpend: t.currentSpend,
            optimizedSpend: t.optimizedSpend,
            savings: t.savings,
            recommendation: t.recommendation,
          })),
        }),
      });
    } catch {
      toast.error("Failed to save audit");
    }
  }, [session]);

  return (
    <>
   <section
     id="audit"
     className="mx-auto max-w-5xl px-6 py-24"
   >
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        <h2 className="text-3xl font-bold">
          Start Your AI Spend Audit
        </h2>

        <p className="mt-3 text-gray-400">
          Enter your current AI tooling details to discover savings opportunities.
        </p>

        <div className="mt-8 space-y-4">
          {toolEntries.map((entry, index) => (
            <div key={index} className="rounded-2xl border border-white/10 bg-black/40 p-6">
              <div className="grid gap-4 md:grid-cols-5">
                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    AI Tool
                  </label>
                  <select
                    value={entry.tool}
                    onChange={(e) => updateEntry(index, "tool", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
                  >
                    <option value="">Select</option>
                    {TOOLS.map((tool) => (
                      <option key={tool} value={tool}>
                        {tool}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Plan
                  </label>
                  <select
                    value={entry.plan}
                    onChange={(e) => updateEntry(index, "plan", e.target.value)}
                    disabled={!entry.tool}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30 disabled:opacity-50"
                  >
                    <option value="">Select</option>
                    {entry.tool && TOOL_CONFIGURATION[entry.tool]?.plans.map((plan) => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Monthly Spend ($)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={entry.spend}
                    onChange={(e) => updateEntry(index, "spend", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Seats
                  </label>
                  <input
                    type="number"
                    placeholder="1"
                    value={entry.users}
                    onChange={(e) => updateEntry(index, "users", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition hover:border-white/20 focus:border-white/30"
                  />
                </div>

                <div className="flex items-end">
                  {toolEntries.length > 1 && (
                    <button
                      onClick={() => removeToolEntry(index)}
                      className="w-full rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/20"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addToolEntry}
            className="w-full rounded-2xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-gray-300 transition hover:border-white/40 hover:bg-white/10"
          >
            + Add Another Tool
          </button>

          <button
            onClick={() => {
              const validEntries = toolEntries.filter((entry) => entry.tool);
              
              if (validEntries.length === 0) return;

              setIsGenerating(true);

              requestAnimationFrame(async () => {
                const auditData = generateAggregateAudit(
                  validEntries.map((entry) => ({
                    tool: entry.tool,
                    spend: Number(entry.spend),
                    users: Number(entry.users),
                  }))
                );

                setAuditResult(auditData);
                setResult(auditData);
                setIsGenerating(false);

                await persistAudit(
                  auditData,
                  validEntries.map((entry) => ({
                    tool: entry.tool,
                    spend: Number(entry.spend),
                    users: Number(entry.users),
                  }))
                );
              });
            }}
            disabled={!toolEntries[0].tool || isGenerating}
            className="w-full rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              "Generate Audit"
            )}
          </button>

          {isGenerating && (
            <div className="mt-12 space-y-8">
              <LoadingSkeleton variant="card" count={4} />
              <LoadingSkeleton variant="chart" count={2} />
            </div>
          )}

          {auditResult && <AuditResults result={auditResult} />}
        </div>
      </div>
    </section>

      <AnimatePresence>
        {auditResult && (
          <motion.button
            initial={{ opacity: 0, y: 48, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 48, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={scrollToAudit}
            className="fixed bottom-8 right-8 z-50 flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black shadow-2xl transition hover:opacity-80"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Run New Audit
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}