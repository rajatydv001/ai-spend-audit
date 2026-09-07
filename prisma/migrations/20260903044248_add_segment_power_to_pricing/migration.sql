-- AlterTable
ALTER TABLE "PricingCatalog" ADD COLUMN     "power" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "segment" TEXT NOT NULL DEFAULT 'individual';
