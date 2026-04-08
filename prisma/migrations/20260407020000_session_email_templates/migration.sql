-- Controle de sessão única por dispositivo
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeSessionId" TEXT;

-- Templates de e-mail configuráveis pelo admin
CREATE TABLE IF NOT EXISTS "EmailTemplate" (
    "id"        TEXT NOT NULL,
    "nome"      TEXT NOT NULL,
    "assunto"   TEXT NOT NULL,
    "corpo"     TEXT NOT NULL,
    "ativo"     BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
