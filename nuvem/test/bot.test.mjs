// Teste de ponta a ponta do Worker, sem internet: D1 simulado (node:sqlite), WhatsApp/Gemini/push simulados, webhook assinado com HMAC.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/index.js";
import { agendados } from "../src/bot.js";
import { hmacHex } from "../src/util.js";
import { gerarVapid, b64u } from "../src/push.js";

// ---- D1 simulado
class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })) }; }
}
function novoDB() {
  const db = new DatabaseSync(":memory:"); db.exec(fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  return { raw: db, prepare: (s) => new Stmt(db, s), async batch(st) { db.exec("BEGIN"); try { for (const s of st) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return []; } };
}

// ---- mundo simulado
const vapid = await gerarVapid();
const TOKEN = "a".repeat(64), WA = "5581999990000";
let env, saidas, gemini, pushes;
const ctxFn = () => { const p = []; return { waitUntil: (x) => p.push(x), done: () => Promise.all(p) }; };

function instalaFetch() {
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes("graph.facebook.com") && url.endsWith("/messages")) { const b = JSON.parse(init.body); saidas.push(b); return new Response("{}", { status: 200 }); }
    if (url.includes("graph.facebook.com") && url.endsWith("/media")) { const f = init.body.get("file"); saidas.push({ upload: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); return new Response(JSON.stringify({ id: "up1" }), { status: 200 }); }
    if (url.includes("graph.facebook.com")) return new Response(JSON.stringify({ url: "https://midia.test/x", mime_type: "audio/ogg; codecs=opus", file_size: 10 }), { status: 200 });
    if (url.startsWith("https://midia.test")) return new Response(new Uint8Array([1, 2, 3]));
    if (url.includes("cota-estourada")) return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
    if (url.includes("modelo-fantasma")) return new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404 });
    if (url.includes("generativelanguage.googleapis.com/v1beta/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-2.0-flash-lite", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
    if (url.includes("generativelanguage.googleapis.com")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(gemini) }] } }] }), { status: 200 });
    if (url.startsWith("https://push.test")) { pushes.push(url); return new Response(null, { status: 201 }); }
    if (url.startsWith("https://api.telegram.org/file/")) return new Response(new Uint8Array([4, 5, 6]));
    if (url.includes("api.telegram.org") && url.endsWith("/sendMessage")) { const b = JSON.parse(init.body); saidas.push({ type: "text", tg: true, to: b.chat_id, text: { body: b.text } }); return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }); }
    if (url.includes("api.telegram.org") && url.endsWith("/sendDocument")) { const f = init.body.get("document"); saidas.push({ upload: f.name, tg: true, to: init.body.get("chat_id"), bytes: new Uint8Array(await f.arrayBuffer()) }); return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }); }
    if (url.includes("api.telegram.org") && url.endsWith("/getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file_1.oga", file_size: 10 } }), { status: 200 });
    throw new Error("fetch inesperado: " + url);
  };
}
async function api(path, body, token = TOKEN, extra = {}) {
  const ctx = ctxFn(); const r = await worker.fetch(new Request("https://w" + path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "X-Invite": "convite-teste", ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx); await ctx.done();
  return { status: r.status, body: await r.json().catch(() => null) };
}
let seq = 0;
async function zap(m, { assinar = true, de = WA } = {}) {
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid." + ++seq, from: de, ...m }] } }] }] });
  const sig = assinar ? "sha256=" + (await hmacHex("segredo", raw)) : "sha256=00";
  const ctx = ctxFn(); const r = await worker.fetch(new Request("https://w/wa", { method: "POST", headers: { "X-Hub-Signature-256": sig }, body: raw }), env, ctx); await ctx.done();
  return r.status;
}
const txt = (body) => ({ type: "text", text: { body } });
const ultima = () => saidas.filter((s) => s.type === "text").at(-1)?.text.body;
const linhas = (sql, ...a) => env.DB.raw.prepare(sql).all(...a);

async function vincula() {
  await api("/api/sync", { since: 0, items: [] });
  const { body } = await api("/api/register", {});
  await zap(txt("vincular " + body.code));
}
test.beforeEach(() => {
  env = { DB: novoDB(), WA_TOKEN: "tk", WA_PHONE_ID: "111", WA_APP_SECRET: "segredo", WA_VERIFY_TOKEN: "ver", WA_BOT_NUMBER: "+55 81 99999-0000", ALLOWED: WA, TG_BOT_TOKEN: "tgtoken", TG_WEBHOOK_SECRET: "tgsegredo", TG_BOT_USERNAME: "UiracuBot", APP_ORIGIN: "https://app.test", MAX_USERS: "2", BRAIN_SECRET: "brain", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(vapid.privateJwk), GEMINI_API_KEY: "g", AI_DAILY_LIMIT: "3", INVITE_CODE: "convite-teste" };
  saidas = []; pushes = []; gemini = { transcricao: "", itens: [] }; instalaFetch();
});

test("webhook: verificação GET e assinatura inválida", async () => {
  const ok = await worker.fetch(new Request("https://w/wa?hub.mode=subscribe&hub.verify_token=ver&hub.challenge=123"), env, ctxFn());
  assert.equal(await ok.text(), "123");
  const ruim = await worker.fetch(new Request("https://w/wa?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123"), env, ctxFn());
  assert.equal(ruim.status, 403);
  assert.equal(await zap(txt("oi"), { assinar: false }), 401);
});

test("API exige token; limite de usuários", async () => {
  assert.equal((await api("/api/status", undefined, "xyz")).status, 401);
  assert.equal((await api("/api/sync", { since: 0, items: [] }, "1".repeat(64))).status, 200);
  assert.equal((await api("/api/sync", { since: 0, items: [] }, "2".repeat(64))).status, 200);
  assert.equal((await api("/api/sync", { since: 0, items: [] }, "3".repeat(64))).status, 403);
});

test("sincronização: envia, recebe, exclusão viaja", async () => {
  const a = await api("/api/sync", { since: 0, items: [{ id: "i1", ts: "2026-10-10", v: 50, c: "mercado", d: "Feira", tp: "gasto", src: "app" }, { id: "i2", ts: "2026-10-11", v: 20, c: "transporte", d: "Uber", tp: "gasto", src: "app" }, { id: "ruim", ts: "x", v: -1 }] });
  assert.equal(a.body.items.length, 2);
  const t0 = a.body.now;
  await new Promise((r) => setTimeout(r, 5));
  const b = await api("/api/sync", { since: t0, items: [{ id: "i2", ts: "2026-10-11", v: 20, c: "transporte", d: "Uber", tp: "gasto", src: "app", deleted: 1 }] });
  assert.equal(b.body.items.find((x) => x.id === "i2").deleted, 1); // pode devolver também itens recém-gravados: o app junta por id
});

test("vínculo por código, número sem o 9 e número estranho", async () => {
  await api("/api/sync", { since: 0, items: [] });
  const { body } = await api("/api/register", {});
  assert.equal(body.code.length, 6); assert.equal(body.bot, "5581999990000");
  await zap(txt("vincular 000000")); assert.match(ultima(), /não vale mais/);
  await zap(txt("vincular " + body.code), { de: "558199990000" }); // chegou sem o 9: mesmo número
  assert.match(ultima(), /Conectado/);
  assert.equal((await api("/api/status")).body.linked, true);
  const n = saidas.length; await zap(txt("gastei 10 no mercado"), { de: "5511988887777" });
  assert.equal(saidas.length, n, "estranho não recebe resposta");
});

test("anota por texto, resume, corrige categoria e desfaz", async () => {
  await vincula();
  await zap(txt("gastei 45,90 no mercado")); assert.match(ultima(), /45,90.*Mercado/s);
  await zap(txt("uber 23,5 ontem")); await zap(txt("+1500 salário"));
  const rows = linhas("SELECT v,c,tp,src FROM expenses ORDER BY upd"); assert.equal(rows.length, 3); assert.equal(rows[2].tp, "receita"); assert.equal(rows[0].src, "wa");
  await zap(txt("resumo")); assert.match(ultima(), /Receitas: R\$\s1\.500,00[\s\S]*Gastos: R\$\s69,40/);
  await zap(txt("categoria lazer")); assert.match(ultima(), /Ajustei|categoria/i);
  await zap(txt("desfazer")); assert.match(ultima(), /Apaguei/);
  assert.equal(linhas("SELECT COUNT(*) n FROM expenses WHERE deleted=0")[0].n, 2);
  await zap(txt("blá blá")); assert.match(ultima(), /Não achei um valor/);
});

test("apagar todos os gastos pede confirmação; só 'confirmo' apaga; outra mensagem cancela", async () => {
  await vincula();
  await zap(txt("gastei 10 no mercado")); await zap(txt("uber 20"));
  await zap(txt("apagar todos os gastos")); assert.match(ultima(), /todos os 2 lançamentos[\s\S]*confirmo/);
  assert.equal(linhas("SELECT COUNT(*) n FROM expenses WHERE deleted=0")[0].n, 2);
  await zap(txt("oi")); // cancela
  await zap(txt("confirmo")); assert.equal(linhas("SELECT COUNT(*) n FROM expenses WHERE deleted=0")[0].n, 2);
  await zap(txt("desfazer todos os gastos")); await zap(txt("confirmo")); assert.match(ultima(), /apaguei 2 lançamento/);
  assert.equal(linhas("SELECT COUNT(*) n FROM expenses WHERE deleted=0")[0].n, 0);
  assert.equal(linhas("SELECT COUNT(*) n FROM expenses WHERE deleted=1")[0].n, 2); // some do app pela sincronização
  await zap(txt("apagar tudo")); assert.match(ultima(), /nenhum lançamento/);
});

test("contas: palavra empresa/granja separa; modo; saldo informado desconta; resumo por conta", async () => {
  await vincula();
  await zap(txt("gastei 50 no mercado"));
  await zap(txt("empresa ração 3200")); assert.match(ultima(), /🏢[\s\S]*Empresa/);
  await zap(txt("diesel 450 granja"));
  let rows = linhas("SELECT v,w FROM expenses ORDER BY upd"); assert.deepEqual(rows.map((r) => r.w), ["p", "e", "e"]);
  await zap(txt("saldo empresa 100 mil")); assert.match(ultima(), /Empresa.*100\.000,00/);
  await zap(txt("tenho 20000 na pessoal")); assert.match(ultima(), /Pessoal.*20\.000,00/);
  await zap(txt("granja vacinas 1000")); assert.match(ultima(), /Em conta \(Empresa\): \*R\$\s99\.000,00/);
  await zap(txt("+5000 venda de ovos empresa")); assert.match(ultima(), /Em conta \(Empresa\): \*R\$\s104\.000,00/);
  await zap(txt("saldo")); assert.match(ultima(), /Pessoal: \*R\$\s20\.000,00[\s\S]*Empresa: \*R\$\s104\.000,00/);
  await zap(txt("modo empresa")); assert.match(ultima(), /Modo \*empresa\*/);
  await zap(txt("frete 300")); assert.equal(linhas("SELECT w FROM expenses ORDER BY upd DESC LIMIT 1")[0].w, "e");
  await zap(txt("pessoal farmácia 40")); assert.equal(linhas("SELECT w FROM expenses ORDER BY upd DESC LIMIT 1")[0].w, "p");
  await zap(txt("modo pessoal")); await zap(txt("uber 20")); assert.equal(linhas("SELECT w FROM expenses ORDER BY upd DESC LIMIT 1")[0].w, "p");
  await zap(txt("resumo")); assert.match(ultima(), /Pessoal[\s\S]*Empresa/);
  await zap(txt("resumo empresa")); assert.match(ultima(), /Empresa[\s\S]*Gastos: R\$\s4\.950,00/);
  const { body } = await api("/api/status"); assert.equal(body.settings.saldos.e.v, 100000);
});

test("comandos: catálogo no Telegram tem /links e texto copiável", async () => {
  await vinculaTg(); await tgz({ text: "/comandos" });
  const t = saidas.filter((x) => x.tg && x.type === "text").at(-1).text.body; assert.match(t, /\/resumo/); assert.match(t, /<code>gastei 45 no mercado<\/code>/); assert.match(t, /\/modoempresa/);
  await tgz({ text: "/modoempresa" }); assert.match(saidas.filter((x) => x.tg).at(-1).text.body, /Modo <b>empresa<\/b>/);
});

test("repetição do mesmo id é ignorada", async () => {
  await vincula();
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "dup1", from: WA, ...txt("gastei 9 no cafe") }] } }] }] });
  for (let i = 0; i < 2; i++) { const c = ctxFn(); await worker.fetch(new Request("https://w/wa", { method: "POST", headers: { "X-Hub-Signature-256": "sha256=" + (await hmacHex("segredo", raw)) }, body: raw }), env, c); await c.done(); }
  assert.equal(linhas("SELECT COUNT(*) n FROM expenses")[0].n, 1);
});

