-- Add new enum values to SubscriptionStatus.
-- MUST be outside a transaction for Postgres to allow immediate use.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';
