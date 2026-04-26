-- AlterTable
ALTER TABLE "chat_sessions"
    ADD COLUMN "phase" VARCHAR(50),
    ADD COLUMN "energy_node" VARCHAR(50),
    ADD COLUMN "secondary_node" VARCHAR(50),
    ADD COLUMN "commitment_status" VARCHAR(50),
    ADD COLUMN "solution_step" INTEGER,
    ADD COLUMN "solution_complete" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "three_day_task" JSONB,
    ADD COLUMN "three_day_task_assigned_at" TIMESTAMP(3),
    ADD COLUMN "last_activity_at" TIMESTAMP(3),
    ADD COLUMN "channel_type" VARCHAR(20),
    ADD COLUMN "livekit_room_name" VARCHAR(255),
    ADD COLUMN "total_tokens_used" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "mood" VARCHAR(50),
    ADD COLUMN "is_complete" BOOLEAN NOT NULL DEFAULT false;
