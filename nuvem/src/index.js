// Uiraçu nuvem (Cloudflare Worker): webhook do WhatsApp, API do app (sincronização, vínculo, ajustes, push) e agendador.
import { json, HttpError, corsHeaders, sha256hex, safeEq, randCode, maskWa, digits } from "./util.js";
import { verifySignature, sendTemplate } from "./wa.js";
import { onMessage, agendados, pushUser, enviarRelatorio, upsertStmt } from "./bot.js";
import { subValida } from "./push.js";
import { iaLigada } from "./ai.js";
import { cleanItem } from "../../docs/gastos-core.js";

const dec = new TextDecoder();
async function readJson(req) {
  const t = await req.text(); if (t.length > 1_000_000) throw new HttpError(413, "corpo grande demais");
  try { return t ? JSON.parse(t) : {}; } catch { throw new HttpError(400, "JSON inválido"); }
}

/** Identifica o usuário pelo token (32 bytes em hex, guardado só como hash). create=true cria na primeira vez, até MAX_USERS. */
async function auth(req, env, create) {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^[a-f0-9]{64}$/.test(t)) throw new HttpError(401, "sem credencial");
  const h = await sha256hex(t);
  let u = await env.DB.prepare("SELECT * FROM users WHERE token_hash=?").bind(h).first();
  if (!u && create) {
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n;
    if (n >= +(env.MAX_USERS || 5)) throw new HttpError(403, "limite de usuários");
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT INTO users(id,token_hash,created) VALUES(?,?,?)").bind(id, h, Date.now()).run();
    u = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  }
  return u || null;
}

async function webhook(req, env, ctx, url) {
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && env.WA_VERIFY_TOKEN && safeEq(url.searchParams.get("hub.verify_token") || "", env.WA_VERIFY_TOKEN);
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("proibido", { status: 403 });
  }
  const raw = await req.arrayBuffer();
  if (!(await verifySignature(env, raw, req.headers.get("X-Hub-Signature-256")))) return new Response("assinatura inválida", { status: 401 });
  let body; try { body = JSON.parse(dec.decode(raw)); } catch { return new Response("ok"); }
  const msgs = [];
  for (const e of body.entry || []) for (const c of e.changes || []) for (const m of c.value?.messages || []) msgs.push(m);
  // responde 200 já (a Meta reenvia se demorar) e processa em segundo plano
  ctx.waitUntil((async () => { for (const m of msgs) { try { await onMessage(env, m); } catch (e) { console.log("falha na mensagem:", e && e.message); } } })());
  return new Response("ok");
}

