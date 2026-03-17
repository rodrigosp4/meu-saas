-- CreateTable
CREATE TABLE "ConfigAtacado" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "faixas" JSONB NOT NULL,

    CONSTRAINT "ConfigAtacado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfigAtacado_userId_key" ON "ConfigAtacado"("userId");

-- AddForeignKey
ALTER TABLE "ConfigAtacado" ADD CONSTRAINT "ConfigAtacado_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
