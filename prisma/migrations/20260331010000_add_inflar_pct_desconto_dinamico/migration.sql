-- AlterTable: add inflarPct to AnuncioML
ALTER TABLE "AnuncioML" ADD COLUMN "inflarPct" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: add usarDescontoDinamico to MonitorPromoConfig
ALTER TABLE "MonitorPromoConfig" ADD COLUMN "usarDescontoDinamico" BOOLEAN NOT NULL DEFAULT false;
