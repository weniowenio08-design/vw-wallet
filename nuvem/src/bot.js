// Cérebro do bot de gastos: entende mensagens do WhatsApp, anota no banco, responde e envia relatórios.
import { CATS, CATS_REC, catOf, parseMessage, summarize, toCsv, newId, hojeBRT, ymAdd, ymLabel, dBR, fBRL, norm } from "../../docs/gastos-core.js";
import { relatorioPdf } from "../../docs/relatorio.js";
import * as WA from "./wa.js";
import * as TG from "./tg.js";
// "Endereço" de quem conversa: "tg:<chat>" é Telegram; qualquer outro valor é o número do WhatsApp. O resto do código não precisa saber a diferença.
const via = (to) => (String(to).startsWith("tg:") ? TG : WA), idOf = (to) => String(to).replace(/^tg:/, "");
const sendText = (env, to, body) => via(to).sendText(env, idOf(to), body);
const sendDocument = (env, to, bytes, fn, mime, cap) => via(to).sendDocument(env, idOf(to), bytes, fn, mime, cap);
const downloadMedia = (env, to, id) => via(to).downloadMedia(env, id);
const sendTemplate = WA.sendTemplate;
export const destino = (u) => (u.tg_chat ? "tg:" + u.tg_chat : u.wa_raw || u.wa);
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
• *resumo* · *últimos* · *desfazer* · *apagar todos os gastos* (pede confirmação)
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
export async function enviarRelatorio(env, user, ym, { csv = false, pdf = true, to: para } = {}) {
  const to = para || destino(user), rows = await doMes(env, user.id, ym);
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
const lista = (s, f = (x) => x) => String(s || "").split(",").map((x) => f(x.trim())).filter(Boolean);
const permitidos = (env) => lista(env.ALLOWED, normWa), permitidosTg = (env) => lista(env.ALLOWED_TG);
const NOME = { wa: "WhatsApp", tg: "Telegram" };

/** Vincula o chat ao usuário do app pelo código de 6 dígitos (vale 15 min; 5 tentativas erradas por hora por pessoa). */
async function vincular(env, code, canal, id, to) {
  const ok = canal === "tg" ? permitidosTg(env) : permitidos(env); if (ok.length && !ok.includes(id)) return;
  const chave = `v:${canal}${id}:`;
  const falhas = (await env.DB.prepare("SELECT COUNT(*) AS n FROM seen WHERE id LIKE ? AND t>?").bind(chave + "%", Date.now() - 3600e3).first()).n;
  if (falhas >= 5) return;
  const l = await env.DB.prepare("SELECT user FROM links WHERE code=? AND exp>?").bind(code, Date.now()).first();
  if (!l) {
    await env.DB.prepare("INSERT OR IGNORE INTO seen(id,t) VALUES(?,?)").bind(`${chave}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, Date.now()).run();
    return sendText(env, to, `Esse código não vale mais. Abra o app, aba Gastos, e toque em *Conectar ao ${NOME[canal]}* para gerar outro.`);
  }
  const st = canal === "tg"
    ? [env.DB.prepare("UPDATE users SET tg=NULL, tg_chat=NULL WHERE tg=?").bind(id), env.DB.prepare("UPDATE users SET tg=?, tg_chat=?, last_inbound=? WHERE id=?").bind(id, idOf(to), Date.now(), l.user)]
    : [env.DB.prepare("UPDATE users SET wa=NULL, wa_raw=NULL WHERE wa=?").bind(id), env.DB.prepare("UPDATE users SET wa=?, wa_raw=?, last_inbound=? WHERE id=?").bind(id, to, Date.now(), l.user)];
  await env.DB.batch([...st, env.DB.prepare("DELETE FROM links WHERE code=?").bind(code)]);
  await sendText(env, to, "✅ Conectado ao Uiraçu!\n\n" + AJUDA);
}

/** Mensagem já normalizada: { type: "text" | "audio" | "image" | "outro", text?, id? } */
async function tratar(env, user, to, m) {
  await env.DB.prepare("UPDATE users SET last_inbound=? WHERE id=?").bind(Date.now(), user.id).run();
  if (!String(to).startsWith("tg:")) await env.DB.prepare("UPDATE users SET wa_raw=? WHERE id=?").bind(to, user.id).run();
  try {
    if (user.pending_report && !/^(relat|pdf|planilha)/.test(norm(m.text || ""))) { const ym = user.pending_report; await env.DB.prepare("UPDATE users SET pending_report=NULL WHERE id=?").bind(user.id).run(); await enviarRelatorio(env, user, ym, { csv: true, to }); }
    if (m.type === "text") await texto(env, user, to, m.text);
    else if (m.type === "audio" || m.type === "image") await midia(env, user, to, m.id, m.type);
    else await sendText(env, to, "Eu entendo texto, áudio e foto da nota fiscal. Digite *ajuda* para ver como.");
  } catch (e) {
    console.log("erro no bot:", e && e.message);
    await sendText(env, to, "Tive um problema aqui. Tente de novo em instantes.").catch(() => {});
  }
}

/** WhatsApp */
export async function onMessage(env, m) {
  const from = m.from, wa = normWa(from);
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO seen(id,t) VALUES(?,?)").bind(m.id, Date.now()).run();
  if (!ins.meta.changes) return; // o WhatsApp reenvia: já tratei esta
  const text = m.type === "text" ? String(m.text?.body || "").trim() : "";
  const user = await env.DB.prepare("SELECT * FROM users WHERE wa=?").bind(wa).first();
  if (!user) {
    const mm = /^vincular\s+(\d{6})$/i.exec(text.replace(/\s+/g, " "));
    if (mm) return vincular(env, mm[1], "wa", wa, from);
    if (permitidos(env).includes(wa)) await sendText(env, from, "Este número ainda não está conectado. No app Uiraçu, aba *Gastos*, toque em *Conectar ao WhatsApp* e envie o código aqui.");
    return;
  }
  const msg = m.type === "text" ? { type: "text", text } : m.type === "audio" ? { type: "audio", id: m.audio?.id } : m.type === "image" ? { type: "image", id: m.image?.id }
    : m.type === "document" && /^(application\/pdf|image\/)/.test(m.document?.mime_type || "") ? { type: "image", id: m.document.id } : { type: "outro" };
  await tratar(env, user, from, msg);
}

/** O Telegram manda a foto em vários tamanhos: o menor com 1000 px já lê qualquer nota e baixa e sobe bem mais rápido. */
const fotoMedia = (fotos) => (fotos.find((f) => Math.max(f.width || 0, f.height || 0) >= 1000) || fotos[fotos.length - 1]).file_id;

/** Telegram (só conversas privadas). "/relatorio setembro" vira "relatorio setembro". */
export async function onTelegram(env, upd) {
  const m = upd.message; if (!m || m.chat?.type !== "private" || !m.from) return;
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO seen(id,t) VALUES(?,?)").bind("tg" + upd.update_id, Date.now()).run();
  if (!ins.meta.changes) return;
  const id = String(m.from.id), to = "tg:" + m.chat.id;
  const text = String(m.text ?? m.caption ?? "").trim().replace(/^\/(\w+)(@\w+)?/, "$1").trim();
  const user = await env.DB.prepare("SELECT * FROM users WHERE tg=?").bind(id).first();
  if (!user) {
    const mm = /^(?:start|vincular)\s+(\d{6})$/i.exec(text.replace(/\s+/g, " "));
    if (mm) return vincular(env, mm[1], "tg", id, to);
    await sendText(env, to, "Olá! Ainda não conheço você. No app Uiraçu, aba *Gastos*, toque em *Conectar ao Telegram* e envie o código aqui.");
    return;
  }
  const doc = m.document && /^(application\/pdf|image\/)/.test(m.document.mime_type || "");
  const msg = m.voice || m.audio ? { type: "audio", id: (m.voice || m.audio).file_id } : m.photo?.length ? { type: "image", id: fotoMedia(m.photo) }
    : doc ? { type: "image", id: m.document.file_id } : text ? { type: "text", text } : { type: "outro" };
  await tratar(env, user, to, msg);
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
  // Apagar TUDO: pede confirmação (vale 5 min); qualquer outra mensagem cancela o pedido.
  const chaveTudo = "apagartudo:" + user.id;
  const pedido = await env.DB.prepare("SELECT t FROM seen WHERE id=?").bind(chaveTudo).first();
  if (pedido) await env.DB.prepare("DELETE FROM seen WHERE id=?").bind(chaveTudo).run();
  if (pedido && Date.now() - pedido.t < 5 * 60e3 && /^(confirmo|sim|sim confirmo|confirmar|apagar tudo|pode apagar)$/.test(n)) {
    const r = await env.DB.prepare("UPDATE expenses SET deleted=1, upd=? WHERE user=? AND deleted=0").bind(Date.now(), user.id).run();
    return sendText(env, from, `🗑️ Pronto: apaguei ${r.meta?.changes ?? 0} lançamento(s), no chat e no app. O app limpa na próxima sincronização.`);
  }
  if (/^(desfazer|apagar|limpar|zerar|excluir|deletar) (todos |tudo|todas )?(os |as )?(gastos|lancamentos|tudo|registros)?$/.test(n) && /(tudo|todos|todas|gastos|lancamentos|registros)/.test(n)) {
    const q = (await env.DB.prepare("SELECT COUNT(*) AS q FROM expenses WHERE user=? AND deleted=0").bind(user.id).first()).q;
    if (!q) return sendText(env, from, "Não há nenhum lançamento para apagar.");
    await env.DB.prepare("INSERT OR REPLACE INTO seen(id,t) VALUES(?,?)").bind(chaveTudo, Date.now()).run();
    return sendText(env, from, `⚠️ Isto apaga *todos os ${q} lançamentos*, no chat e no app. Não tem volta.
Para continuar, responda *confirmo* (vale 5 minutos). Qualquer outra mensagem cancela.`);
  }
  if (pedido) await sendText(env, from, "Pedido de apagar tudo cancelado.");
  if (/^(ajuda|help|menu|comandos|start|oi|ola|bom dia|boa tarde|boa noite|\?)$/.test(n)) return sendText(env, from, AJUDA);
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
  if (/^(relatorio|pdf)\b/.test(n)) { const ym = parseMes(n, hoje); await sendText(env, from, `Gerando o relatório de ${ymLabel(ym)}…`); await env.DB.prepare("UPDATE users SET pending_report=NULL WHERE id=?").bind(user.id).run(); return enviarRelatorio(env, user, ym, { to: from }); }
  if (/^(planilha|csv|excel|exportar)\b/.test(n)) { const ym = parseMes(n, hoje); return enviarRelatorio(env, user, ym, { csv: true, pdf: false, to: from }); }
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
  const ack = sendText(env, from, kind === "audio" ? "🎙️ Ouvindo…" : "🔎 Lendo a nota…").catch(() => {});   // sai em paralelo com o download
  const { bytes, mime } = await downloadMedia(env, from, id); await ack;
  const r = await extrairMidia(env, { kind: kind === "audio" ? "audio" : "image", mime: mime || (kind === "audio" ? "audio/ogg" : "image/jpeg"), bytes, hoje: hojeBRT() });
  if (!r.itens.length) return sendText(env, from, kind === "audio" ? "Ouvi o áudio, mas não achei valores. Tente dizer, por exemplo: \"gastei quarenta e cinco reais no mercado\"." : "Não consegui ler um valor nessa foto. Tente uma foto mais de perto, com o total visível, ou escreva o gasto.");
  await salvarItens(env, user.id, r.itens);
  if (kind === "audio" && r.transcricao) await sendText(env, from, `🎙️ Entendi: “${r.transcricao}”`);
  await confirmar(env, user, from, r.itens);
}

// ------------------------------------------------------------------ resumo semanal
/** Semana = os 7 dias até hoje; compara com os 7 dias anteriores. Investimentos não entram em "gastos". */
export async function resumoSemanal(env, user, hoje) {
  const ini = addDays(hoje, -6), iniAnt = addDays(hoje, -13), fimAnt = addDays(hoje, -7);
  const { results } = await env.DB.prepare("SELECT id,ts,v,c,d,tp FROM expenses WHERE user=? AND deleted=0 AND ts>=? AND ts<=?").bind(user.id, iniAnt, hoje).all();
  const gasto = (r) => r.tp !== "receita" && r.c !== "investimento";
  const esta = results.filter((r) => r.ts >= ini && gasto(r)), ant = results.filter((r) => r.ts >= iniAnt && r.ts <= fimAnt && gasto(r));
  const soma = (l) => Math.round(l.reduce((s, r) => s + r.v, 0) * 100) / 100, g = soma(esta), a = soma(ant);
  const porCat = {}; for (const r of esta) porCat[r.c] = (porCat[r.c] || 0) + r.v;
  const top = Object.entries(porCat).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${catOf(k).n} ${fBRL(v)}`);
  const var_ = a > 0 ? Math.round(((g - a) / a) * 100) : null;
  const ym = hoje.slice(0, 7), S = summarize(await doMes(env, user.id, ym), ym);
  const frase = var_ == null ? "" : var_ === 0 ? " (igual à semana passada)" : ` (${Math.abs(var_)}% ${var_ > 0 ? "a mais" : "a menos"} que na semana passada)`;
  const texto = !esta.length ? "📅 *Resumo da semana*\nNenhum gasto anotado nos últimos 7 dias." : `📅 *Resumo da semana*\nGastos: ${fBRL(g)}${frase}` + (top.length ? `\nMaiores: ${top.join(" · ")}` : "") + `\n\nNo mês: gastos ${fBRL(S.gastos)} · saldo ${fBRL(S.saldo)}`;
  return { texto, push: { title: "Resumo da semana", body: !esta.length ? "Nenhum gasto anotado nos últimos 7 dias." : `Você gastou ${fBRL(g)}${frase}.`, tag: "semana", url: "./#/gastos" }, gasto: g };
}

// ------------------------------------------------------------------ agendador (a cada hora)
export async function agendados(env, agora = Date.now()) {
  const b = new Date(agora - BRT), dia = b.getUTCDate(), hora = b.getUTCHours(), ymNow = b.toISOString().slice(0, 7);
  const dias = new Date(Date.UTC(+ymNow.slice(0, 4), +ymNow.slice(5), 0)).getUTCDate();
  const { results } = await env.DB.prepare("SELECT * FROM users WHERE report_on=1 AND (wa IS NOT NULL OR tg_chat IS NOT NULL) AND report_hour=?").bind(hora).all();
  const feitos = [];
  for (const u of results) {
    if (Math.min(u.report_day, dias) !== dia) continue;
    const marca = `${ymNow}-${dia}`; if (u.last_report === marca) continue;
    const ym = dia <= 10 ? ymAdd(ymNow, -1) : ymNow; // nos primeiros dias do mês o relatório é do mês que fechou
    await env.DB.prepare("UPDATE users SET last_report=? WHERE id=?").bind(marca, u.id).run();
    let modo = "janela";
    if (u.tg_chat || (u.last_inbound && agora - u.last_inbound < 23 * 3600e3)) { try { await enviarRelatorio(env, u, ym, { csv: true }); } catch (e) { modo = "erro"; } }
    else {
      try { await sendTemplate(env, u.wa_raw || u.wa, env.WA_TEMPLATE_REPORT || "relatorio_mensal"); await env.DB.prepare("UPDATE users SET pending_report=? WHERE id=?").bind(ym, u.id).run(); modo = "modelo"; }
      catch (e) { modo = "so_push"; await env.DB.prepare("UPDATE users SET pending_report=? WHERE id=?").bind(ym, u.id).run(); }
    }
    await pushUser(env, u, { title: `Relatório de ${ymLabel(ym).split(" ")[0]}`, body: modo === "janela" ? "Enviei o PDF e a planilha no seu WhatsApp." : "Está pronto. Responda qualquer coisa ao bot no WhatsApp para receber o PDF.", tag: "relatorio", url: "./#/gastos" });
    feitos.push({ user: u.id, ym, modo });
  }
  // resumo semanal: domingo, 18h (Brasília)
  if (b.getUTCDay() === 0 && hora === 18) {
    const hojeIso = b.toISOString().slice(0, 10), { results: sem } = await env.DB.prepare("SELECT * FROM users WHERE weekly_on=1 AND (last_weekly IS NULL OR last_weekly!=?)").bind(hojeIso).all();
    for (const u of sem) {
      await env.DB.prepare("UPDATE users SET last_weekly=? WHERE id=?").bind(hojeIso, u.id).run();
      const r = await resumoSemanal(env, u, hojeIso); let canal = "push";
      if (u.tg_chat || (u.wa && u.last_inbound && agora - u.last_inbound < 23 * 3600e3)) { try { await sendText(env, destino(u), r.texto); canal = u.tg_chat ? "telegram" : "whatsapp"; } catch {} }
      await pushUser(env, u, r.push); feitos.push({ user: u.id, semanal: canal });
    }
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM seen WHERE t<?").bind(agora - 3 * DAY), env.DB.prepare("DELETE FROM links WHERE exp<?").bind(agora)]);
  return feitos;
}
