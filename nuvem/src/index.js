// Uiraçu nuvem (Cloudflare Worker): webhook do WhatsApp, API do app (sincronização, vínculo, ajustes, push) e agendador.
import { json, HttpError, corsHeaders, sha256hex, safeEq, randCode, maskWa, digits } from "./util.js";
import { verifySignature, sendTemplate } from "./wa.js";
import { onMessage, onTelegram, agendados, pushUser, enviarRelatorio, upsertStmt, hidrata } from "./bot.js";
import { subValida } from "./push.js";
import { iaLigada } from "./ai.js";
import { setProfilePhoto } from "./tg.js";
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
    // convite: o código mestre (do dono) ou um código individual, de uso único, que o dono gerou no app dele
    const inv = req.headers.get("X-Invite") || "", mestre = !env.INVITE_CODE || safeEq(inv, env.INVITE_CODE);
    let invHash = null;
    if (!mestre) {
      invHash = inv ? await sha256hex(inv) : "";
      const ok = invHash && await env.DB.prepare("SELECT 1 AS x FROM invites WHERE code_hash=? AND used_by IS NULL AND revoked=0 AND exp>?").bind(invHash, Date.now()).first();
      if (!ok) throw new HttpError(403, "convite necessário (inválido, usado ou vencido)");
    }
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n;
    if (n >= +(env.MAX_USERS || 5)) throw new HttpError(403, "limite de usuários");
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (invHash) { // gasta o código antes de criar a conta; se outra pessoa gastou primeiro, nada muda
      const r = await env.DB.prepare("UPDATE invites SET used_by=?, used_at=? WHERE code_hash=? AND used_by IS NULL AND revoked=0 AND exp>?").bind(id, Date.now(), invHash, Date.now()).run();
      if (!r.meta || !r.meta.changes) throw new HttpError(403, "convite necessário (inválido, usado ou vencido)");
    }
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

const canais = (env) => ({ wa: !!(env.WA_TOKEN && env.WA_PHONE_ID), tg: !!env.TG_BOT_TOKEN });