test("relatório em PDF e planilha chegam como documento", async () => {
  await vincula(); await zap(txt("mercado 120")); await zap(txt("+2000 salario"));
  saidas.length = 0; await zap(txt("relatório"));
  const up = saidas.find((s) => s.upload); assert.match(up.upload, /^Uiracu-gastos-\d{4}-\d{2}\.pdf$/); assert.equal(new TextDecoder().decode(up.bytes.slice(0, 5)), "%PDF-");
  assert.ok(saidas.some((s) => s.type === "document"));
  saidas.length = 0; await zap(txt("planilha")); const csv = saidas.find((s) => s.upload); assert.match(csv.upload, /\.csv$/); assert.match(new TextDecoder().decode(csv.bytes), /Mercado/);
});

test("áudio e foto usam a IA, com limite diário", async () => {
  await vincula();
  gemini = { transcricao: "gastei quarenta no mercado", itens: [{ tipo: "gasto", valor: 40, data: null, descricao: "Mercado", categoria: "mercado" }] };
  await zap({ type: "audio", audio: { id: "a1" } });
  assert.ok(saidas.some((s) => s.type === "text" && /Entendi/.test(s.text.body)));
  gemini = { transcricao: "", itens: [{ tipo: "gasto", valor: 89.9, data: "2026-10-20", descricao: "Farmácia Pague", categoria: "saude" }] };
  await zap({ type: "image", image: { id: "i1" } });
  assert.deepEqual(linhas("SELECT v,c FROM expenses ORDER BY upd").map((r) => [r.v, r.c]), [[40, "mercado"], [89.9, "saude"]]);
  gemini = { itens: [{ tipo: "gasto", valor: 1e12, descricao: "absurdo", categoria: "x" }] };
  await zap({ type: "audio", audio: { id: "a2" } }); assert.match(ultima(), /não achei valores/);
  await zap({ type: "audio", audio: { id: "a3" } }); assert.match(ultima(), /limite/);
});

