-- Rodar uma vez no banco que já existe:  npx wrangler d1 execute uiracu --remote --file=migracao-bot3.sql
ALTER TABLE users ADD COLUMN owner TEXT;
ALTER TABLE users ADD COLUMN apelido TEXT;
ALTER TABLE users ADD COLUMN backup_on INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_backup TEXT;
CREATE TABLE IF NOT EXISTS lembretes (id TEXT PRIMARY KEY, user TEXT NOT NULL, ts TEXT NOT NULL, h INTEGER NOT NULL DEFAULT 8, txt TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS lem_user ON lembretes(user, done, ts);
