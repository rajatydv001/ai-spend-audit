"use client";

import { useEffect, useState } from "react";

interface CatalogRow {
  vendor: string;
  product: string;
  plan: string;
  price: number | null;
  currency: string;
  billingType: string;
  billingCadence: string;
  perUser: boolean;
  segment: string;
  power: boolean;
  minSeats: number | null;
  usageModel: string;
  officialPricingUrl: string | null;
  sourceStatus: string;
  lastVerifiedAt: string | null;
  validFrom: string;
  active: unknown;
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  VERIFIED: { text: "Verified", color: "text-green-400" },
  UNVERIFIED: { text: "Not verified", color: "text-yellow-400" },
  STALE: { text: "Stale", color: "text-orange-400" },
  CUSTOM: { text: "Custom / contact sales", color: "text-sky-400" },
};

function fmtPrice(row: CatalogRow): string {
  if (row.billingType === "CUSTOM") return "Custom";
  if (row.billingType === "USAGE") return "Usage-based";
  if (row.price === null) return "—";
  const symbol = row.currency === "USD" ? "$" : `${row.currency} `;
  return `${symbol}${row.price}/mo`;
}

function fmtOffset(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return "today";
  return `${days}d ago`;
}

export default function PricingCatalog() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pricing/catalog")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load catalog");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setRows((data.items as CatalogRow[]) ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <h2 className="text-lg font-bold text-white mb-1">Pricing Catalog &amp; Sources</h2>
      <p className="text-sm text-gray-400 mb-6">
        Prices come from the app&apos;s pricing catalog. Figures marked &ldquo;Not
        verified&rdquo; have not yet been confirmed against the vendor&apos;s official
        page. This is NOT real-time pricing.
      </p>

      {loading && <p className="text-sm text-gray-400">Loading pricing catalog…</p>}
      {error && <p className="text-sm text-red-400">Failed to load: {error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-4">Product / Plan</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Last verified</th>
                <th className="py-2">Pricing source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const status = STATUS_LABEL[row.sourceStatus] ?? {
                  text: row.sourceStatus,
                  color: "text-gray-400",
                };
                return (
                  <tr key={`${row.product}-${row.plan}-${i}`} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-white">
                      <span className="text-gray-400">{row.vendor} </span>
                      {row.product} · {row.plan}
                      {row.billingCadence === "ANNUAL" ? (
                        <span className="text-gray-500"> (annual)</span>
                      ) : null}
                      {row.power ? <span className="text-purple-300/80"> (power)</span> : null}
                      {row.minSeats ? <span className="text-gray-500"> (min {row.minSeats})</span> : null}
                      <span className="ml-2 text-xs text-gray-600">[{row.segment}]</span>
                    </td>
                    <td className="py-2 pr-4 text-white">{fmtPrice(row)}</td>
                    <td className={`py-2 pr-4 ${status.color}`}>{status.text}</td>
                    <td className="py-2 pr-4 text-gray-400">{fmtOffset(row.lastVerifiedAt)}</td>
                    <td className="py-2 text-gray-400">
                      {row.officialPricingUrl ? (
                        <a
                          href={row.officialPricingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          Official pricing ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}