async function telegram(req, env, ctx) {
  const ok = req.method === "POST" && env.TG_WEBHOOK_SECRET && safeEq(req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", env.TG_WEBHOOK_SECRET);
  if (!ok) return new Response("não autorizado", { status: 401 });
  const upd = await req.json().catch(() => null);
  if (upd) ctx.waitUntil(onTelegram(env, upd).catch((e) => console.log("falha no Telegram:", e && e.message)));
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
  if (p.startsWith("/api/admin/")) { // só o dono (o aparelho que tem o código mestre) gera e gerencia convites
    if (!env.INVITE_CODE || !safeEq(req.headers.get("X-Invite") || "", env.INVITE_CODE)) throw new HttpError(403, "só o dono");
    if (p === "/api/admin/invites" && req.method === "GET") {
      const { results } = await env.DB.prepare("SELECT substr(code_hash,1,8) AS id, nome, created, exp, used_by, used_at, revoked FROM invites ORDER BY created DESC LIMIT 50").all();
      const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n;
      return json({ convites: results.map((r) => ({ id: r.id, nome: r.nome, created: r.created, exp: r.exp, usado: !!r.used_by, usado_em: r.used_at, revogado: !!r.revoked })), usuarios: n, max: +(env.MAX_USERS || 5), now: Date.now() });
    }
    if (p === "/api/admin/invite" && req.method === "POST") {
      const b = await readJson(req), nome = String(b.nome || "").replace(/[<>]/g, "").trim().slice(0, 40);
      const code = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, "-").replace(/\//g, "_"); // 24 caracteres
      const hash = await sha256hex(code), now = Date.now(), exp = now + 7 * 86400e3;
      await env.DB.prepare("INSERT INTO invites(code_hash,nome,created,exp) VALUES(?,?,?,?)").bind(hash, nome, now, exp).run();
      return json({ ok: true, code, id: hash.slice(0, 8), exp });
    }
    if (p === "/api/admin/revoke" && req.method === "POST") {
      const b = await readJson(req); if (!/^[a-f0-9]{8}$/.test(String(b.id || ""))) throw new HttpError(400, "id inválido");
      const r = await env.DB.prepare("UPDATE invites SET revoked=1 WHERE substr(code_hash,1,8)=? AND used_by IS NULL").bind(b.id).run();
      return json({ ok: true, revogados: r.meta ? r.meta.changes : 0 });
    }
    if (p === "/api/admin/tg-foto" && req.method === "POST") { // põe a logo do app como foto do bot (o Telegram exige JPG)
      if (!env.TG_BOT_TOKEN) throw new HttpError(409, "Telegram não está ligado");
      const r = await fetch(`${env.APP_ORIGIN}/vw-wallet/icons/bot-foto.jpg`); if (!r.ok) throw new HttpError(502, "não achei a imagem do app");
      await setProfilePhoto(env, await r.arrayBuffer());
      return json({ ok: true });
    }
    throw new HttpError(404, "rota desconhecida");
  }
  const criar = ["/api/sync", "/api/register", "/api/settings", "/api/push/subscribe"].includes(p);
  const user = await auth(req, env, criar);

  if (p === "/api/status") {
    if (!user) return json({ linked: false, settings: null, push: 0, ia: iaLigada(env), canais: canais(env), now: Date.now() });
    let subs = []; try { subs = JSON.parse(user.push || "[]"); } catch {}
    return json({ linked: !!(user.wa || user.tg), canal: user.tg ? "telegram" : user.wa ? "whatsapp" : null, canais: canais(env), tg: user.tg ? "Telegram ••" + String(user.tg).slice(-3) : "", wa: maskWa(user.wa), settings: { report_on: user.report_on, report_day: user.report_day, report_hour: user.report_hour, weekly_on: user.weekly_on, modo: user.modo || "p", saldos: (() => { try { return JSON.parse(user.saldos || "null"); } catch { return null; } })() }, push: subs.length, ia: iaLigada(env), now: Date.now() });
  }
  if (p === "/api/register" && req.method === "POST") {
    const code = randCode();
    await env.DB.batch([env.DB.prepare("DELETE FROM links WHERE user=?").bind(user.id), env.DB.prepare("INSERT INTO links(code,user,exp) VALUES(?,?,?)").bind(code, user.id, Date.now() + 15 * 60e3)]);
    return json({ code, bot: digits(env.WA_BOT_NUMBER), tgBot: env.TG_BOT_USERNAME || "", canais: canais(env), expira: 15 });
  }
  if (p === "/api/sync" && req.method === "POST") {
    const now = Date.now(), b = await readJson(req), since = Math.max(0, +b.since || 0);
    const stmts = []; for (const raw of (Array.isArray(b.items) ? b.items : []).slice(0, 500)) { const it = cleanItem(raw); if (it) stmts.push(upsertStmt(env, user.id, it)); }
    if (stmts.length) await env.DB.batch(stmts);
    const { results } = await env.DB.prepare("SELECT id,ts,v,c,d,tp,src,deleted,upd,w,x FROM expenses WHERE user=? AND upd>? ORDER BY upd LIMIT 2000").bind(user.id, since).all();
    return json({ now: results.length === 2000 ? results[results.length - 1].upd : now, items: hidrata(results) });
  }
  if (p === "/api/settings" && req.method === "POST") {
    // só muda o que veio no pedido (o app manda os campos que alterou)
    const b = await readJson(req), c = (v, lo, hi, d) => { v = Math.round(+v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    const on = b.report_on === undefined ? user.report_on : b.report_on ? 1 : 0;
    const dia = b.report_day === undefined ? user.report_day : c(b.report_day, 1, 31, 30), hora = b.report_hour === undefined ? user.report_hour : c(b.report_hour, 6, 22, 8);
    const sem = b.weekly_on === undefined ? user.weekly_on : b.weekly_on ? 1 : 0;
    await env.DB.prepare("UPDATE users SET report_on=?, report_day=?, report_hour=?, weekly_on=? WHERE id=?").bind(on, dia, hora, sem, user.id).run();
    if (b.modo === "p" || b.modo === "e") await env.DB.prepare("UPDATE users SET modo=? WHERE id=?").bind(b.modo, user.id).run();
    if (b.saldos && typeof b.saldos === "object") {
      const out = {}; for (const k of ["p", "e"]) { const x = b.saldos[k]; if (x && isFinite(+x.v) && Math.abs(+x.v) < 1e11 && /^\d{4}-\d{2}-\d{2}$/.test(String(x.ts))) out[k] = { v: Math.round(+x.v * 100) / 100, ts: String(x.ts), skip: (Array.isArray(x.skip) ? x.skip : []).map((s) => String(s).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32)).slice(0, 200) }; }
      await env.DB.prepare("UPDATE users SET saldos=? WHERE id=?").bind(JSON.stringify(out), user.id).run();
    }
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
    if (!user.wa && !user.tg) throw new HttpError(409, "conecte o Telegram ou o WhatsApp primeiro");
    const b = await readJson(req); const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(b.ym || "") ? b.ym : new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
    if (user.tg_chat || (user.last_inbound && Date.now() - user.last_inbound < 23 * 3600e3)) { await enviarRelatorio(env, user, ym, { csv: true }); return json({ ok: true, modo: "direto" }); }
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
      if (url.pathname === "/tg") return await telegram(req, env, ctx);
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
