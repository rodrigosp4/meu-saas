-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'OPERATOR', 'VIEWER', 'SUPPORT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentUserId" TEXT,
ADD COLUMN     "permissoesCustom" JSONB,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'OWNER',
ADD COLUMN     "suporteAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suporteExpira" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SessaoSuporte" (
    "id" TEXT NOT NULL,
    "suporteUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SessaoSuporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessaoSuporte_suporteUserId_idx" ON "SessaoSuporte"("suporteUserId");

-- CreateIndex
CREATE INDEX "SessaoSuporte_targetUserId_idx" ON "SessaoSuporte"("targetUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoSuporte" ADD CONSTRAINT "SessaoSuporte_suporteUserId_fkey" FOREIGN KEY ("suporteUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoSuporte" ADD CONSTRAINT "SessaoSuporte_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