async function api(req, env, ctx, url) {
  const p = url.pathname;
  if (p === "/api/notify" && req.method === "POST") { // o cérebro do mercado (GitHub Actions) avisa por aqui
    if (!env.BRAIN_SECRET || !safeEq(req.headers.get("X-Brain-Secret") || "", env.BRAIN_SECRET)) throw new HttpError(401, "não autorizado");
    const b = await readJson(req);
    const payload = { title: String(b.title || "Uiraçu").slice(0, 80), body: String(b.body || "").slice(0, 240), tag: b.tag ? String(b.tag).slice(0, 40) : undefined, url: typeof b.url === "string" && /^(\.\/|#)/.test(b.url) ? b.url : "./" };
    const { results } = await env.DB.prepare("SELECT * FROM users WHERE push != '[]'").all();
    let n = 0; for (const u of results) n += await pushUser(env, u, payload);
    return json({ ok: true, enviados: n });
  }
  const criar = ["/api/sync", "/api/register", "/api/settings", "/api/push/subscribe"].includes(p);
  const user = await auth(req, env, criar);

  if (p === "/api/status") {
    if (!user) return json({ linked: false, settings: null, push: 0, ia: iaLigada(env), now: Date.now() });
    let subs = []; try { subs = JSON.parse(user.push || "[]"); } catch {}
    return json({ linked: !!user.wa, wa: maskWa(user.wa), settings: { report_on: user.report_on, report_day: user.report_day, report_hour: user.report_hour }, push: subs.length, ia: iaLigada(env), now: Date.now() });
  }
  if (p === "/api/register" && req.method === "POST") {
    const code = randCode();
    await env.DB.batch([env.DB.prepare("DELETE FROM links WHERE user=?").bind(user.id), env.DB.prepare("INSERT INTO links(code,user,exp) VALUES(?,?,?)").bind(code, user.id, Date.now() + 15 * 60e3)]);
    return json({ code, bot: digits(env.WA_BOT_NUMBER), expira: 15 });
  }
  if (p === "/api/sync" && req.method === "POST") {
    const now = Date.now(), b = await readJson(req), since = Math.max(0, +b.since || 0);
    const stmts = []; for (const raw of (Array.isArray(b.items) ? b.items : []).slice(0, 500)) { const it = cleanItem(raw); if (it) stmts.push(upsertStmt(env, user.id, it)); }
    if (stmts.length) await env.DB.batch(stmts);
    const { results } = await env.DB.prepare("SELECT id,ts,v,c,d,tp,src,deleted,upd FROM expenses WHERE user=? AND upd>? ORDER BY upd LIMIT 2000").bind(user.id, since).all();
    return json({ now: results.length === 2000 ? results[results.length - 1].upd : now, items: results });
  }
  if (p === "/api/settings" && req.method === "POST") {
    const b = await readJson(req), c = (v, a, z, d) => { v = Math.round(+v); return isFinite(v) ? Math.min(z, Math.max(a, v)) : d; };
    await env.DB.prepare("UPDATE users SET report_on=?, report_day=?, report_hour=? WHERE id=?").bind(b.report_on ? 1 : 0, c(b.report_day, 1, 31, 30), c(b.report_hour, 6, 22, 8), user.id).run();
    return json({ ok: true });
  }
  if (p === "/api/push/subscribe" && req.method === "POST") {
    const b = await readJson(req); if (!subValida(b.sub)) throw new HttpError(400, "inscrição inválida");
    let subs = []; try { subs = JSON.parse(user.push || "[]"); } catch {}
    subs = [...subs.filter((s) => s.endpoint !== b.sub.endpoint), { endpoint: b.sub.endpoint, keys: { p256dh: b.sub.keys.p256dh, auth: b.sub.keys.auth } }].slice(-5);
    await env.DB.prepare("UPDATE users SET push=? WHERE id=?").bind(JSON.stringify(subs), user.id).run();
    return json({ ok: true });
  }
  if (!user) throw new HttpError(401, "desconhecido");
  if (p === "/api/push/test" && req.method === "POST") {
    const n = await pushUser(env, user, { title: "Uiraçu", body: "Aviso de teste: o ícone é o do próprio app.", tag: "teste", url: "./#/gastos" });
    if (!n) throw new HttpError(409, "nenhuma inscrição ativa");
    return json({ ok: true, enviados: n });
  }
  if (p === "/api/report/send" && req.method === "POST") {
    if (!user.wa) throw new HttpError(409, "conecte o WhatsApp primeiro");
    const b = await readJson(req); const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(b.ym || "") ? b.ym : new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
    if (user.last_inbound && Date.now() - user.last_inbound < 23 * 3600e3) { await enviarRelatorio(env, user, ym, { csv: true }); return json({ ok: true, modo: "direto" }); }
    await env.DB.prepare("UPDATE users SET pending_report=? WHERE id=?").bind(ym, user.id).run();
    try { await sendTemplate(env, user.wa_raw || user.wa, env.WA_TEMPLATE_REPORT || "relatorio_mensal"); } catch {}
    return json({ ok: true, modo: "aguardando_resposta" });
  }
  throw new HttpError(404, "rota desconhecida");
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), cors = corsHeaders(req, env);
    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (url.pathname === "/wa") return await webhook(req, env, ctx, url);
      if (url.pathname.startsWith("/api/")) {
        const r = await api(req, env, ctx, url), h = new Headers(r.headers);
        for (const [k, v] of Object.entries(cors)) h.set(k, v);
        return new Response(r.body, { status: r.status, headers: h });
      }
      return json({ ok: true, app: "uiracu-nuvem" }, 200, cors);
    } catch (e) {
      if (e instanceof HttpError) return json({ erro: e.message }, e.status, cors);
      console.log("erro:", e && e.stack || e);
      return json({ erro: "erro interno" }, 500, cors);
    }
  },
  async scheduled(_ev, env, ctx) { ctx.waitUntil(agendados(env)); },
};
