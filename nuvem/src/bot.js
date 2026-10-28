// Cérebro do bot de gastos: entende mensagens do WhatsApp, anota no banco, responde e envia relatórios.
import { CATS, CATS_REC, catOf, parseMessage, summarize, toCsv, newId, hojeBRT, ymAdd, ymLabel, dBR, fBRL, norm } from "../../docs/gastos-core.js";
import { relatorioPdf } from "../../docs/relatorio.js";
import { sendText, sendDocument, sendTemplate, downloadMedia } from "./wa.js";
import { iaLigada, extrairMidia, extrairTexto } from "./ai.js";
import { sendPush } from "./push.js";
import { normWa } from "./util.js";

const DAY = 864e5, BRT = 3 * 3600e3;
const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const AJUDA = `Olá! Eu anoto seus gastos. 🦅

✍️ *Escreva*: gastei 45 no mercado · uber 23,50 ontem · +1500 salário
🎙️ Ou mande um *áudio* contando.
🧾 Ou a *foto da nota fiscal*.

*Comandos*
• *relatório* (PDF do mês) · *relatório setembro*
• *planilha* (abre no Excel)
• *resumo* · *últimos* · *desfazer*
• *categoria transporte* (corrige o último)
• *relatório automático dia 30* · *parar relatório*`;

// ------------------------------------------------------------------ banco
const upsert = (env, user, it) => env.DB.prepare("INSERT INTO expenses(user,id,ts,v,c,d,tp,src,deleted,upd) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user,id) DO UPDATE SET ts=excluded.ts,v=excluded.v,c=excluded.c,d=excluded.d,tp=excluded.tp,deleted=excluded.deleted,upd=excluded.upd").bind(user, it.id, it.ts, it.v, it.c, it.d, it.tp, it.src, it.deleted ? 1 : 0, Date.now());
export async function salvarItens(env, user, itens) { if (itens.length) await env.DB.batch(itens.map((it) => upsert(env, user, it))); }
export const upsertStmt = upsert;
/** Lançamentos do mês e do mês anterior (o relatório compara os dois). */
export async function doMes(env, user, ym) {
  const { results } = await env.DB.prepare("SELECT id,ts,v,c,d,tp,src,deleted FROM expenses WHERE user=? AND deleted=0 AND ts>=? AND ts<?").bind(user, ymAdd(ym, -1) + "-01", ymAdd(ym, 1) + "-01").all();
  return results;
}
const ultimo = (env, user) => env.DB.prepare("SELECT id,ts,v,c,d,tp FROM expenses WHERE user=? AND deleted=0 ORDER BY upd DESC LIMIT 1").bind(user).first();

// ------------------------------------------------------------------ textos
const rel = (ts, hoje) => (ts === hoje ? "hoje" : ts === addDays(hoje, -1) ? "ontem" : dBR(ts).slice(0, 5));
function resumoTxt(S) {
  let t = `📊 *${cap(ymLabel(S.ym))}*\nReceitas: ${fBRL(S.receitas)}\nGastos: ${fBRL(S.gastos)}\nInvestido: ${fBRL(S.investido)}\nSaldo: *${fBRL(S.saldo)}*`;
  if (S.porCat.length) t += "\n\nMaiores categorias:\n" + S.porCat.slice(0, 5).map((c) => `• ${c.n} ${fBRL(c.v)} (${Math.round(c.pct * 100)}%)`).join("\n");
  return t;
}
function linhaItem(it, hoje) { const c = catOf(it.c, it.tp); return `${it.tp === "receita" ? "💰" : "✅"} ${fBRL(it.v)} · ${c.n}${it.d && it.d !== c.n ? " · " + it.d : ""} · ${rel(it.ts, hoje)}`; }

/** Mês citado na frase: "setembro", "mês passado", "09/2026". Padrão: mês atual. */
export function parseMes(n, hoje) {
  const cur = hoje.slice(0, 7);
  if (/(mes passado|mes anterior|ultimo mes)/.test(n)) return ymAdd(cur, -1);
  const m1 = /\b(\d{1,2})\/(\d{2,4})\b/.exec(n);
  if (m1) { const y = m1[2].length === 2 ? 2000 + +m1[2] : +m1[2]; if (+m1[1] >= 1 && +m1[1] <= 12) return `${y}-${String(+m1[1]).padStart(2, "0")}`; }
  for (let i = 0; i < 12; i++) if (new RegExp("\\b" + MESES[i].slice(0, 3) + "\\w*").test(n)) {
    const ys = /\b(20\d\d)\b/.exec(n); let y = ys ? +ys[1] : +cur.slice(0, 4); const mm = String(i + 1).padStart(2, "0");
    if (!ys && `${y}-${mm}` > cur) y -= 1; return `${y}-${mm}`;
  }
  return cur;
}

