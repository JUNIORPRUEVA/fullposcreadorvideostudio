ALTER TABLE "Asset"
  ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "objectKey" TEXT,
  ADD COLUMN "originalFilename" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "metadata" TEXT;

ALTER TABLE "RenderJob"
  ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "objectKey" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "checksum" TEXT;
