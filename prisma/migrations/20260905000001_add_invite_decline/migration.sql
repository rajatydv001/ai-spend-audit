-- AlterTable
ALTER TABLE "Invite" ADD COLUMN "declinedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Invite_organizationId_idx" ON "Invite"("organizationId");