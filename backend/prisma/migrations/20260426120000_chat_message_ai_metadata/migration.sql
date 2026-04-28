-- AlterTable
ALTER TABLE "chat_messages"
    ADD COLUMN "phase" VARCHAR(50),
    ADD COLUMN "energy_node" VARCHAR(50),
    ADD COLUMN "secondary_node" VARCHAR(50),
    ADD COLUMN "node_reasoning" TEXT,
    ADD COLUMN "turn_count" INTEGER,
    ADD COLUMN "solution_step" INTEGER,
    ADD COLUMN "rag_sources" JSONB,
    ADD COLUMN "detected_emotion" VARCHAR(100),
    ADD COLUMN "audio_url" TEXT,
    ADD COLUMN "duration_ms" INTEGER;
