-- AlterTable AnuncioML: adiciona toleranciaPromo para persistir o excedente aceito por item
ALTER TABLE "AnuncioML" ADD COLUMN "toleranciaPromo" DOUBLE PRECISION NOT NULL DEFAULT 0;
