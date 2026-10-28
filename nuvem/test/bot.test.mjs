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
    if (url.includes("generativelanguage.googleapis.com")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(gemini) }] } }] }), { status: 200 });
    if (url.startsWith("https://push.test")) { pushes.push(url); return new Response(null, { status: 201 }); }
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
  env = { DB: novoDB(), WA_TOKEN: "tk", WA_PHONE_ID: "111", WA_APP_SECRET: "segredo", WA_VERIFY_TOKEN: "ver", WA_BOT_NUMBER: "+55 81 99999-0000", ALLOWED: WA, APP_ORIGIN: "https://app.test", MAX_USERS: "2", BRAIN_SECRET: "brain", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(vapid.privateJwk), GEMINI_API_KEY: "g", AI_DAILY_LIMIT: "3", INVITE_CODE: "convite-teste" };
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