test("sem chave da IA, áudio pede texto", async () => {
  delete env.GEMINI_API_KEY; await vincula(); await zap({ type: "audio", audio: { id: "a1" } });
  assert.match(ultima(), /ainda não está ligada/);
});

test("relatório automático: dentro da janela envia; fora usa modelo e entrega na resposta", async () => {
  await vincula(); await zap(txt("mercado 100"));
  const agora = Date.now(), b = new Date(agora - 3 * 3600e3);
  await api("/api/settings", { report_on: 1, report_day: b.getUTCDate(), report_hour: b.getUTCHours() });
  saidas.length = 0;
  let r = await agendados(env, agora); assert.equal(r[0].modo, "janela"); assert.equal(saidas.filter((s) => s.upload).length, 2);
  assert.deepEqual(await agendados(env, agora), [], "não repete no mesmo dia");
  env.DB.raw.prepare("UPDATE users SET last_report=NULL, last_inbound=?").run(agora - 30 * 3600e3);
  saidas.length = 0; r = await agendados(env, agora); assert.equal(r[0].modo, "modelo");
  assert.equal(saidas[0].type, "template"); assert.ok(linhas("SELECT pending_report p FROM users")[0].p);
  saidas.length = 0; await zap(txt("oi")); assert.equal(saidas.filter((s) => s.upload).length, 2, "a resposta libera o PDF pendente");
});

