-- AlterTable
ALTER TABLE "users" ADD COLUMN "free_sessions_completed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "coupon_popup_shown" BOOLEAN NOT NULL DEFAULT false;
