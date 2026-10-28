-- Rodar uma vez no banco que já existe:  npx wrangler d1 execute uiracu --remote --file=migracao-extras.sql
ALTER TABLE expenses ADD COLUMN x TEXT;