test("avisos push: inscrição, teste e aviso do cérebro", async () => {
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const sub = { endpoint: "https://push.test/abc", keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
  assert.equal((await api("/api/push/subscribe", { sub: { endpoint: "http://ruim", keys: {} } })).status, 400);
  assert.equal((await api("/api/push/subscribe", { sub })).status, 200);
  assert.equal((await api("/api/push/test", {})).body.enviados, 1);
  assert.equal((await api("/api/notify", { title: "ITUB4 · compra", body: "R$ 38,10" }, TOKEN)).status, 401, "sem o segredo do cérebro");
  const n = await api("/api/notify", { title: "ITUB4 · compra", body: "R$ 38,10", url: "./#/ativo/ITUB4" }, TOKEN, { "X-Brain-Secret": "brain" });
  assert.equal(n.body.enviados, 1); assert.equal(pushes.length, 2);
});

test("sem convite não cria conta; com convite cria; vínculo limita tentativas", async () => {
  assert.equal((await api("/api/sync", { since: 0, items: [] }, "4".repeat(64), { "X-Invite": "errado" })).status, 403);
  assert.equal((await api("/api/sync", { since: 0, items: [] }, "4".repeat(64))).status, 200);
  await api("/api/sync", { since: 0, items: [] });
  for (let i = 0; i < 5; i++) await zap(txt("vincular 00000" + i));
  const { body } = await api("/api/register", {});
  const n = saidas.length; await zap(txt("vincular " + body.code));
  assert.equal(saidas.length, n, "depois de 5 erros o número é ignorado, mesmo com o código certo");
});

test("resumo semanal: domingo 18h por WhatsApp (dentro da janela) e por aviso", async () => {
  await vincula(); await zap(txt("mercado 10"));
  const dom = Date.UTC(2026, 10, 1, 21, 0, 0); // domingo 01/11/2026, 18h em Brasília
  const u = env.DB.raw.prepare("SELECT id FROM users").get().id;
  env.DB.raw.prepare("DELETE FROM expenses").run();
  const ins = env.DB.raw.prepare("INSERT INTO expenses(user,id,ts,v,c,d,tp,src,deleted,upd) VALUES(?,?,?,?,?,?,?,?,0,?)");
  ins.run(u, "s1", "2026-10-30", 200, "mercado", "Feira", "gasto", "wa", 1); ins.run(u, "s2", "2026-10-31", 50, "transporte", "Uber", "gasto", "wa", 1); ins.run(u, "s3", "2026-10-25", 100, "mercado", "Feira", "gasto", "wa", 1);
  await api("/api/settings", { weekly_on: 1 });
  env.DB.raw.prepare("UPDATE users SET last_inbound=?").run(dom - 3600e3);
  saidas.length = 0; const r = await agendados(env, dom);
  assert.equal(r.length, 1); assert.equal(r[0].semanal, "whatsapp");
  assert.match(ultima(), /Resumo da semana[\s\S]*Gastos: R\$\s250,00[\s\S]*150%/);
  assert.deepEqual(await agendados(env, dom), [], "não repete no mesmo domingo");
  assert.equal((await api("/api/status")).body.settings.weekly_on, 1);
});

// ---------------- Telegram
let tseq = 0;
async function tgz(msg, { de = 777, chat = 777, segredo = "tgsegredo" } = {}) {
  const upd = { update_id: ++tseq, message: { message_id: tseq, from: { id: de }, chat: { id: chat, type: "private" }, ...msg } };
  const ctx = ctxFn(); const r = await worker.fetch(new Request("https://w/tg", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": segredo }, body: JSON.stringify(upd) }), env, ctx); await ctx.done(); return r.status;
}
async function vinculaTg() { await api("/api/sync", { since: 0, items: [] }); const { body } = await api("/api/register", {}); await tgz({ text: "/start " + body.code }); return body; }

test("Telegram: webhook exige o segredo; vínculo por /start com código; estado dos canais", async () => {
  assert.equal(await tgz({ text: "oi" }, { segredo: "errado" }), 401);
  await api("/api/sync", { since: 0, items: [] });
  const r = await api("/api/register", {}); assert.equal(r.body.tgBot, "UiracuBot"); assert.equal(r.body.canais.tg, true);
  await tgz({ text: "/start 000000" }); assert.match(ultima(), /não vale mais/);
  await tgz({ text: "/start " + r.body.code }); assert.match(ultima(), /Conectado/);
  const s = (await api("/api/status")).body; assert.equal(s.linked, true); assert.equal(s.canal, "telegram"); assert.match(s.tg, /^Telegram ••/);
  const n = saidas.length; await tgz({ text: "gastei 10 no mercado" }, { de: 999, chat: 999 }); assert.match(ultima(), /Ainda não conheço você/); assert.equal(saidas.length, n + 1);
});

test("Telegram: anota, comandos com barra, relatório e áudio", async () => {
  await vinculaTg();
  await tgz({ text: "gastei 45,90 no mercado" }); assert.match(ultima(), /45,90.*Mercado/s); assert.equal(saidas.at(-1).to, 777);
  assert.match(saidas.at(-1).text.body, /<i>Errou\?/, "itálico vira HTML do Telegram");
  await tgz({ text: "/resumo" }); assert.match(ultima(), /Gastos: R\$\s45,90/);
  saidas.length = 0; await tgz({ text: "/relatorio@UiracuBot" });
  const pdf = saidas.find((s) => s.upload); assert.match(pdf.upload, /\.pdf$/); assert.equal(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "%PDF-");
  gemini = { transcricao: "gastei trinta no almoço", itens: [{ tipo: "gasto", valor: 30, data: null, descricao: "Almoço", categoria: "alimentacao" }] };
  await tgz({ voice: { file_id: "v1" } }); assert.ok(saidas.some((s) => /Entendi/.test(s.text?.body || "")));
  assert.deepEqual(linhas("SELECT v FROM expenses ORDER BY upd").map((r) => r.v), [45.9, 30]);
  await tgz({ text: "/ajuda" }); assert.match(ultima(), /Anote|comandos|Comandos/i);
});

test("Telegram: relatório automático chega sem janela de 24 h e sem modelo aprovado", async () => {
  await vinculaTg(); await tgz({ text: "mercado 100" });
  const agora = Date.now(), b = new Date(agora - 3 * 3600e3);
  await api("/api/settings", { report_on: 1, report_day: b.getUTCDate(), report_hour: b.getUTCHours() });
  env.DB.raw.prepare("UPDATE users SET last_inbound=?").run(agora - 90 * 3600e3); // última mensagem há 90 h
  saidas.length = 0; const r = await agendados(env, agora);
  assert.equal(r[0].modo, "janela"); assert.equal(saidas.filter((s) => s.upload).length, 2); assert.ok(saidas.every((s) => s.tg), "nada foi para o WhatsApp");
  assert.equal(linhas("SELECT pending_report p FROM users")[0].p, null);
});

test("IA: se o modelo configurado não existe (404), o servidor escolhe um flash válido e segue", async () => {
  env.GEMINI_MODEL = "modelo-fantasma"; await vincula();
  gemini = { transcricao: "gastei vinte no café", itens: [{ tipo: "gasto", valor: 20, data: null, descricao: "Café", categoria: "alimentacao" }] };
  await zap({ type: "audio", audio: { id: "a1" } });
  assert.ok(saidas.some((s) => s.type === "text" && /Entendi/.test(s.text.body)), "entendeu o áudio apesar do modelo errado");
  assert.deepEqual(linhas("SELECT v FROM expenses").map((r) => r.v), [20]);
});

test("IA: se o modelo estoura a cota (429), tenta os estáveis em ordem e ignora os experimentais", async () => {
  env.GEMINI_MODEL = "gemini-cota-estourada"; await vincula();
  gemini = { transcricao: "", itens: [{ tipo: "gasto", valor: 33, data: null, descricao: "Padaria", categoria: "mercado" }] };
  await zap({ type: "image", image: { id: "i1" } });
  assert.deepEqual(linhas("SELECT v FROM expenses").map((r) => r.v), [33]);
});
