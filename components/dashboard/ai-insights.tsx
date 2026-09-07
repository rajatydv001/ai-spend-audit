"use client";

import { useEffect, useState } from "react";

interface AiInsightsProps {
  auditId: string | null;
  enabled: boolean;
}

export default function AiInsights({ auditId, enabled }: AiInsightsProps) {
  const [insights, setInsights] = useState<string[]>([]);
  const [source, setSource] = useState<"openai" | "generatedOffline" | null>(null);
  const [gated, setGated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Defer state writes past the effect's synchronous phase (the repo's
      // react-hooks/set-state-in-effect rule forbids sync setState in effects).
      await Promise.resolve();

      if (!auditId || !enabled) {
        setInsights([]);
        setSource(null);
        setGated(false);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/ai/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auditId, type: "insights" }),
        });

        if (cancelled) return;

        if (res.status === 403) {
          setGated(true);
          return;
        }
        if (!res.ok) throw new Error("Unable to load AI insights right now.");

        const json = (await res.json()) as {
          data: string[];
          source: "openai" | "generatedOffline";
        };
        setInsights(json.data);
        setSource(json.source);
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auditId, enabled]);

  if (!auditId) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">AI Insights</h2>
        {source && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-gray-400">
            {source === "openai" ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                AI-generated · OpenAI
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Deterministic analysis · generated on-device
              </>
            )}
          </span>
        )}
      </div>

      {gated ? (
        <p className="text-sm text-gray-400">
          AI-powered insights require the Pro plan.{" "}
          <a href="/dashboard/billing" className="text-gray-200 underline underline-offset-2">
            Upgrade to enable them
          </a>
          .
        </p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : loading ? (
        <p className="text-sm text-gray-400">Analyzing spend patterns…</p>
      ) : !insights.length ? (
        <p className="text-sm text-gray-400">Optimization insights will appear here once an audit is selected.</p>
      ) : (
        <ul className="space-y-2">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              {insight}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}