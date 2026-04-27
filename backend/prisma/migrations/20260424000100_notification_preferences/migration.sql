-- Create table to store per-user notification toggle settings.
CREATE TABLE IF NOT EXISTS "user_notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "daily_check_in_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_notification_preferences_user_id_key"
ON "user_notification_preferences"("user_id");

CREATE INDEX IF NOT EXISTS "user_notification_preferences_daily_check_in_enabled_idx"
ON "user_notification_preferences"("daily_check_in_enabled");

CREATE INDEX IF NOT EXISTS "user_notification_preferences_reminders_enabled_idx"
ON "user_notification_preferences"("reminders_enabled");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'user_notification_preferences_user_id_fkey'
          AND table_name = 'user_notification_preferences'
    ) THEN
        ALTER TABLE "user_notification_preferences"
        ADD CONSTRAINT "user_notification_preferences_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
