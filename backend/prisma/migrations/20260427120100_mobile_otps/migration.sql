-- CreateEnum
CREATE TYPE "MobileOtpIntent" AS ENUM ('LOGIN', 'LINK');

-- CreateTable
CREATE TABLE "mobile_otps" (
    "id" UUID NOT NULL,
    "mobile_number" VARCHAR(20) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "intent" "MobileOtpIntent" NOT NULL,
    "user_id" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mobile_otps_mobile_number_created_at_idx" ON "mobile_otps"("mobile_number", "created_at");

-- CreateIndex
CREATE INDEX "mobile_otps_user_id_idx" ON "mobile_otps"("user_id");

-- AddForeignKey
ALTER TABLE "mobile_otps" ADD CONSTRAINT "mobile_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
