-- AlterTable: Add Bling ERP fields and erpAtivo selector to User model
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "blingClientId"       TEXT,
  ADD COLUMN IF NOT EXISTS "blingClientSecret"   TEXT,
  ADD COLUMN IF NOT EXISTS "blingAccessToken"    TEXT,
  ADD COLUMN IF NOT EXISTS "blingRefreshToken"   TEXT,
  ADD COLUMN IF NOT EXISTS "blingTokenExpiresAt" BIGINT,
  ADD COLUMN IF NOT EXISTS "erpAtivo"            TEXT;
