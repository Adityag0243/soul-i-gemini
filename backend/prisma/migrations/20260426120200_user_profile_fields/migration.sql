-- AlterTable
ALTER TABLE "users"
    ADD COLUMN "call_name" VARCHAR(100),
    ADD COLUMN "avatar_url" TEXT,
    ADD COLUMN "country" VARCHAR(2),
    ADD COLUMN "timezone" VARCHAR(64),
    ADD COLUMN "locale" VARCHAR(10),
    ADD COLUMN "date_of_birth" DATE,
    ADD COLUMN "gender" VARCHAR(50),
    ADD COLUMN "preferred_voice" VARCHAR(100),
    ADD COLUMN "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "last_active_at" TIMESTAMP(3);
