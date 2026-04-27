-- CreateTable
CREATE TABLE "practice_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" INTEGER NOT NULL,
    "practice_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATE NOT NULL,
    "completed_at" TIMESTAMP(3),
    "source" VARCHAR(50),

    CONSTRAINT "practice_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_assignments_user_id_idx" ON "practice_assignments"("user_id");

-- CreateIndex
CREATE INDEX "practice_assignments_user_id_due_date_idx" ON "practice_assignments"("user_id", "due_date");

-- AddForeignKey
ALTER TABLE "practice_assignments" ADD CONSTRAINT "practice_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_assignments" ADD CONSTRAINT "practice_assignments_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
