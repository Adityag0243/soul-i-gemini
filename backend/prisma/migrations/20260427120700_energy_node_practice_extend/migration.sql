-- EnergyNode: add slug, color, icon
ALTER TABLE "energy_nodes" ADD COLUMN "slug" VARCHAR(50);
ALTER TABLE "energy_nodes" ADD COLUMN "color" VARCHAR(20);
ALTER TABLE "energy_nodes" ADD COLUMN "icon" VARCHAR(100);

-- Backfill slug from title (lowercase, replace spaces with hyphens)
UPDATE "energy_nodes" SET "slug" = LOWER(REPLACE("title", ' ', '-')) WHERE "slug" IS NULL;

-- Make slug NOT NULL + unique
ALTER TABLE "energy_nodes" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "energy_nodes" ADD CONSTRAINT "energy_nodes_slug_key" UNIQUE ("slug");

-- Practice: add type, description columns
ALTER TABLE "practices" ADD COLUMN "type" VARCHAR(50);
ALTER TABLE "practices" ADD COLUMN "description" TEXT;

-- Index on practice type
CREATE INDEX "practices_type_idx" ON "practices"("type");
