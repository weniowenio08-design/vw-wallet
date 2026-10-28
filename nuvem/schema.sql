-- Banco D1 do Uiraçu. Aplicar uma vez:  npx wrangler d1 execute uiracu --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,          -- só o hash do token que fica no celular
  wa TEXT UNIQUE,                           -- número vinculado, normalizado (13 dígitos no Brasil)
  wa_raw TEXT,                              -- como o WhatsApp entrega o número (usado para responder)
  created INTEGER NOT NULL,
  report_on INTEGER NOT NULL DEFAULT 0,
  report_day INTEGER NOT NULL DEFAULT 30,
  report_hour INTEGER NOT NULL DEFAULT 8,   -- horário de Brasília
  last_report TEXT,                         -- "AAAA-MM-D" do último envio automático
  last_inbound INTEGER,                     -- última mensagem do usuário (janela de 24 h do WhatsApp)
  pending_report TEXT,                      -- "AAAA-MM": relatório que espera uma resposta para ser entregue
  push TEXT NOT NULL DEFAULT '[]',          -- inscrições de aviso push (JSON)
  ai_day TEXT, ai_n INTEGER NOT NULL DEFAULT 0,
  weekly_on INTEGER NOT NULL DEFAULT 0,     -- resumo semanal (domingo, 18h de Brasília)
  last_weekly TEXT,                         -- data do último resumo enviado
  tg TEXT,                                  -- id do usuário no Telegram (vínculo)
  tg_chat TEXT                              -- chat privado do Telegram (onde o robô responde e escreve primeiro)
);
CREATE TABLE IF NOT EXISTS expenses (
  user TEXT NOT NULL, id TEXT NOT NULL,
  ts TEXT NOT NULL,                         -- AAAA-MM-DD
  v REAL NOT NULL, c TEXT NOT NULL, d TEXT NOT NULL DEFAULT '',
  tp TEXT NOT NULL,                         -- gasto | receita
  src TEXT NOT NULL,                        -- app | wa
  deleted INTEGER NOT NULL DEFAULT 0,
  upd INTEGER NOT NULL,                     -- hora do servidor (ms) da última alteração
  PRIMARY KEY (user, id)
);
CREATE INDEX IF NOT EXISTS ex_upd ON expenses(user, upd);
CREATE INDEX IF NOT EXISTS ex_ts ON expenses(user, ts);
CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, user TEXT NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, t INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tg ON users(tg) WHERE tg IS NOT NULL;
