-- CreateTable
CREATE TABLE "user_practice_saves" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" INTEGER NOT NULL,
    "practice_id" UUID NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_practice_saves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_practice_saves_user_id_practice_id_key" ON "user_practice_saves"("user_id", "practice_id");

-- CreateIndex
CREATE INDEX "user_practice_saves_user_id_idx" ON "user_practice_saves"("user_id");

-- AddForeignKey
ALTER TABLE "user_practice_saves" ADD CONSTRAINT "user_practice_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_practice_saves" ADD CONSTRAINT "user_practice_saves_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
