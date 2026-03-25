-- CreateTable
CREATE TABLE "ConfigGlobal" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultFeatureFlags" JSONB,
    "defaultResourceFlags" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigGlobal_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "resourceFlags" JSONB;
