-- CreateTable
CREATE TABLE "GrupoMonitoramento" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "skus" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoMonitoramento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConcorrenteAnuncio" (
    "id" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL,
    "estoqueRange" TEXT,
    "vendas" INTEGER NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "permalink" TEXT,
    "sellerId" TEXT,
    "sellerNickname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConcorrenteAnuncio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoHistorico" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrupoMonitoramento_userId_idx" ON "GrupoMonitoramento"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoMonitoramento_userId_nome_key" ON "GrupoMonitoramento"("userId", "nome");

-- CreateIndex
CREATE INDEX "ConcorrenteAnuncio_grupoId_idx" ON "ConcorrenteAnuncio"("grupoId");

-- CreateIndex
CREATE INDEX "PrecoHistorico_itemId_idx" ON "PrecoHistorico"("itemId");

-- CreateIndex
CREATE INDEX "PrecoHistorico_capturedAt_idx" ON "PrecoHistorico"("capturedAt");

-- AddForeignKey
ALTER TABLE "GrupoMonitoramento" ADD CONSTRAINT "GrupoMonitoramento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcorrenteAnuncio" ADD CONSTRAINT "ConcorrenteAnuncio_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoMonitoramento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoHistorico" ADD CONSTRAINT "PrecoHistorico_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ConcorrenteAnuncio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
