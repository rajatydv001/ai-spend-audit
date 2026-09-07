-- Drop the never-read mirror columns on Subscription. Limits are derived
-- solely from PLAN_CONFIG + entitlement counts at read time.
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "auditLimit";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "exportLimit";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "aiRecommendations";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "teamCollaboration";