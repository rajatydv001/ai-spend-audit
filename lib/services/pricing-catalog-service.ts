import type { PricingCatalog } from "@prisma/client";
import { prisma } from "@/lib/db";
import { VENDOR_PRICING, type Segment, type SourceStatus } from "@/lib/pricing/catalog";

/**
 * Persistence + update layer for the versioned pricing catalog.
 *
 * This mirrors the pure in-memory catalog (`lib/pricing/catalog.ts`) into the
 * `PricingCatalog` table so history is durable. The critical business rule:
 * a price change NEVER overwrites the old record. It closes the previous
 * active version's `validUntil` and inserts a new version that becomes active
 * on its own `validFrom`.
 */

export interface PricingCatalogRecord {
  id: string;
  vendor: string;
  product: string;
  plan: string;
  billingType: string;
  billingCadence: string;
  price: number;
  currency: string;
  perUser: boolean;
  segment: string;
  power: boolean;
  minSeats: number | null;
  maxSeats: number | null;
  usageModel: string;
  officialPricingUrl: string | null;
  sourceStatus: SourceStatus | string;
  lastVerifiedAt: Date | null;
  validFrom: Date;
  validUntil: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function mapToRecord(row: PricingCatalog): PricingCatalogRecord {
  return {
    id: row.id,
    vendor: row.vendor,
    product: row.product,
    plan: row.plan,
    billingType: row.billingType,
    billingCadence: row.billingCadence,
    price: row.price,
    currency: row.currency,
    perUser: row.perUser,
    segment: row.segment,
    power: row.power,
    minSeats: row.minSeats,
    maxSeats: row.maxSeats,
    usageModel: row.usageModel,
    officialPricingUrl: row.officialPricingUrl,
    sourceStatus: row.sourceStatus,
    lastVerifiedAt: row.lastVerifiedAt,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Seed the DB catalog from the authoritative in-memory source. Idempotent:
 * only inserts versions that do not yet exist (tracked by a natural key), so
 * re-seeding never overwrites existing history.
 */
export async function seedPricingCatalog(client = prisma) {
  let created = 0;
  let closed = 0;
  for (const v of VENDOR_PRICING) {
    const naturalKey = {
      vendor: v.vendor,
      product: v.product,
      plan: v.plan,
      billingCadence: v.billingCadence,
      validFrom: v.validFrom,
      price: v.price,
    };
    const existing = await client.pricingCatalog.findFirst({ where: naturalKey });
    if (existing) {
      // Mirror the catalog's version-closing semantics: a record that the
      // authoritative source has closed must not remain "open" in the DB. Also
      // sync verification metadata (same version, not a price change — this is
      // exactly what "mark the active version VERIFIED" means and never inserts
      // a new history row).
      const wantsActive = v.validUntil === null;
      const metaChanged =
        existing.sourceStatus !== v.sourceStatus ||
        existing.lastVerifiedAt?.getTime() !== v.lastVerifiedAt?.getTime() ||
        existing.officialPricingUrl !== v.officialPricingUrl;
      if (
        existing.validUntil?.getTime() !== v.validUntil?.getTime() ||
        existing.active !== wantsActive ||
        existing.segment !== v.segment ||
        existing.power !== (v.power ?? false) ||
        metaChanged
      ) {
        await client.pricingCatalog.update({
          where: { id: existing.id },
          data: {
            validUntil: v.validUntil,
            active: wantsActive,
            segment: v.segment,
            power: v.power ?? false,
            sourceStatus: v.sourceStatus,
            lastVerifiedAt: v.lastVerifiedAt,
            officialPricingUrl: v.officialPricingUrl,
          },
        });
        closed++;
      }
      continue;
    }

    await client.pricingCatalog.create({
      data: {
        vendor: v.vendor,
        product: v.product,
        plan: v.plan,
        billingType: v.billingType,
        billingCadence: v.billingCadence,
        price: v.price,
        currency: v.currency,
        perUser: v.perUser,
        segment: v.segment,
        power: v.power ?? false,
        minSeats: v.minSeats,
        maxSeats: v.maxSeats,
        usageModel: v.usageModel,
        officialPricingUrl: v.officialPricingUrl,
        sourceStatus: v.sourceStatus,
        lastVerifiedAt: v.lastVerifiedAt,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        active: v.validUntil === null,
      },
    });
    created++;
  }

  // Close any DB-active version whose (vendor, product, plan, cadence) no longer
  // exists in the authoritative catalog (e.g. a plan that was renamed or removed).
  // This keeps the DB mirroring the in-memory catalog exactly and prevents stale
  // open plans from lingering as "active".
  const expectedActiveKeys = new Set(
    VENDOR_PRICING.filter((v) => v.validUntil === null).map(
      (v) => `${v.vendor}|${v.product}|${v.plan}|${v.billingCadence}`
    )
  );
  const dbActive = await client.pricingCatalog.findMany({
    where: { active: true },
  });
  for (const row of dbActive) {
    const key = `${row.vendor}|${row.product}|${row.plan}|${row.billingCadence}`;
    if (!expectedActiveKeys.has(key)) {
      await client.pricingCatalog.update({
        where: { id: row.id },
        data: { active: false, validUntil: new Date() },
      });
      closed++;
    }
  }

  return { created, closed };
}

/**
 * Resolve the single active pricing version for a (vendor, product, plan) as of
 * `date`, applying the same rules as the pure resolver: active iff
 * validFrom <= date AND (validUntil IS NULL OR date < validUntil).
 */
export async function resolveActivePricing(
  vendor: string,
  product: string,
  plan: string,
  date: Date = new Date(),
  client = prisma
): Promise<PricingCatalogRecord | null> {
  const candidates = await client.pricingCatalog.findMany({
    where: {
      vendor,
      product,
      plan,
      validFrom: { lte: date },
    },
    orderBy: { validFrom: "desc" },
  });

  const active = candidates.find((c) => c.validUntil === null || date < c.validUntil);
  return active ? mapToRecord(active) : null;
}

/**
 * Throw-aware active resolution used by audit tooling.
 */
export async function requireActivePricing(
  vendor: string,
  product: string,
  plan: string,
  date: Date = new Date(),
  client = prisma
): Promise<PricingCatalogRecord> {
  const record = await resolveActivePricing(vendor, product, plan, date, client);
  if (!record) {
    throw new Error(
      `No active verified pricing for ${product} / ${plan} as of ${date.toISOString()}. ` +
        "Refusing to invent an unverified price."
    );
  }
  return record;
}

export interface PriceChangeInput {
  vendor: string;
  product: string;
  plan: string;
  effectiveDate: Date;
  price: number;
  currency?: string;
  billingType?: "FLAT" | "PER_USER" | "USAGE" | "CUSTOM";
  billingCadence?: string;
  perUser?: boolean;
  segment?: Segment;
  power?: boolean;
  minSeats?: number | null;
  usageModel?: string;
  officialPricingUrl?: string | null;
  sourceStatus?: SourceStatus;
  lastVerifiedAt?: Date;
}

/**
 * Apply a price change WITHOUT overwriting history.
 *
 * Rules:
 *   - If there is an active version whose `validFrom` precedes the new
 *     effective date and is still open (validUntil IS NULL) or extends past it,
 *     its `validUntil` is closed to `effectiveDate`.
 *   - A NEW version is inserted with validFrom = effectiveDate and an open end.
 *   - The new price stays inactive until effectiveDate (no prediction).
 *   - Custom/usage pricing is passed through — never converted to a numeric
 *     estimate: the caller sets a CUSTOM/USAGE billingType and price 0, and we
 *     honor it verbatim.
 */
export async function applyPriceChange(
  input: PriceChangeInput,
  client = prisma
): Promise<{ oldVersion: PricingCatalogRecord | null; newVersion: PricingCatalogRecord }> {
  const { vendor, product, plan, effectiveDate } = input;

  // Close the currently-open previous active version if any.
  const openPrev = await client.pricingCatalog.findMany({
    where: {
      vendor,
      product,
      plan,
      active: true,
      validUntil: null,
    },
  });

  let oldVersion: PricingCatalogRecord | null = null;
  for (const prev of openPrev) {
    if (prev.validFrom < effectiveDate) {
      const updated = await client.pricingCatalog.update({
        where: { id: prev.id },
        data: { validUntil: effectiveDate, active: false },
      });
      oldVersion = mapToRecord(updated);
    }
  }

  const created = await client.pricingCatalog.create({
    data: {
      vendor,
      product,
      plan,
      billingType: input.billingType ?? "PER_USER",
      billingCadence: input.billingCadence ?? "MONTHLY",
      price: input.price,
      currency: input.currency ?? "USD",
      perUser: input.perUser ?? true,
      segment: input.segment ?? "individual",
      power: input.power ?? false,
      minSeats: input.minSeats ?? null,
      usageModel: input.usageModel ?? "NONE",
      officialPricingUrl: input.officialPricingUrl ?? null,
      sourceStatus: input.sourceStatus ?? "UNVERIFIED",
      lastVerifiedAt: input.lastVerifiedAt ?? null,
      validFrom: effectiveDate,
      validUntil: null,
      active: true,
    },
  });

  return { oldVersion, newVersion: mapToRecord(created) };
}

/**
 * List every version for a (vendor, product, plan), most recent first — used by
 * the UI to render pricing transparency and history.
 */
export async function listPricingVersions(
  vendor?: string,
  product?: string,
  client = prisma
): Promise<PricingCatalogRecord[]> {
  const rows = await client.pricingCatalog.findMany({
    where: {
      ...(vendor ? { vendor } : {}),
      ...(product ? { product } : {}),
    },
    orderBy: [{ vendor: "asc" }, { product: "asc" }, { plan: "asc" }, { validFrom: "desc" }],
  });
  return rows.map(mapToRecord);
}