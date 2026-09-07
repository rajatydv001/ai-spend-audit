/**
 * Versioned, time-aware AI-tool pricing catalog.
 *
 * This is a PURE, synchronous, in-memory store that the audit engine can use
 * without a DB call (the engine runs client-side). The same data is seeded
 * into the `PricingCatalog` Prisma table so the database is the durable,
 * historical source of truth.
 *
 * Invariants enforced here and by the persistence layer:
 *   - No two overlapping active versions may exist for the same
 *     (vendor, product, plan, billingCadence).
 *   - Monthly and annual are BILLING VARIANTS of the same logical plan, not
 *     separate plan identities. They share a `plan` name and differ only by
 *     `billingCadence`. Uniqueness is therefore keyed on
 *     (vendor, product, plan, billingCadence).
 *   - A price change NEVER overwrites the old record — it closes the old
 *     version's `validUntil` and inserts a new version.
 *   - Active pricing for a date `d` is the version where
 *     validFrom <= d AND (validUntil IS NULL OR d < validUntil).
 *   - Custom and usage-based pricing are never converted to estimated fixed
 *     numeric prices (they carry price = 0 plus a billingType/usageModel flag).
 *   - `segment` + `power` drive downgrade ELIGIBILITY (never just "cheapest is
 *     best"): an organization-tier plan cannot silently drop to a consumer
 *     tier, and heavy "power" tiers (e.g. Claude Max) are not auto-downgraded
 *     to a free tier.
 */

export type SourceStatus = "VERIFIED" | "UNVERIFIED" | "STALE" | "CUSTOM";

export type Segment = "free" | "individual" | "team" | "business" | "enterprise";

export interface PricingVersion {
  vendor: string;
  product: string;
  plan: string;
  billingType: "FLAT" | "PER_USER" | "USAGE" | "CUSTOM";
  billingCadence: "MONTHLY" | "ANNUAL" | "DAILY" | "ONCE" | "USAGE_BASED" | "NONE";
  price: number;
  currency: string;
  perUser: boolean;
  /** Customer segment this tier addresses — used for downgrade eligibility. */
  segment: Segment;
  /** True for heavy "power" tiers that should never auto-downgrade to free. */
  power?: boolean;
  minSeats?: number | null;
  maxSeats?: number | null;
  usageModel: "NONE" | "METERED" | "TOKEN_BASED" | "CREDIT_BASED" | "SEAT_BASED" | "CUSTOM";
  officialPricingUrl?: string | null;
  sourceStatus: SourceStatus;
  lastVerifiedAt?: Date | null;
  validFrom: Date;
  validUntil: Date | null;
}

export function parseDate(value: string): Date {
  const d = new Date(`${value}T00:00:00.000Z`);
  return d;
}

const BASELINE_DATE = parseDate("2025-01-01");

/**
 * Date on which the current verified figures were confirmed against official
 * vendor pages (2026-09-02). Price/plan changes close the prior version on this
 * date and the new, verified version becomes active here. `lastVerifiedAt` is
 * set to this same date for figures confirmed from an official source.
 */
const VERIFIED_DATE = parseDate("2026-09-02");

