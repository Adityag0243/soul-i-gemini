-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "is_complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phase" VARCHAR(100),
ADD COLUMN     "turn_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "coupon_popup_shown" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "free_sessions_completed" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_is_complete_idx" ON "chat_sessions"("user_id", "is_complete");
