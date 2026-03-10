-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "tinyToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificacaoPreco" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resultados" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificacaoPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaML" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "logistica" TEXT NOT NULL DEFAULT 'ME2',

    CONSTRAINT "ContaML_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnuncioML" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "sku" TEXT,
    "titulo" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL,
    "precoOriginal" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "estoque" INTEGER NOT NULL,
    "vendas" INTEGER NOT NULL DEFAULT 0,
    "visitas" INTEGER NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "permalink" TEXT,
    "dadosML" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tagPrincipal" TEXT,

    CONSTRAINT "AnuncioML_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegraPreco" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "variaveis" JSONB NOT NULL,
    "precoBase" TEXT NOT NULL DEFAULT 'promocional',

    CONSTRAINT "RegraPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL,
    "estoque" INTEGER NOT NULL,
    "statusML" TEXT NOT NULL DEFAULT 'Não Publicado',
    "dadosTiny" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilCompatibilidade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "compatibilidadesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilCompatibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarefaFila" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "tipo" TEXT NOT NULL,
    "alvo" TEXT,
    "conta" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "detalhes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarefaFila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerguntaML" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "compradorId" TEXT,
    "textoPergunta" TEXT NOT NULL,
    "textoResposta" TEXT,
    "status" TEXT NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL,
    "dataResposta" TIMESTAMP(3),
    "dadosML" JSONB,

    CONSTRAINT "PerguntaML_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoML" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sub_type" TEXT,
    "status" TEXT NOT NULL,
    "nome" TEXT,
    "startDate" TIMESTAMP(3),
    "finishDate" TIMESTAMP(3),
    "deadline_date" TIMESTAMP(3),
    "itens" JSONB,
    "benefits" JSONB,
    "dadosML" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoML_pkey" PRIMARY KEY ("id","contaId")
);

-- CreateTable
CREATE TABLE "RegraOrquestrador" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tiposPermitidos" TEXT[],
    "maxSellerPct" DOUBLE PRECISION NOT NULL,
    "tolerancia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegraOrquestrador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificacaoPreco_userId_key" ON "VerificacaoPreco"("userId");

-- CreateIndex
CREATE INDEX "AnuncioML_contaId_idx" ON "AnuncioML"("contaId");

-- CreateIndex
CREATE INDEX "AnuncioML_tagPrincipal_idx" ON "AnuncioML"("tagPrincipal");

-- CreateIndex
CREATE INDEX "Produto_userId_idx" ON "Produto"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_userId_sku_key" ON "Produto"("userId", "sku");

-- CreateIndex
CREATE INDEX "PerfilCompatibilidade_userId_idx" ON "PerfilCompatibilidade"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilCompatibilidade_userId_nome_key" ON "PerfilCompatibilidade"("userId", "nome");

-- CreateIndex
CREATE INDEX "PerguntaML_contaId_status_idx" ON "PerguntaML"("contaId", "status");

-- CreateIndex
CREATE INDEX "PerguntaML_itemId_idx" ON "PerguntaML"("itemId");

-- CreateIndex
CREATE INDEX "PromoML_contaId_idx" ON "PromoML"("contaId");

-- CreateIndex
CREATE INDEX "PromoML_tipo_idx" ON "PromoML"("tipo");

-- CreateIndex
CREATE INDEX "PromoML_status_idx" ON "PromoML"("status");

-- CreateIndex
CREATE INDEX "RegraOrquestrador_userId_idx" ON "RegraOrquestrador"("userId");

-- AddForeignKey
ALTER TABLE "VerificacaoPreco" ADD CONSTRAINT "VerificacaoPreco_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaML" ADD CONSTRAINT "ContaML_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnuncioML" ADD CONSTRAINT "AnuncioML_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaML"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraPreco" ADD CONSTRAINT "RegraPreco_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilCompatibilidade" ADD CONSTRAINT "PerfilCompatibilidade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarefaFila" ADD CONSTRAINT "TarefaFila_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerguntaML" ADD CONSTRAINT "PerguntaML_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaML"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoML" ADD CONSTRAINT "PromoML_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaML"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraOrquestrador" ADD CONSTRAINT "RegraOrquestrador_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

