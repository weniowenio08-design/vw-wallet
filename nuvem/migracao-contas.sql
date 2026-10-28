-- Rodar uma vez no banco que já existe:  npx wrangler d1 execute uiracu --remote --file=migracao-contas.sql
ALTER TABLE expenses ADD COLUMN w TEXT NOT NULL DEFAULT 'p';
ALTER TABLE users ADD COLUMN modo TEXT NOT NULL DEFAULT 'p';
ALTER TABLE users ADD COLUMN saldos TEXT;
