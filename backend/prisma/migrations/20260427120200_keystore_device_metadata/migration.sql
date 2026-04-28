-- AlterTable
ALTER TABLE "keystores" ADD COLUMN "device_name" TEXT,
ADD COLUMN "platform" TEXT,
ADD COLUMN "app_version" TEXT,
ADD COLUMN "ip_address" TEXT,
ADD COLUMN "last_seen_at" TIMESTAMP(3);