export const VENDOR_PRICING: PricingVersion[] = [
  // --- ChatGPT (OpenAI) ---
  // Free and Plus are consumer tiers (not listed on the official Business page)
  // and remain UNVERIFIED. Enterprise is contact-sales only (CUSTOM).
  { vendor: "openai", product: "ChatGPT", plan: "Free", billingType: "FLAT", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "free", usageModel: "NONE", officialPricingUrl: "https://openai.com/chatgpt/pricing", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "openai", product: "ChatGPT", plan: "Plus", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://openai.com/chatgpt/pricing", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
  // The official Business page has no consumer "Team" plan. The old $30 Team
  // baseline closes here (kept in history); a VERIFIED "Business" plan replaces
  // it with Standard + Premium seat costs, monthly and annual billing variants.
  { vendor: "openai", product: "ChatGPT", plan: "Team", billingType: "PER_USER", billingCadence: "MONTHLY", price: 30, currency: "USD", perUser: true, segment: "individual", minSeats: 2, usageModel: "NONE", officialPricingUrl: "https://openai.com/business/pricing/", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: VERIFIED_DATE },
  { vendor: "openai", product: "ChatGPT", plan: "Business Standard", billingType: "PER_USER", billingCadence: "MONTHLY", price: 25, currency: "USD", perUser: true, segment: "business", minSeats: 2, maxSeats: 200, usageModel: "SEAT_BASED", officialPricingUrl: "https://openai.com/business/pricing/", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "openai", product: "ChatGPT", plan: "Business Standard", billingType: "PER_USER", billingCadence: "ANNUAL", price: 20, currency: "USD", perUser: true, segment: "business", minSeats: 2, maxSeats: 200, usageModel: "SEAT_BASED", officialPricingUrl: "https://openai.com/business/pricing/", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "openai", product: "ChatGPT", plan: "Business Premium", billingType: "PER_USER", billingCadence: "MONTHLY", price: 125, currency: "USD", perUser: true, segment: "business", minSeats: 2, maxSeats: 200, usageModel: "SEAT_BASED", officialPricingUrl: "https://openai.com/business/pricing/", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "openai", product: "ChatGPT", plan: "Business Premium", billingType: "PER_USER", billingCadence: "ANNUAL", price: 100, currency: "USD", perUser: true, segment: "business", minSeats: 2, maxSeats: 200, usageModel: "SEAT_BASED", officialPricingUrl: "https://openai.com/business/pricing/", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "openai", product: "ChatGPT", plan: "Enterprise", billingType: "CUSTOM", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "enterprise", minSeats: 10, usageModel: "NONE", officialPricingUrl: "https://openai.com/business/pricing/", sourceStatus: "CUSTOM", validFrom: BASELINE_DATE, validUntil: null },

  // --- Claude (Anthropic) ---
  { vendor: "anthropic", product: "Claude", plan: "Free", billingType: "FLAT", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "free", usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "anthropic", product: "Claude", plan: "Pro", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: BASELINE_DATE, validUntil: null },
  // Annual is a billing variant of the SAME "Pro" plan (not a separate plan).
  { vendor: "anthropic", product: "Claude", plan: "Pro", billingType: "PER_USER", billingCadence: "ANNUAL", price: 17, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  // Max (5x) is "from $100/mo" — the old $20 baseline closes; 5x verified at $100.
  { vendor: "anthropic", product: "Claude", plan: "Max", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, segment: "individual", power: true, usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: VERIFIED_DATE },
  { vendor: "anthropic", product: "Claude", plan: "Max", billingType: "PER_USER", billingCadence: "MONTHLY", price: 100, currency: "USD", perUser: true, segment: "individual", power: true, usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "anthropic", product: "Claude", plan: "Max 20x", billingType: "PER_USER", billingCadence: "MONTHLY", price: 200, currency: "USD", perUser: true, segment: "individual", power: true, usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "anthropic", product: "Claude", plan: "Team", billingType: "PER_USER", billingCadence: "MONTHLY", price: 25, currency: "USD", perUser: true, segment: "team", minSeats: 2, maxSeats: 150, usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "anthropic", product: "Claude", plan: "Team", billingType: "PER_USER", billingCadence: "ANNUAL", price: 20, currency: "USD", perUser: true, segment: "team", minSeats: 2, maxSeats: 150, usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "anthropic", product: "Claude", plan: "Enterprise", billingType: "CUSTOM", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "enterprise", minSeats: 10, usageModel: "NONE", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "CUSTOM", validFrom: BASELINE_DATE, validUntil: null },

  // --- Cursor ---
  { vendor: "cursor", product: "Cursor", plan: "Hobby", billingType: "FLAT", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "free", usageModel: "NONE", officialPricingUrl: "https://cursor.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: BASELINE_DATE, validUntil: null },
  // Individual (personal) "Pro" tier. Yearly pricing exists but was not captured
  // on the official page, so only monthly is marked verified — annual is NOT
  // fabricated (a billing toggle existing is not a verified annual price).
  { vendor: "cursor", product: "Cursor", plan: "Individual", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://cursor.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: BASELINE_DATE, validUntil: null },
  // "Teams" plan on the official page is $40/seat/mo; our catalog calls it Business.
  { vendor: "cursor", product: "Cursor", plan: "Business", billingType: "PER_USER", billingCadence: "MONTHLY", price: 40, currency: "USD", perUser: true, segment: "business", minSeats: 3, usageModel: "NONE", officialPricingUrl: "https://cursor.com/pricing", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "cursor", product: "Cursor", plan: "Enterprise", billingType: "CUSTOM", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "enterprise", minSeats: 10, usageModel: "NONE", officialPricingUrl: "https://cursor.com/pricing", sourceStatus: "CUSTOM", validFrom: BASELINE_DATE, validUntil: null },

  // --- GitHub Copilot ---
  // Individual/org semantics split: Free/Pro/Pro+/Max are individual; the old
  // "Individual" $20 baseline closes and is replaced by the verified Pro $10.
  { vendor: "github", product: "Copilot", plan: "Individual", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: VERIFIED_DATE },
  { vendor: "github", product: "Copilot", plan: "Free", billingType: "FLAT", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "free", usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "github", product: "Copilot", plan: "Pro", billingType: "PER_USER", billingCadence: "MONTHLY", price: 10, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "github", product: "Copilot", plan: "Pro+", billingType: "PER_USER", billingCadence: "MONTHLY", price: 39, currency: "USD", perUser: true, segment: "individual", power: true, usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "github", product: "Copilot", plan: "Max", billingType: "PER_USER", billingCadence: "MONTHLY", price: 100, currency: "USD", perUser: true, segment: "individual", power: true, usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "github", product: "Copilot", plan: "Business", billingType: "PER_USER", billingCadence: "MONTHLY", price: 15, currency: "USD", perUser: true, segment: "business", minSeats: 5, usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: VERIFIED_DATE },
  { vendor: "github", product: "Copilot", plan: "Business", billingType: "PER_USER", billingCadence: "MONTHLY", price: 19, currency: "USD", perUser: true, segment: "business", minSeats: 5, usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },
  { vendor: "github", product: "Copilot", plan: "Enterprise", billingType: "PER_USER", billingCadence: "MONTHLY", price: 25, currency: "USD", perUser: true, segment: "enterprise", minSeats: 20, usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: VERIFIED_DATE },
  { vendor: "github", product: "Copilot", plan: "Enterprise", billingType: "PER_USER", billingCadence: "MONTHLY", price: 39, currency: "USD", perUser: true, segment: "enterprise", minSeats: 20, usageModel: "NONE", officialPricingUrl: "https://github.com/features/copilot/plans", sourceStatus: "VERIFIED", lastVerifiedAt: VERIFIED_DATE, validFrom: VERIFIED_DATE, validUntil: null },

  // --- Gemini (Google) ---
  // Official personal Gemini page was unavailable (404/timeout); keep UNVERIFIED.
  { vendor: "google", product: "Gemini", plan: "Free", billingType: "FLAT", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "free", usageModel: "NONE", officialPricingUrl: "https://gemini.google/", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "google", product: "Gemini", plan: "Pro", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://gemini.google/", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "google", product: "Gemini", plan: "Ultra", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://gemini.google/", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },

  // --- Windsurf ---
  // windsurf.com/pricing currently redirects to Devin (Cognition) — a different
  // product identity. Could not be verified against an official Windsurf page —
  // keep UNVERIFIED, not mapped onto Devin's pricing.
  { vendor: "windsurf", product: "Windsurf", plan: "Hobby", billingType: "FLAT", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "free", usageModel: "NONE", officialPricingUrl: "https://windsurf.com/pricing", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "windsurf", product: "Windsurf", plan: "Individual", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, segment: "individual", usageModel: "NONE", officialPricingUrl: "https://windsurf.com/pricing", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "windsurf", product: "Windsurf", plan: "Business", billingType: "PER_USER", billingCadence: "MONTHLY", price: 40, currency: "USD", perUser: true, segment: "business", minSeats: 3, usageModel: "NONE", officialPricingUrl: "https://windsurf.com/pricing", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "windsurf", product: "Windsurf", plan: "Enterprise", billingType: "CUSTOM", billingCadence: "MONTHLY", price: 0, currency: "USD", perUser: true, segment: "enterprise", minSeats: 10, usageModel: "NONE", officialPricingUrl: "https://windsurf.com/pricing", sourceStatus: "CUSTOM", validFrom: BASELINE_DATE, validUntil: null },

  // --- OpenAI / Anthropic API (usage-based; never a fixed monthly price) ---
  // Usage-based (token) pricing is confirmed conceptually, but price = 0 by
  // design means "usage-based", NOT a verified $0/mo figure — keep UNVERIFIED so
  // we never imply a confirmed fixed price.
  { vendor: "openai", product: "OpenAI API", plan: "Pay-as-you-go", billingType: "USAGE", billingCadence: "USAGE_BASED", price: 0, currency: "USD", perUser: false, segment: "free", usageModel: "TOKEN_BASED", officialPricingUrl: "https://openai.com/pricing", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
  { vendor: "anthropic", product: "Anthropic API", plan: "Pay-as-you-go", billingType: "USAGE", billingCadence: "USAGE_BASED", price: 0, currency: "USD", perUser: false, segment: "free", usageModel: "TOKEN_BASED", officialPricingUrl: "https://www.anthropic.com/pricing", sourceStatus: "UNVERIFIED", validFrom: BASELINE_DATE, validUntil: null },
];

/**
 * True when the version shadows `date` per the active-resolution rule.
 */
export function isActiveAt(version: PricingVersion, date: Date): boolean {
  if (version.validFrom > date) return false;
  if (version.validUntil !== null && date >= version.validUntil) return false;
  return true;
}

/**
 * Resolve the single active version for a (vendor, product, plan, cadence) as
 * of `date`. Returns null when no verified/active version exists (missing or
 * future-dated pricing resolves to "not yet active" rather than inventing a
 * price).
 */
export function resolvePricingVersion(
  vendor: string,
  product: string,
  plan: string,
  date: Date,
  versions: PricingVersion[] = VENDOR_PRICING,
  billingCadence: string = "MONTHLY"
): PricingVersion | null {
  const matches = versions.filter(
    (v) =>
      v.vendor === vendor &&
      v.product === product &&
      v.plan === plan &&
      v.billingCadence === billingCadence &&
      isActiveAt(v, date)
  );
  if (matches.length === 0) return null;

  // Latest validFrom wins (guards against duplicate data).
  return matches.sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];
}

/**
 * Detect overlapping active versions — a data-integrity guard. Two versions of
 * the same (vendor, product, plan, billingCadence) overlap only when their time
 * windows actually intersect with exclusive bounds.
 */
export function findOverlappingVersions(
  versions: PricingVersion[]
): Array<{ a: PricingVersion; b: PricingVersion }> {
  const overlaps: Array<{ a: PricingVersion; b: PricingVersion }> = [];
  for (let i = 0; i < versions.length; i++) {
    for (let j = i + 1; j < versions.length; j++) {
      const a = versions[i];
      const b = versions[j];
      const aEnd = a.validUntil === null ? Infinity : a.validUntil.getTime();
      const bEnd = b.validUntil === null ? Infinity : b.validUntil.getTime();
      if (
        a.vendor === b.vendor &&
        a.product === b.product &&
        a.plan === b.plan &&
        a.billingCadence === b.billingCadence &&
        a.validFrom.getTime() < bEnd &&
        b.validFrom.getTime() < aEnd
      ) {
        overlaps.push({ a, b });
      }
    }
  }
  return overlaps;
}

export interface ActiveToolPlan {
  name: string;
  costPerUser: number;
  minUsers?: number;
  /** Customer segment this tier addresses — used for downgrade eligibility. */
  segment: Segment;
  /** True for heavy "power" tiers that should never auto-downgrade to free. */
  power: boolean;
  /** True for CUSTOM (contact-sales) plans — never priced, excluded from
   *  plan optimization because their true cost is unknown. */
  custom: boolean;
  /** True for USAGE-based plans — charged as-you-go, not a fixed seat price. */
  usageBased: boolean;
  /** Billing cadence — the engine resolves plans for the requested cadence. */
  billingCadence: string;
}

/**
 * Return the active pricing plan surface for the audit engine for a tool as of
 * `date`, restricted to a billing cadence (default MONTHLY). Tools are keyed by
 * engine tool name (`product`). CUSTOM and USAGE plans are returned with their
 * flags so callers can exclude them from price optimization.
 */
export function getActiveToolPlans(
  toolName: string,
  date: Date,
  versions: PricingVersion[] = VENDOR_PRICING,
  billingCadence: string = "MONTHLY"
): ActiveToolPlan[] {
  const productPlans = new Set(versions.map((v) => v.product));
  const key = productPlans.has(toolName) ? toolName : "";
  return versions
    .filter(
      (v) =>
        v.product === key &&
        v.billingCadence === billingCadence &&
        isActiveAt(v, date)
    )
    .sort((a, b) => a.plan.localeCompare(b.plan))
    .map((v) => ({
      name: v.plan,
      costPerUser: v.price,
      minUsers: v.minSeats ?? undefined,
      segment: v.segment,
      power: v.power ?? false,
      custom: v.billingType === "CUSTOM",
      usageBased: v.billingType === "USAGE",
      billingCadence: v.billingCadence,
    }));
}

/**
 * Segment-aware downgrade eligibility.
 *
 * "Cheapest is best" is NOT valid. A downgrade to `target` from the current
 * plan `current` is eligible only when:
 *   1. `target` addresses a strictly equal-or-lower customer segment
 *      (free < individual < team < business < enterprise).
 *   2. An organization tier (team/business/enterprise) can never drop to a
 *      consumer (free/individual) tier. Consumer licenses are per-person, so
 *      they are never interchangeable with org seats: multiplying a consumer
 *      plan's per-user price by an org's seat count would fabricate savings.
 *   3. A free tier is only reachable from another free tier or from a
 *      non-power individual tier — never from a team/org tier or a heavy
 *      "power" tier (Claude Max, Copilot Max, etc.).
 */
const SEGMENT_ORDER: Record<Segment, number> = {
  free: 0,
  individual: 1,
  team: 2,
  business: 3,
  enterprise: 4,
};

export function isReplacementValid(
  target: ActiveToolPlan,
  current: ActiveToolPlan
): boolean {
  // Strictly-equal-order only means same segment — that is fine. But a target
  // that is "above" the current segment can never be a downgrade.
  if (SEGMENT_ORDER[target.segment] > SEGMENT_ORDER[current.segment]) return false;

  // Organization tiers (team/business/enterprise) cannot downgrade to
  // consumer/individual/free tiers. A team or org seat is not equivalent to a
  // per-person consumer license, so a consumer plan is never a valid
  // replacement for org seats.
  if (
    current.segment === "team" ||
    current.segment === "business" ||
    current.segment === "enterprise"
  ) {
    if (target.segment === "free" || target.segment === "individual") return false;
  }

  // Free is only reachable from free or from a non-power individual tier.
  if (target.segment === "free") {
    if (current.segment !== "free" && current.segment !== "individual") return false;
    if (current.segment === "individual" && current.power) return false;
  }

  return true;
}