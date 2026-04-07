-- CreateEnum
CREATE TYPE "ChamadoStatus" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_USUARIO', 'RESOLVIDO', 'FECHADO');

-- CreateTable
CREATE TABLE "Chamado" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ChamadoStatus" NOT NULL DEFAULT 'ABERTO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensagemChamado" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemChamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnexoChamado" (
    "id" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnexoChamado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chamado_userId_idx" ON "Chamado"("userId");

-- CreateIndex
CREATE INDEX "Chamado_status_idx" ON "Chamado"("status");

-- CreateIndex
CREATE INDEX "MensagemChamado_chamadoId_idx" ON "MensagemChamado"("chamadoId");

-- CreateIndex
CREATE INDEX "AnexoChamado_mensagemId_idx" ON "AnexoChamado"("mensagemId");

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemChamado" ADD CONSTRAINT "MensagemChamado_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemChamado" ADD CONSTRAINT "MensagemChamado_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnexoChamado" ADD CONSTRAINT "AnexoChamado_mensagemId_fkey" FOREIGN KEY ("mensagemId") REFERENCES "MensagemChamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
