-- AlterTable
-- NOTE: phase, is_complete, and turn_count already exist from 20260425103854_add_free_session_tracking.
ALTER TABLE "chat_sessions"
    ADD COLUMN IF NOT EXISTS "energy_node" VARCHAR(50),
    ADD COLUMN IF NOT EXISTS "secondary_node" VARCHAR(50),
    ADD COLUMN IF NOT EXISTS "commitment_status" VARCHAR(50),
    ADD COLUMN IF NOT EXISTS "solution_step" INTEGER,
    ADD COLUMN IF NOT EXISTS "solution_complete" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "three_day_task" JSONB,
    ADD COLUMN IF NOT EXISTS "three_day_task_assigned_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "channel_type" VARCHAR(20),
    ADD COLUMN IF NOT EXISTS "livekit_room_name" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "total_tokens_used" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "mood" VARCHAR(50),
    ADD COLUMN IF NOT EXISTS "phase" VARCHAR(50),
    ADD COLUMN IF NOT EXISTS "is_complete" BOOLEAN NOT NULL DEFAULT false;
