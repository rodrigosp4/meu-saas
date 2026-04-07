-- CreateTable
CREATE TABLE "Cupom" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usoMaximo" INTEGER,
    "usoAtual" INTEGER NOT NULL DEFAULT 0,
    "expiraEm" TIMESTAMP(3),
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cupom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CupomResgate" (
    "id" TEXT NOT NULL,
    "cupomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assinaturaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CupomResgate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Assinatura" ADD COLUMN "cupomId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Cupom_codigo_key" ON "Cupom"("codigo");

-- CreateIndex
CREATE INDEX "CupomResgate_userId_idx" ON "CupomResgate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CupomResgate_cupomId_userId_key" ON "CupomResgate"("cupomId", "userId");

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_cupomId_fkey" FOREIGN KEY ("cupomId") REFERENCES "Cupom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CupomResgate" ADD CONSTRAINT "CupomResgate_cupomId_fkey" FOREIGN KEY ("cupomId") REFERENCES "Cupom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