// ------------------------------------------------------------------ relatórios
export async function enviarRelatorio(env, user, ym, { csv = false, pdf = true } = {}) {
  const to = user.wa_raw || user.wa, rows = await doMes(env, user.id, ym);
  if (pdf) await sendDocument(env, to, relatorioPdf(rows, ym, { geradoEm: new Date(Date.now() - BRT) }), `Uiracu-gastos-${ym}.pdf`, "application/pdf", `📄 Relatório de ${ymLabel(ym)}`);
  if (csv) await sendDocument(env, to, new TextEncoder().encode(toCsv(rows.filter((x) => x.ts.startsWith(ym)))), `Uiracu-gastos-${ym}.csv`, "text/csv", `📊 Planilha de ${ymLabel(ym)} (abre no Excel)`);
}

async function pushUser(env, user, payload) {
  let subs = []; try { subs = JSON.parse(user.push || "[]"); } catch {}
  if (!subs.length || !env.VAPID_PRIVATE_JWK) return 0;
  const keep = []; let ok = 0;
  for (const s of subs) { const r = await sendPush(env, s, payload); if (r.ok) ok++; if (!r.gone) keep.push(s); }
  if (keep.length !== subs.length) await env.DB.prepare("UPDATE users SET push=? WHERE id=?").bind(JSON.stringify(keep), user.id).run();
  return ok;
}
export { pushUser };

// ------------------------------------------------------------------ IA com limite diário
async function usaIa(env, user) {
  const hoje = hojeBRT(), lim = +(env.AI_DAILY_LIMIT || 40);
  const n = user.ai_day === hoje ? user.ai_n : 0; if (n >= lim) return false;
  await env.DB.prepare("UPDATE users SET ai_day=?, ai_n=? WHERE id=?").bind(hoje, n + 1, user.id).run();
  return true;
}

// ------------------------------------------------------------------ mensagens
const permitidos = (env) => String(env.ALLOWED || "").split(",").map((s) => normWa(s)).filter(Boolean);
const permitido = (env, wa) => permitidos(env).includes(wa);

async function vincular(env, code, wa, from) {
  const lista = permitidos(env); if (lista.length && !lista.includes(wa)) return;
  const l = await env.DB.prepare("SELECT user FROM links WHERE code=? AND exp>?").bind(code, Date.now()).first();
  if (!l) return sendText(env, from, "Esse código não vale mais. Abra o app, aba Gastos, e toque em *Conectar ao WhatsApp* para gerar outro.");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET wa=NULL, wa_raw=NULL WHERE wa=?").bind(wa),
    env.DB.prepare("UPDATE users SET wa=?, wa_raw=?, last_inbound=? WHERE id=?").bind(wa, from, Date.now(), l.user),
    env.DB.prepare("DELETE FROM links WHERE code=?").bind(code),
  ]);
  await sendText(env, from, "✅ Conectado ao Uiraçu!\n\n" + AJUDA);
}

export async function onMessage(env, m) {
  const from = m.from, wa = normWa(from);
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO seen(id,t) VALUES(?,?)").bind(m.id, Date.now()).run();
  if (!ins.meta.changes) return; // o WhatsApp reenvia: já tratei esta
  const text = m.type === "text" ? String(m.text?.body || "").trim() : "";
  let user = await env.DB.prepare("SELECT * FROM users WHERE wa=?").bind(wa).first();
  if (!user) {
    const mm = /^vincular\s+(\d{6})$/i.exec(text.replace(/\s+/g, " "));
    if (mm) return vincular(env, mm[1], wa, from);
    if (permitido(env, wa)) await sendText(env, from, "Este número ainda não está conectado. No app Uiraçu, aba *Gastos*, toque em *Conectar ao WhatsApp* e envie o código aqui.");
    return;
  }
  await env.DB.prepare("UPDATE users SET last_inbound=?, wa_raw=? WHERE id=?").bind(Date.now(), from, user.id).run();
  try {
    if (user.pending_report && !/^(relat|pdf|planilha)/.test(norm(text))) { const ym = user.pending_report; await env.DB.prepare("UPDATE users SET pending_report=NULL WHERE id=?").bind(user.id).run(); await enviarRelatorio(env, { ...user, wa_raw: from }, ym, { csv: true }); }
    if (m.type === "text") await texto(env, user, from, text);
    else if (m.type === "audio") await midia(env, user, from, m.audio?.id, "audio");
    else if (m.type === "image") await midia(env, user, from, m.image?.id, "image");
    else if (m.type === "document" && /^(application\/pdf|image\/)/.test(m.document?.mime_type || "")) await midia(env, user, from, m.document.id, "image");
    else await sendText(env, from, "Eu entendo texto, áudio e foto da nota fiscal. Digite *ajuda* para ver como.");
  } catch (e) {
    console.log("erro no bot:", e && e.message);
    await sendText(env, from, "Tive um problema aqui. Tente de novo em instantes.").catch(() => {});
  }
}

