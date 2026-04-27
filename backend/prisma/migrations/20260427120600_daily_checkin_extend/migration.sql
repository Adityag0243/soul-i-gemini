-- Add new columns to daily_checkins
ALTER TABLE "daily_checkins" ADD COLUMN "date" DATE;
ALTER TABLE "daily_checkins" ADD COLUMN "voice_reflection" TEXT;
ALTER TABLE "daily_checkins" ADD COLUMN "audio_url" VARCHAR(500);
ALTER TABLE "daily_checkins" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill date from created_at for existing rows
UPDATE "daily_checkins" SET "date" = DATE("created_at") WHERE "date" IS NULL;

-- Make date NOT NULL after backfill
ALTER TABLE "daily_checkins" ALTER COLUMN "date" SET NOT NULL;

-- Add unique constraint on (user_id, date)
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_user_id_date_key" UNIQUE ("user_id", "date");
