-- Convites individuais (uso único, vencem em 7 dias). Rodar uma vez no banco que já existe:
--   npx wrangler d1 execute uiracu --remote --file=migracao-convites.sql
-- Só o hash do código fica guardado; o código aparece uma única vez, no app do dono, ao ser gerado.
CREATE TABLE IF NOT EXISTS invites (
  code_hash TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  exp INTEGER NOT NULL,
  used_by TEXT,
  used_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0
);