async function confirmar(env, user, from, itens) {
  const hoje = hojeBRT(), ym = itens[0].ts.slice(0, 7), S = summarize(await doMes(env, user.id, ym), ym);
  let t = itens.map((it) => linhaItem(it, hoje)).join("\n");
  t += `\n\n${cap(ymLabel(ym).split(" ")[0])}: gastos ${fBRL(S.gastos)}` + (S.receitas ? ` · receitas ${fBRL(S.receitas)}` : "");
  t += "\n_Errou? Digite *desfazer* ou *categoria ...*_";
  await sendText(env, from, t);
}

async function texto(env, user, from, text) {
  const hoje = hojeBRT(), n = norm(text);
  if (/^(ajuda|help|menu|comandos|oi|ola|bom dia|boa tarde|boa noite|\?)$/.test(n)) return sendText(env, from, AJUDA);
  if (/^(desfazer|desfaz|apagar ultimo|apagar o ultimo|cancelar ultimo|errei)$/.test(n)) {
    const u = await ultimo(env, user.id); if (!u) return sendText(env, from, "Não há nada para desfazer.");
    await env.DB.prepare("UPDATE expenses SET deleted=1, upd=? WHERE user=? AND id=?").bind(Date.now(), user.id, u.id).run();
    return sendText(env, from, `↩️ Apaguei: ${fBRL(u.v)} · ${u.d || catOf(u.c, u.tp).n}`);
  }
  if (/^(ultimos|ultimas|lista|historico|extrato)( \d+)?$/.test(n)) {
    const { results } = await env.DB.prepare("SELECT ts,v,c,d,tp FROM expenses WHERE user=? AND deleted=0 ORDER BY ts DESC, upd DESC LIMIT 10").bind(user.id).all();
    return sendText(env, from, results.length ? "🧾 *Últimos lançamentos*\n" + results.map((it) => linhaItem(it, hoje)).join("\n") : "Ainda não há lançamentos.");
  }
  let mm;
  if ((mm = /^categoria (.+)$/.exec(n))) {
    const u = await ultimo(env, user.id); if (!u) return sendText(env, from, "Não há lançamento para corrigir.");
    const alvo = (u.tp === "receita" ? CATS_REC : CATS).find((c) => norm(c.n) === mm[1] || c.k === mm[1] || norm(c.n).startsWith(mm[1]));
    if (!alvo) return sendText(env, from, "Não conheço essa categoria. Use: " + (u.tp === "receita" ? CATS_REC : CATS).map((c) => c.n).join(", ") + ".");
    await env.DB.prepare("UPDATE expenses SET c=?, upd=? WHERE user=? AND id=?").bind(alvo.k, Date.now(), user.id, u.id).run();
    return sendText(env, from, `✏️ Ajustei para *${alvo.n}*: ${fBRL(u.v)} · ${u.d}`);
  }
  if (/^(parar|desligar|cancelar|pausar) (o |os )?(relatorio|envio)/.test(n)) { await env.DB.prepare("UPDATE users SET report_on=0 WHERE id=?").bind(user.id).run(); return sendText(env, from, "Pronto, parei o relatório automático. Peça *relatório* quando quiser."); }
  if ((mm = /(?:relatorio|planilha).*?(?:automatic\w*|mensal|todo mes|todo dia)\D*?(?:dia\s*)?(\d{1,2})\b/.exec(n)) || (mm = /todo dia (\d{1,2}).*(?:relatorio|planilha)/.exec(n))) {
    const dia = Math.min(31, Math.max(1, +mm[1])), h = /\bas (\d{1,2})\s*h?\b/.exec(n), hora = h ? Math.min(22, Math.max(6, +h[1])) : user.report_hour || 8;
    await env.DB.prepare("UPDATE users SET report_on=1, report_day=?, report_hour=? WHERE id=?").bind(dia, hora, user.id).run();
    return sendText(env, from, `✅ Combinado: todo dia ${dia}, às ${String(hora).padStart(2, "0")}h, eu te envio o relatório em PDF e a planilha.`);
  }
  if (/^(relatorio|pdf)\b/.test(n)) { const ym = parseMes(n, hoje); await sendText(env, from, `Gerando o relatório de ${ymLabel(ym)}…`); await env.DB.prepare("UPDATE users SET pending_report=NULL WHERE id=?").bind(user.id).run(); return enviarRelatorio(env, { ...user, wa_raw: from }, ym); }
  if (/^(planilha|csv|excel|exportar)\b/.test(n)) { const ym = parseMes(n, hoje); return enviarRelatorio(env, { ...user, wa_raw: from }, ym, { csv: true, pdf: false }); }
  if (/^(resumo|saldo|quanto gastei|balanco)\b/.test(n)) { const ym = parseMes(n, hoje); return sendText(env, from, resumoTxt(summarize(await doMes(env, user.id, ym), ym))); }

  const p = parseMessage(text, hoje);
  if (p.ok) {
    const it = { id: newId(), ts: p.date, v: p.v, c: p.c, d: p.d, tp: p.tp, src: "wa" };
    await salvarItens(env, user.id, [it]); return confirmar(env, user, from, [it]);
  }
  if (iaLigada(env) && /\d/.test(text) && (await usaIa(env, user))) {
    const r = await extrairTexto(env, text, hoje);
    if (r.itens.length) { await salvarItens(env, user.id, r.itens); return confirmar(env, user, from, r.itens); }
  }
  return sendText(env, from, "Não achei um valor na sua mensagem. Escreva, por exemplo: *gastei 45 no mercado*. Digite *ajuda* para ver tudo.");
}

