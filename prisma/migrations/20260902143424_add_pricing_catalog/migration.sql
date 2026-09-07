-- CreateTable
CREATE TABLE "PricingCatalog" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "billingType" TEXT NOT NULL,
    "billingCadence" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "perUser" BOOLEAN NOT NULL DEFAULT true,
    "minSeats" INTEGER,
    "maxSeats" INTEGER,
    "usageModel" TEXT NOT NULL,
    "officialPricingUrl" TEXT,
    "sourceStatus" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingCatalog_vendor_plan_validFrom_validUntil_idx" ON "PricingCatalog"("vendor", "plan", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "PricingCatalog_product_plan_active_idx" ON "PricingCatalog"("product", "plan", "active");

-- CreateIndex
CREATE INDEX "PricingCatalog_vendor_plan_active_idx" ON "PricingCatalog"("vendor", "plan", "active");
