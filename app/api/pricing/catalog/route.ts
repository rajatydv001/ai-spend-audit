import { NextResponse } from "next/server";
import type { PricingCatalogRecord } from "@/lib/services/pricing-catalog-service";
import {
  applyPriceChange,
  listPricingVersions,
} from "@/lib/services/pricing-catalog-service";
import { requireUserId } from "@/lib/auth/dal";
import { requirePlatformAdmin, requireRole } from "@/lib/auth/authorization";
import { parseBody, withErrorHandling } from "@/lib/errors";
import { priceChangeSchema } from "@/lib/validation/schemas";

/**
 * GET /api/pricing/catalog
 * Returns the current active, verified pricing for every vendor/product plus
 * full version history. Readable by any signed-in role (transparency).
 */
export const GET = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  await requireRole(userId, "ADMIN", "ANALYST", "VIEWER");

  const url = new URL(request.url);
  const asOf = url.searchParams.get("asOf");
  const date = asOf ? new Date(asOf) : new Date();

  const versions = await listPricingVersions();
  // Build the transparency surface: unique vendor/product/plan/billingCadence
  // (monthly and annual are billing variants of the same plan) with the version
  // ACTIVE AS OF `date` and the full version trail. `listPricingVersions`
  // returns versions newest-first, so the active-as-of selection must resolve
  // the historical window explicitly — never assume the newest version is what
  // was active at `asOf`.
  const key = (v: PricingCatalogRecord) =>
    `${v.vendor}|${v.product}|${v.plan}|${v.billingCadence}`;
  const grouped: Record<string, PricingCatalogRecord[]> = {};
  for (const v of versions) {
    const k = key(v);
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(v);
  }

  const rows = Object.values(grouped).map((vs) => {
    const history = [...vs].sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
    const active =
      history.find(
        (v) => v.validFrom <= date && (v.validUntil === null || date < v.validUntil)
      ) ?? null;
    const base = active ?? history[0];
    return {
      vendor: base.vendor,
      product: base.product,
      plan: base.plan,
      price: active?.price ?? null,
      currency: base.currency,
      billingType: base.billingType,
      billingCadence: base.billingCadence,
      perUser: base.perUser,
      segment: base.segment,
      power: base.power,
      minSeats: base.minSeats,
      usageModel: base.usageModel,
      officialPricingUrl: base.officialPricingUrl,
      sourceStatus: base.sourceStatus,
      lastVerifiedAt: base.lastVerifiedAt,
      validFrom: base.validFrom,
      active,
      history: history.map((v) => ({
        price: v.price,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        billingCadence: v.billingCadence,
      })),
    };
  });

  rows.sort((a, b) => (a.product < b.product ? -1 : a.product > b.product ? 1 : 0));

  return NextResponse.json({ asOf: date.toISOString(), items: rows });
});

/**
 * POST /api/pricing/catalog
 * Applies a verified price change by CLOSING the current active version and
 * INSERTING a new one (never overwrites history). Platform admin only.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const userId = await requireUserId();
  await requirePlatformAdmin(userId);

  const body = await parseBody(request, priceChangeSchema);

  const result = await applyPriceChange({
    vendor: body.vendor,
    product: body.product,
    plan: body.plan,
    effectiveDate: body.effectiveDate,
    price: body.price,
    billingType: body.billingType,
    billingCadence: body.billingCadence,
    currency: body.currency,
    perUser: body.perUser,
    segment: body.segment,
    power: body.power,
    minSeats: body.minSeats,
    usageModel: body.usageModel,
    officialPricingUrl: body.officialPricingUrl,
    sourceStatus: body.sourceStatus,
    lastVerifiedAt: body.lastVerifiedAt,
  });

  return NextResponse.json(result, { status: 201 });
});
export const runtime = "nodejs";
