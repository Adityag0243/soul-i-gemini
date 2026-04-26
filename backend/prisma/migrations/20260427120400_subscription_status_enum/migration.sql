-- Add new enum values to SubscriptionStatus
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';

-- Backfill FREE → INACTIVE (must commit the ALTER TYPE first in Postgres,
-- so we wrap the UPDATE in a separate statement; Prisma runs each statement
-- sequentially within the migration).
UPDATE "user_subscriptions" SET "status" = 'INACTIVE' WHERE "status" = 'FREE';

-- Change default from FREE to INACTIVE
ALTER TABLE "user_subscriptions" ALTER COLUMN "status" SET DEFAULT 'INACTIVE'::"SubscriptionStatus";

-- Note: Postgres does not support removing enum values. The 'FREE' value
-- remains in the type but is no longer used. Application code should treat
-- INACTIVE as the canonical replacement.
