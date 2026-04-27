-- CreateEnum
CREATE TYPE "PracticeMediaType" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "PracticeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "practice_tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "practice_type" TEXT NOT NULL,
    "media_type" "PracticeMediaType" NOT NULL,
    "media_url" TEXT,
    "media_key" TEXT,
    "media_bucket" TEXT,
    "media_original_name" TEXT,
    "media_mime_type" TEXT,
    "media_size_bytes" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PracticeStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "suggest_to_ai" BOOLEAN NOT NULL DEFAULT true,
    "source_sheet_name" TEXT,
    "created_by_admin_id" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_tasks_status_is_active_suggest_to_ai_idx" ON "practice_tasks"("status", "is_active", "suggest_to_ai");

-- CreateIndex
CREATE INDEX "practice_tasks_media_type_is_active_idx" ON "practice_tasks"("media_type", "is_active");

-- CreateIndex
CREATE INDEX "practice_tasks_practice_type_idx" ON "practice_tasks"("practice_type");
