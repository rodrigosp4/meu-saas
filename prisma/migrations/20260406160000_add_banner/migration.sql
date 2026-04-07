-- CreateTable
CREATE TABLE "ConfigBanner" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "visivel" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConfigBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannerNotificacao" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannerNotificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BannerNotificacao_ativo_ordem_idx" ON "BannerNotificacao"("ativo", "ordem");

-- Seed: insere o registro singleton do ConfigBanner
INSERT INTO "ConfigBanner" ("id", "visivel") VALUES ('global', false) ON CONFLICT DO NOTHING;
