-- Numeração sequencial de chamados
ALTER TABLE "Chamado" ADD COLUMN IF NOT EXISTS "numero" SERIAL;

-- Preenche o numero nos chamados existentes (caso existam)
-- O SERIAL já garante que novos chamados recebam o próximo número automaticamente

-- Adiciona constraint de unicidade
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_numero_key" UNIQUE ("numero");
