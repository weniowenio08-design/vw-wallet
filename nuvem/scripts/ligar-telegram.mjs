// Liga o bot do Telegram ao Uiraçu. Uso (no PowerShell, pasta nuvem):  node scripts/ligar-telegram.mjs
// 1) Pede o token do bot (o que o @BotFather entregou). 2) Guarda o token e um segredo do webhook no Cloudflare (sem mostrar).
// 3) Registra o webhook e os comandos no Telegram. 4) Grava o @usuário do bot no wrangler.toml e republica o servidor.
import { spawnSync } from "node:child_process";
import readline from "node:readline";
import crypto from "node:crypto";
import fs from "node:fs";

const toml = new URL("../wrangler.toml", import.meta.url);
const base = "https://uiracu-nuvem.uiracu.workers.dev";
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });
const put = (nome, valor) => { const r = spawnSync("npx", ["wrangler", "secret", "put", nome], { input: valor, encoding: "utf8", shell: true }); if (r.status !== 0) throw new Error("Não consegui guardar " + nome + ": " + (r.stderr || "").slice(0, 200)); };
const tg = async (token, metodo, corpo) => { const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo || {}) }); const j = await r.json(); if (!j.ok) throw new Error(`${metodo}: ${j.description}`); return j.result; };

const token = await ask("Cole o token do bot (ex.: 123456789:AA...) e aperte Enter: ");
if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) { console.error("Isso não parece um token do Telegram. Confira o que o @BotFather mandou."); process.exit(1); }
const eu = await tg(token, "getMe"); console.log("Bot encontrado: @" + eu.username);
const segredo = crypto.randomBytes(24).toString("hex");
put("TG_BOT_TOKEN", token); put("TG_WEBHOOK_SECRET", segredo);
const ids = await ask("IDs do Telegram permitidos, separados por vírgula (opcional; Enter para pular): ");
if (ids) { if (!/^\d+(,\d+)*$/.test(ids.replace(/\s/g, ""))) { console.error("IDs inválidos (só números e vírgulas)."); process.exit(1); } put("ALLOWED_TG", ids.replace(/\s/g, "")); }
let t = fs.readFileSync(toml, "utf8");
t = /^TG_BOT_USERNAME\s*=.*$/m.test(t) ? t.replace(/^TG_BOT_USERNAME\s*=.*$/m, `TG_BOT_USERNAME = "${eu.username}"`) : t.replace("[vars]", `[vars]\nTG_BOT_USERNAME = "${eu.username}"`);
fs.writeFileSync(toml, t);
const dep = spawnSync("npx", ["wrangler", "deploy"], { cwd: new URL("..", import.meta.url), encoding: "utf8", shell: true }); if (dep.status !== 0) { console.error(dep.stderr || dep.stdout); process.exit(1); }
console.log("Servidor publicado. Esperando propagar...");
await new Promise((r) => setTimeout(r, 12000));
await tg(token, "setWebhook", { url: base + "/tg", secret_token: segredo, allowed_updates: ["message"], drop_pending_updates: true });
await tg(token, "setMyCommands", { commands: [["ajuda", "Como usar"], ["resumo", "Resumo do mês"], ["relatorio", "Relatório em PDF"], ["planilha", "Planilha do mês"], ["ultimos", "Últimos lançamentos"], ["desfazer", "Apagar o último"]].map(([command, description]) => ({ command, description })) });
await tg(token, "setMyShortDescription", { short_description: "Assessor de gastos do Uiraçu: anote por texto, áudio ou foto da nota." });
console.log(`Pronto! Abra https://t.me/${eu.username} e, no app Uiraçu, toque em Gastos > Conectar ao Telegram.`);
