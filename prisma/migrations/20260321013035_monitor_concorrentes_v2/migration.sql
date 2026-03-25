-- CreateTable
CREATE TABLE "LojaMonitorada" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "nivel" TEXT,
    "reputacaoData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LojaMonitorada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LojaMonitorada_userId_idx" ON "LojaMonitorada"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LojaMonitorada_userId_sellerId_key" ON "LojaMonitorada"("userId", "sellerId");

-- AddForeignKey
ALTER TABLE "LojaMonitorada" ADD CONSTRAINT "LojaMonitorada_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
