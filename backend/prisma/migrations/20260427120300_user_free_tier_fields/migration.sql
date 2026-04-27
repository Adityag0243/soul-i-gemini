-- AlterTable
-- NOTE: These columns may already exist from 20260425103854_add_free_session_tracking.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "free_sessions_completed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "coupon_popup_shown" BOOLEAN NOT NULL DEFAULT false;
