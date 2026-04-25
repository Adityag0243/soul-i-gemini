-- Create enum for admin feature flags
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'FeatureKey'
    ) THEN
        CREATE TYPE "FeatureKey" AS ENUM ('EXPERT_ESCALATION', 'VOICE_INPUT');
    END IF;
END $$;

-- Create table for global feature control toggles
CREATE TABLE IF NOT EXISTS "feature_controls" (
    "id" UUID NOT NULL,
    "feature_key" "FeatureKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_controls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_controls_feature_key_key"
ON "feature_controls"("feature_key");

CREATE INDEX IF NOT EXISTS "feature_controls_enabled_idx"
ON "feature_controls"("enabled");