async function midia(env, user, from, id, kind) {
  if (!id) return;
  if (!iaLigada(env)) return sendText(env, from, "Para entender áudio e foto eu preciso da IA, que ainda não está ligada. Por enquanto, escreva: *gastei 45 no mercado*.");
  if (!(await usaIa(env, user))) return sendText(env, from, "Cheguei ao limite de áudios e fotos de hoje. Escreva em texto ou tente amanhã.");
  const { bytes, mime } = await downloadMedia(env, id);
  const r = await extrairMidia(env, { kind: kind === "audio" ? "audio" : "image", mime: mime || (kind === "audio" ? "audio/ogg" : "image/jpeg"), bytes, hoje: hojeBRT() });
  if (!r.itens.length) return sendText(env, from, kind === "audio" ? "Ouvi o áudio, mas não achei valores. Tente dizer, por exemplo: \"gastei quarenta e cinco reais no mercado\"." : "Não consegui ler um valor nessa foto. Tente uma foto mais de perto, com o total visível, ou escreva o gasto.");
  await salvarItens(env, user.id, r.itens);
  if (kind === "audio" && r.transcricao) await sendText(env, from, `🎙️ Entendi: “${r.transcricao}”`);
  await confirmar(env, user, from, r.itens);
}

// ------------------------------------------------------------------ agendador (a cada hora)
export async function agendados(env, agora = Date.now()) {
  const b = new Date(agora - BRT), dia = b.getUTCDate(), hora = b.getUTCHours(), ymNow = b.toISOString().slice(0, 7);
  const dias = new Date(Date.UTC(+ymNow.slice(0, 4), +ymNow.slice(5), 0)).getUTCDate();
  const { results } = await env.DB.prepare("SELECT * FROM users WHERE report_on=1 AND wa IS NOT NULL AND report_hour=?").bind(hora).all();
  const feitos = [];
  for (const u of results) {
    if (Math.min(u.report_day, dias) !== dia) continue;
    const marca = `${ymNow}-${dia}`; if (u.last_report === marca) continue;
    const ym = dia <= 10 ? ymAdd(ymNow, -1) : ymNow; // nos primeiros dias do mês o relatório é do mês que fechou
    await env.DB.prepare("UPDATE users SET last_report=? WHERE id=?").bind(marca, u.id).run();
    let modo = "janela";
    if (u.last_inbound && agora - u.last_inbound < 23 * 3600e3) { try { await enviarRelatorio(env, u, ym, { csv: true }); } catch (e) { modo = "erro"; } }
    else {
      try { await sendTemplate(env, u.wa_raw || u.wa, env.WA_TEMPLATE_REPORT || "relatorio_mensal"); await env.DB.prepare("UPDATE users SET pending_report=? WHERE id=?").bind(ym, u.id).run(); modo = "modelo"; }
      catch (e) { modo = "so_push"; await env.DB.prepare("UPDATE users SET pending_report=? WHERE id=?").bind(ym, u.id).run(); }
    }
    await pushUser(env, u, { title: `Relatório de ${ymLabel(ym).split(" ")[0]}`, body: modo === "janela" ? "Enviei o PDF e a planilha no seu WhatsApp." : "Está pronto. Responda qualquer coisa ao bot no WhatsApp para receber o PDF.", tag: "relatorio", url: "./#/gastos" });
    feitos.push({ user: u.id, ym, modo });
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM seen WHERE t<?").bind(agora - 3 * DAY), env.DB.prepare("DELETE FROM links WHERE exp<?").bind(agora)]);
  return feitos;
}
