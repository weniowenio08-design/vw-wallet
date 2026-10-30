// Cérebro do bot de gastos: entende mensagens do WhatsApp, anota no banco, responde e envia relatórios.
import { CATS, CATS_REC, catOf, parseMessage, summarize, toCsv, newId, hojeBRT, ymAdd, ymLabel, dBR, fBRL, norm, parseConta, contaDe, contaNome, valorBR, parseExtras, expandir, EXTRAS, ajustaVencimento, takeDate } from "../../docs/gastos-core.js";
import { saldoConta, buscaTermo } from "../../docs/gastos-plus.js";
import { aVencer, prazo, dataLembrete } from "../../docs/gastos-agenda.js";
import { relatorioPdf } from "../../docs/relatorio.js";
import * as WA from "./wa.js";
import * as TG from "./tg.js";
// "Endereço" de quem conversa: "tg:<chat>" é Telegram; qualquer outro valor é o número do WhatsApp. O resto do código não precisa saber a diferença.
const via = (to) => (String(to).startsWith("tg:") ? TG : WA), idOf = (to) => String(to).replace(/^tg:/, "");
const sendText = (env, to, body) => via(to).sendText(env, idOf(to), String(to).startsWith("tg:") ? body : String(body).replace(/`/g, ""));
const sendDocument = (env, to, bytes, fn, mime, cap) => via(to).sendDocument(env, idOf(to), bytes, fn, mime, cap);
const downloadMedia = (env, to, id) => via(to).downloadMedia(env, id);
const sendTemplate = WA.sendTemplate;
export const destino = (u) => (u.tg_chat ? "tg:" + u.tg_chat : u.wa_raw || u.wa);
import { iaLigada, extrairMidia, extrairTexto } from "./ai.js";
import { sendPush } from "./push.js";
import { normWa, randCode } from "./util.js";

/** Catálogo completo de comandos. No Telegram, /comando é link tocável e `texto` copia com um toque; no WhatsApp, só palavras em negrito. */
function catalogo(tg) {
  const c = (slash, wa, desc) => (tg ? `/${slash} — ${desc}` : `*${wa}* — ${desc}`);
  return `🦅 *Tudo o que eu faço*
${tg ? "_Toque em um /comando para usar. Toque em um texto em destaque para copiar e editar._" : "_Escreva a palavra em negrito para usar._"}

*✍️ Anotar*
\`gastei 45 no mercado\`
\`uber 23,50 ontem\`
\`+1500 salário\`
\`empresa ração 3200\`
\`diesel 450 granja\`
\`notebook 3000 em 6x no nubank\`
\`ração 3200 lote 3\`
\`consulta médica 250 dedutível\`
Várias linhas de uma vez: uma por linha
🎙️ Áudio: conte o gasto falando
🧾 Foto: nota fiscal ou comprovante de Pix

*📊 Ver*
${c("resumo", "resumo", "gastos e receitas do mês")}
${c("ultimos", "últimos", "últimos lançamentos")}
${c("saldo", "saldo", "quanto sobra em cada conta")}
${c("relatorio", "relatório", "PDF do mês")}
${c("planilha", "planilha", "planilha para o Excel")}
\`quanto gastei com ração\` · \`quanto gastei no nubank\`
\`resumo empresa\` · \`relatório setembro\`

*🏢 Empresa e pessoal*
${c("modoempresa", "modo empresa", "tudo que eu anotar vai para a empresa")}
${c("modopessoal", "modo pessoal", "volta para o pessoal")}
\`saldo empresa 100 mil\`
\`saldo pessoal 20000\`

*✏️ Corrigir*
${c("desfazer", "desfazer", "apaga o último lançamento")}
\`categoria transporte\` — corrige a categoria do último
${c("apagartudo", "apagar todos os gastos", "apaga tudo (pede confirmação)")}

*⏰ Lembretes e rotinas*
\`lembra de cobrar o fulano dia 10 às 9h\`
${c("lembretes", "lembretes", "lista os lembretes abertos")}
\`relatório automático dia 30\`
${c("pararrelatorio", "parar relatório", "desliga o relatório automático")}
\`backup automatico\` · ${c("backup", "backup", "planilha completa agora")}

*✏️ Corrigir respondendo*
Responda a mensagem do bot com \`foi 38\`, \`categoria lazer\`, \`empresa\`, \`ontem\` ou \`apagar\`.

*👨‍👩‍👧 Família*
\`convidar familia\` · \`entrar na familia F12345 Maria\`
${c("familia", "familia", "quem está na família")} · \`sair da familia\``;
}

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
• *empresa ração 3200* ou *granja diesel 450* (conta da empresa; sem palavra vai para a pessoal)
• *modo empresa* / *modo pessoal* (vale para os próximos lançamentos)
• *saldo empresa 100 mil* · *saldo pessoal 20000* · *saldo* (quanto sobra em cada conta)
• *comandos* (lista completa, com toque para usar ou copiar)
• *categoria transporte* (corrige o último)
• *relatório automático dia 30* · *parar relatório*`;

// ------------------------------------------------------------------ banco
const LU = (u) => u.owner || u.id;   // de quem é o caderno de lançamentos (o dono da família, ou o próprio usuário)
const tagU = (u) => (u.owner ? u.apelido || "Membro" : u.apelido || undefined);   // "por Maria" nos lançamentos
const extrasJson = (it) => { const e = {}; for (const k of EXTRAS) if (it[k] != null) e[k] = it[k]; return Object.keys(e).length ? JSON.stringify(e) : null; };
/** Linhas do banco -> lançamentos com os extras (m, l, dd, pg) de volta como campos normais. */
export const hidrata = (rows) => rows.map(({ x, ...r }) => { if (x) { try { const e = JSON.parse(x); for (const k of EXTRAS) if (e[k] != null) r[k] = e[k]; } catch {} } return r; });
const upsert = (env, user, it) => env.DB.prepare("INSERT INTO expenses(user,id,ts,v,c,d,tp,src,deleted,upd,w,x) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user,id) DO UPDATE SET ts=excluded.ts,v=excluded.v,c=excluded.c,d=excluded.d,tp=excluded.tp,deleted=excluded.deleted,upd=excluded.upd,w=excluded.w,x=excluded.x").bind(user, it.id, it.ts, it.v, it.c, it.d, it.tp, it.src, it.deleted ? 1 : 0, Date.now(), it.w === "e" ? "e" : "p", extrasJson(it));
export async function salvarItens(env, user, itens) { if (itens.length) await env.DB.batch(itens.map((it) => upsert(env, user, it))); }
export const upsertStmt = upsert;
/** Lançamentos do mês e do mês anterior (o relatório compara os dois). */
export async function doMes(env, user, ym) {
  const { results } = await env.DB.prepare("SELECT id,ts,v,c,d,tp,src,deleted,w,x FROM expenses WHERE user=? AND deleted=0 AND ts>=? AND ts<?").bind(user, ymAdd(ym, -1) + "-01", ymAdd(ym, 1) + "-01").all();
  return hidrata(results);
}
const lerSaldos = (user) => { try { return JSON.parse(user.saldos || "{}") || {}; } catch { return {}; } };
async function saldoAtual(env, user, w) {
  const base = lerSaldos(user)[w]; if (!base) return null;
  const { results } = await env.DB.prepare("SELECT id,ts,v,tp,w FROM expenses WHERE user=? AND deleted=0 AND w=? AND ts>=?").bind(LU(user), w, base.ts).all();
  return saldoConta(results, w, base);
}
const pendentes = async (env, userId) => hidrata((await env.DB.prepare("SELECT id,ts,v,c,d,tp,w,x FROM expenses WHERE user=? AND deleted=0 AND x LIKE '%\"pd\":1%'").bind(userId).all()).results);
const ultimo = (env, user) => env.DB.prepare("SELECT id,ts,v,c,d,tp FROM expenses WHERE user=? AND deleted=0 ORDER BY upd DESC LIMIT 1").bind(user).first();

// ------------------------------------------------------------------ textos
const rel = (ts, hoje) => (ts === hoje ? "hoje" : ts === addDays(hoje, -1) ? "ontem" : dBR(ts).slice(0, 5));
function resumoTxt(S, conta) {
  let t = `📊 *${cap(ymLabel(S.ym))}*${conta ? " · " + conta : ""}\nReceitas: ${fBRL(S.receitas)}\nGastos: ${fBRL(S.gastos)}\nInvestido: ${fBRL(S.investido)}\nSaldo: *${fBRL(S.saldo)}*`;
  if (S.porCat.length) t += "\n\nMaiores categorias:\n" + S.porCat.slice(0, 5).map((c) => `• ${c.n} ${fBRL(c.v)} (${Math.round(c.pct * 100)}%)`).join("\n");
  return t;
}
function linhaItem(it, hoje) { const c = catOf(it.c, it.tp); return `${it.tp === "receita" ? "💰" : it.pd ? "📅" : "✅"}${contaDe(it) === "e" ? "🏢" : ""} ${fBRL(it.v)} · ${c.n}${it.d && it.d !== c.n ? " · " + it.d : ""} · ${rel(it.ts, hoje)}${it.m ? " · 💳 " + it.m : ""}${it.l ? " · 🏷️ " + it.l : ""}${it.dd ? " · dedutível" : ""}${it.pd ? " · a vencer" : ""}${it.u ? " · por " + it.u : ""}`; }

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
  const to = para || destino(user), rows = await doMes(env, LU(user), ym);
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

/** Código de vínculo digitado sem o comando: "123456", "123 456", "123-456", "código 123456". Só vale para chat que ainda não está ligado. */
const codigoSolto = (t) => { const m = /^(?:c[oó]digo\s*:?\s*)?(\d{3})[\s-]?(\d{3})$/i.exec(String(t || "").trim()); return m ? m[1] + m[2] : null; };
const MSG_SEM_CONTA = {
  tg: "Olá! Ainda não conheço você. No app Uiraçu, aba *Gastos*, toque em *Conectar ao Telegram*. Aparece um código de 6 números: *envie só os 6 números aqui* (ou toque no botão do app e depois em Iniciar). O código vale 15 minutos.",
  wa: "Este número ainda não está conectado. No app Uiraçu, aba *Gastos*, toque em *Conectar ao WhatsApp* e envie aqui o código de 6 números que aparece lá.",
};

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
  // A mesma pessoa pode ter duas contas (ex.: Safari e app da Tela de Início no iPhone, ou app reinstalado). Se este chat já estava
  // ligado a outra conta, o histórico vem junto: senão o app novo aparece vazio e os gastos ficam presos na conta antiga.
  const antigo = await env.DB.prepare(canal === "tg" ? "SELECT id FROM users WHERE tg=?" : "SELECT id FROM users WHERE wa=?").bind(id).first();
  let trouxe = 0, mover = [];
  if (antigo && antigo.id !== l.user) {
    trouxe = (await env.DB.prepare("SELECT COUNT(*) AS n FROM expenses WHERE user=? AND deleted=0").bind(antigo.id).first()).n;
    mover = [env.DB.prepare("UPDATE OR IGNORE expenses SET user=?, upd=? WHERE user=?").bind(l.user, Date.now(), antigo.id), env.DB.prepare("UPDATE OR IGNORE lembretes SET user=? WHERE user=?").bind(l.user, antigo.id)];
  }
  await env.DB.batch([...mover, ...st, env.DB.prepare("DELETE FROM links WHERE code=?").bind(code)]);
  await sendText(env, to, "✅ Conectado ao Uiraçu!" + (trouxe ? `\n\n📥 Trouxe ${trouxe} lançamento${trouxe > 1 ? "s" : ""} da sua conta anterior; eles já aparecem no app.` : "") + "\n\n" + AJUDA);
}

/** Mensagem já normalizada: { type: "text" | "audio" | "image" | "outro", text?, id? } */
async function tratar(env, user, to, m) {
  await env.DB.prepare("UPDATE users SET last_inbound=? WHERE id=?").bind(Date.now(), user.id).run();
  if (!String(to).startsWith("tg:")) await env.DB.prepare("UPDATE users SET wa_raw=? WHERE id=?").bind(to, user.id).run();
  try {
    if (user.pending_report && !/^(relat|pdf|planilha)/.test(norm(m.text || ""))) { const ym = user.pending_report; await env.DB.prepare("UPDATE users SET pending_report=NULL WHERE id=?").bind(user.id).run(); await enviarRelatorio(env, user, ym, { csv: true, to }); }
    if (m.type === "text") await texto(env, user, to, m.text, m.replyTo);
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
  const mm = /^vincular\s+(\d{6})$/i.exec(text.replace(/\s+/g, " "));
  if (mm) return vincular(env, mm[1], "wa", wa, from); // vale também para quem já está ligado a outra conta
  const solto = !user && codigoSolto(text);
  if (solto) return vincular(env, solto, "wa", wa, from);
  if (!user) {
    if (permitidos(env).includes(wa)) await sendText(env, from, MSG_SEM_CONTA.wa);
    return;
  }
  const msg = m.type === "text" ? { type: "text", text, replyTo: m.context?.id } : m.type === "audio" ? { type: "audio", id: m.audio?.id } : m.type === "image" ? { type: "image", id: m.image?.id }
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
  const SLASH = { modoempresa: "modo empresa", modopessoal: "modo pessoal", pararrelatorio: "parar relatorio", apagartudo: "apagar todos os gastos" };
  let text = String(m.text ?? m.caption ?? "").trim().replace(/^\/(\w+)(@\w+)?/, "$1").trim();
  text = SLASH[text.toLowerCase()] ?? text;
  const user = await env.DB.prepare("SELECT * FROM users WHERE tg=?").bind(id).first();
  // código de vínculo vale também para quem já está ligado a outra conta (ex.: reinstalou o app): senão vira "gasto" de R$ 123.456
  const mm = /^(?:start|vincular)\s+(\d{6})$/i.exec(text.replace(/\s+/g, " "));
  if (mm) return vincular(env, mm[1], "tg", id, to);
  // Chat ainda não ligado: aceita o código sozinho ("123456", "123 456", "código 123456"). O iPhone nem sempre manda o /start com o código
  // quando o bot já foi iniciado antes, e a pessoa então digita só os números, como o próprio bot pede.
  const solto = !user && codigoSolto(text);
  if (solto) return vincular(env, solto, "tg", id, to);
  if (!user) {
    await sendText(env, to, MSG_SEM_CONTA.tg);
    return;
  }
  const doc = m.document && /^(application\/pdf|image\/)/.test(m.document.mime_type || "");
  const msg = m.voice || m.audio ? { type: "audio", id: (m.voice || m.audio).file_id } : m.photo?.length ? { type: "image", id: fotoMedia(m.photo) }
    : doc ? { type: "image", id: m.document.file_id } : text ? { type: "text", text, replyTo: m.reply_to_message?.message_id } : { type: "outro" };
  await tratar(env, user, to, msg);
}

async function confirmar(env, user, from, itens) {
  if (itens[0].pd) { const h0 = hojeBRT(); return lembraMsg(env, from, await sendText(env, from, itens.map((it) => linhaItem(it, h0)).join("\n") + `\n🔔 Conta a vencer em ${dBR(itens[0].ts)}. Eu aviso na véspera. Quando pagar, diga *paguei* e o nome da conta.`), itens); }
  const hoje = hojeBRT(), ym = itens[0].ts.slice(0, 7), w = contaDe(itens[0]), saldos = lerSaldos(user), usaContas = w === "e" || user.modo === "e" || Object.keys(saldos).length > 0, S = summarize(await doMes(env, LU(user), ym), ym, usaContas ? w : undefined);
  let t = (itens[0].pg ? [itens[0]] : itens).map((it) => linhaItem(it, hoje)).join("\n");
  if (itens[0].pg) t += `\n📆 Parcelado em ${itens[0].pg.n}x de ${fBRL(itens[0].v)}, até ${ymLabel(itens.at(-1).ts.slice(0, 7))}`;
  t += `\n\n${cap(ymLabel(ym).split(" ")[0])}${usaContas ? " · " + contaNome(w) : ""}: gastos ${fBRL(S.gastos)}` + (S.receitas ? ` · receitas ${fBRL(S.receitas)}` : "");
  const sd = await saldoAtual(env, user, w); if (sd != null) t += `\n💼 Em conta (${contaNome(w)}): *${fBRL(sd)}*`;
  if (user.modo === "e") t += "\n_Modo empresa ligado. Digite *modo pessoal* para voltar._";
  t += "\n_Errou? Responda esta mensagem com *foi 38*, *categoria lazer*, *empresa* ou *apagar*._";
  await lembraMsg(env, from, await sendText(env, from, t), itens);
}

async function texto(env, user, from, text, replyTo) {
  const hoje = hojeBRT(), n = norm(text);
  // Apagar TUDO: pede confirmação (vale 5 min); qualquer outra mensagem cancela o pedido.
  const chaveTudo = "apagartudo:" + user.id;
  const pedido = await env.DB.prepare("SELECT t FROM seen WHERE id=?").bind(chaveTudo).first();
  if (pedido) await env.DB.prepare("DELETE FROM seen WHERE id=?").bind(chaveTudo).run();
  if (pedido && Date.now() - pedido.t < 5 * 60e3 && /^(confirmo|sim|sim confirmo|confirmar|apagar tudo|pode apagar)$/.test(n)) {
    const r = await env.DB.prepare("UPDATE expenses SET deleted=1, upd=? WHERE user=? AND deleted=0").bind(Date.now(), LU(user)).run();
    return sendText(env, from, `🗑️ Pronto: apaguei ${r.meta?.changes ?? 0} lançamento(s), no chat e no app. O app limpa na próxima sincronização.`);
  }
  if (/^(desfazer|apagar|limpar|zerar|excluir|deletar) (todos |tudo|todas )?(os |as )?(gastos|lancamentos|tudo|registros)?$/.test(n) && /(tudo|todos|todas|gastos|lancamentos|registros)/.test(n)) {
    if (user.owner) return sendText(env, from, "Só quem criou a família pode apagar todos os lançamentos.");
    const q = (await env.DB.prepare("SELECT COUNT(*) AS q FROM expenses WHERE user=? AND deleted=0").bind(LU(user)).first()).q;
    if (!q) return sendText(env, from, "Não há nenhum lançamento para apagar.");
    await env.DB.prepare("INSERT OR REPLACE INTO seen(id,t) VALUES(?,?)").bind(chaveTudo, Date.now()).run();
    return sendText(env, from, `⚠️ Isto apaga *todos os ${q} lançamentos*, no chat e no app. Não tem volta.
Para continuar, responda *confirmo* (vale 5 minutos). Qualquer outra mensagem cancela.`);
  }
  if (pedido) await sendText(env, from, "Pedido de apagar tudo cancelado.");
  if (replyTo && (await editarPorResposta(env, user, from, text, replyTo, n, hoje))) return;
  if (await comandosExtras(env, user, from, text, n, hoje)) return;
  if (/^(comandos|todos os comandos|lista de comandos|menu|o que voce faz|o que voce sabe fazer)$/.test(n)) {
    const tg = String(from).startsWith("tg:");
    if (tg) await TG.setCommands(env).catch(() => {});   // atualiza o menu "/" do Telegram
    return sendText(env, from, catalogo(tg));
  }
  if (/^(ajuda|help|start|oi|ola|bom dia|boa tarde|boa noite|\?)$/.test(n)) return sendText(env, from, AJUDA);
  if (/^(desfazer|desfaz|apagar ultimo|apagar o ultimo|cancelar ultimo|errei)$/.test(n)) {
    const u = await ultimo(env, LU(user)); if (!u) return sendText(env, from, "Não há nada para desfazer.");
    await env.DB.prepare("UPDATE expenses SET deleted=1, upd=? WHERE user=? AND id=?").bind(Date.now(), LU(user), u.id).run();
    return sendText(env, from, `↩️ Apaguei: ${fBRL(u.v)} · ${u.d || catOf(u.c, u.tp).n}`);
  }
  if (/^(ultimos|ultimas|lista|historico|extrato)( \d+)?$/.test(n)) {
    const { results } = await env.DB.prepare("SELECT ts,v,c,d,tp,w,x FROM expenses WHERE user=? AND deleted=0 AND ts<=? ORDER BY ts DESC, upd DESC LIMIT 10").bind(LU(user), hoje).all();
    return sendText(env, from, results.length ? "🧾 *Últimos lançamentos*\n" + hidrata(results).map((it) => linhaItem(it, hoje)).join("\n") : "Ainda não há lançamentos.");
  }
  let mm;
  if ((mm = /^categoria (.+)$/.exec(n))) {
    const u = await ultimo(env, LU(user)); if (!u) return sendText(env, from, "Não há lançamento para corrigir.");
    const alvo = (u.tp === "receita" ? CATS_REC : CATS).find((c) => norm(c.n) === mm[1] || c.k === mm[1] || norm(c.n).startsWith(mm[1]));
    if (!alvo) return sendText(env, from, "Não conheço essa categoria. Use: " + (u.tp === "receita" ? CATS_REC : CATS).map((c) => c.n).join(", ") + ".");
    await env.DB.prepare("UPDATE expenses SET c=?, upd=? WHERE user=? AND id=?").bind(alvo.k, Date.now(), LU(user), u.id).run();
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
  if ((mm = /^modo( (empresa|empresarial|granjas?|negocio|pessoal))?$/.exec(n))) {
    if (!mm[2]) return sendText(env, from, `Modo atual: *${contaNome(user.modo)}*. Digite *modo empresa* ou *modo pessoal* para trocar.`);
    const w = /pessoal/.test(mm[2]) ? "p" : "e"; await env.DB.prepare("UPDATE users SET modo=? WHERE id=?").bind(w, user.id).run(); user.modo = w;
    return sendText(env, from, w === "e" ? "🏢 Modo *empresa* ligado: o que eu anotar agora vai para a conta da Empresa. Digite *modo pessoal* para voltar." : "👤 Modo *pessoal* ligado: o que eu anotar agora vai para a conta Pessoal.");
  }
  const NC = "(empresa|empresarial|granjas?|negocio|pessoal)";
  if ((mm = new RegExp("^(?:saldo|caixa|tenho)\\s+(?:d[aeo]s?\\s+|n[aeo]s?\\s+)?" + NC + "\\s+(?:em\\s+)?(.+)$").exec(n)) || (mm = new RegExp("^tenho\\s+(.+?)\\s+(?:n[aeo]s?|d[aeo]s?)\\s+" + NC + "$").exec(n)) && ((mm = [mm[0], mm[2], mm[1]]))) {
    const w = /pessoal/.test(mm[1]) ? "p" : "e", v = valorBR(mm[2]);
    if (v == null) return sendText(env, from, "Não entendi o valor. Exemplo: *saldo empresa 100 mil* ou *saldo pessoal 20000*.");
    const { results } = await env.DB.prepare("SELECT id FROM expenses WHERE user=? AND deleted=0 AND w=? AND ts>=? LIMIT 200").bind(LU(user), w, hoje).all();
    const sd = lerSaldos(user); sd[w] = { v, ts: hoje, skip: results.map((r) => r.id) };
    await env.DB.prepare("UPDATE users SET saldos=? WHERE id=?").bind(JSON.stringify(sd), user.id).run(); user.saldos = JSON.stringify(sd);
    return sendText(env, from, `💼 Anotei: *${contaNome(w)}* com ${fBRL(v)}. A partir de agora eu desconto os gastos e somo as receitas dessa conta. Digite *saldo* para ver quanto sobra.`);
  }
  if ((mm = new RegExp("^(?:saldo|caixa|contas?|quanto tenho)(?:\\s+(?:d[aeo]s?\\s+|n[aeo]s?\\s+)?" + NC + ")?$").exec(n))) {
    const sd = lerSaldos(user), alvo = mm[1] ? [/pessoal/.test(mm[1]) ? "p" : "e"] : ["p", "e"].filter((k) => sd[k]);
    if (alvo.length && alvo.every((k) => sd[k])) {
      const linhasSd = []; for (const k of alvo) linhasSd.push(`${k === "e" ? "🏢" : "👤"} ${contaNome(k)}: *${fBRL(await saldoAtual(env, user, k))}* (informado ${fBRL(sd[k].v)} em ${dBR(sd[k].ts)})`);
      return sendText(env, from, "💼 *Dinheiro em conta (estimado)*\n" + linhasSd.join("\n") + "\n_Vale só o que foi anotado aqui._");
    }
    if (mm[1] || !/^saldo$/.test(n)) return sendText(env, from, "Ainda não sei quanto você tem. Diga, por exemplo: *saldo empresa 100 mil* e *saldo pessoal 20000*.");
  }
  if (/^(contas a vencer|vencimentos|o que vence|boletos|a pagar|contas a pagar)$/.test(n)) {
    const lista = aVencer(await pendentes(env, LU(user)), hoje).slice(0, 12);
    return sendText(env, from, lista.length ? "📅 *Contas a vencer*\n" + lista.map((x) => `• ${dBR(x.ts).slice(0, 5)} (${prazo(x.dias)}) ${x.d || catOf(x.c).n} ${fBRL(x.v)}`).join("\n") + "\n_Quando pagar, diga *paguei* e o nome da conta._" : "Nenhuma conta a vencer. Para anotar: *boleto luz 180 dia 5*.");
  }
  if ((mm = /^(?:paguei|pago|quitei|dar baixa em|baixa)\s+(?:o |a |os |as |no |na )?(.+)$/.exec(n))) {   // só age se existir uma conta a vencer com esse nome; senão é um gasto comum
    const alvo = aVencer(await pendentes(env, LU(user)), hoje).find((x) => norm(`${x.d} ${catOf(x.c, x.tp).n}`).includes(mm[1].trim()));
    if (alvo) {
      await env.DB.prepare("UPDATE expenses SET x=?, ts=?, upd=? WHERE user=? AND id=?").bind(extrasJson({ ...alvo, pd: null }), hoje, Date.now(), LU(user), alvo.id).run();
      return sendText(env, from, `✅ Baixa dada: ${alvo.d || catOf(alvo.c).n} ${fBRL(alvo.v)}. Entrou nos gastos de hoje.`);
    }
  }
  if ((mm = /^quanto (?:eu )?(?:gastei|paguei|foi|deu|gasto)\s+(?:com |em |no |na |nos |nas |de |do |da |pra |para )?(.+)$/.exec(n))) {
    const ym = parseMes(n, hoje);
    let termo = mm[1].replace(/\b(?:este|esse|neste|nesse|no) mes\b|\b(?:mes passado|mes anterior|ultimo mes)\b|\b\d{1,2}\/\d{2,4}\b|\b(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\b(?:hoje|ate agora|agora)\b/g, " ").replace(/\s+/g, " ").trim();
    const pcq = parseConta(termo); termo = pcq.text;
    if (termo && !/^(no|em|de|do|da)$/.test(termo)) {
      const pal = termo.split(" "), bonito = text.split(/\s+/).filter((w) => pal.includes(norm(w))).join(" ") || termo;   // mostra a palavra como foi escrita (com acento)
      const todos = (await doMes(env, LU(user), ym)).filter((x) => !pcq.w || contaDe(x) === pcq.w), ach = buscaTermo(todos, ym, termo), tot = ach.reduce((s, x) => s + x.v, 0);
      if (!ach.length) return sendText(env, from, `Não achei gastos com *${bonito}* em ${ymLabel(ym)}.`);
      return sendText(env, from, `🔎 *${bonito}* em ${ymLabel(ym)}: *${fBRL(tot)}* (${ach.length} lançamento${ach.length > 1 ? "s" : ""})\n` + ach.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 6).map((it) => linhaItem(it, hoje)).join("\n"));
    }
  }
  if (/^(resumo|saldo|quanto gastei|balanco)\b/.test(n)) { const ym = parseMes(n, hoje), its = await doMes(env, LU(user), ym), cw = new RegExp("\\b" + NC + "\\b").exec(n);
    if (cw) { const w = /pessoal/.test(cw[1]) ? "p" : "e"; return sendText(env, from, resumoTxt(summarize(its, ym, w), contaNome(w))); }
    if (its.some((x) => contaDe(x) === "e" && x.ts.startsWith(ym))) return sendText(env, from, resumoTxt(summarize(its, ym, "p"), "Pessoal") + "\n\n" + resumoTxt(summarize(its, ym, "e"), "Empresa"));
    return sendText(env, from, resumoTxt(summarize(its, ym)) + porPessoa(summarize(its, ym))); }

  const wlDef = user.modo === "e" ? "e" : "p";
  const lancar = (linha, padrao = wlDef) => { const c1 = parseConta(linha), x1 = parseExtras(c1.text), p1 = parseMessage(x1.text, hoje); return p1.ok ? expandir(ajustaVencimento(p1, x1, hoje), x1, { src: "wa", w: c1.w || padrao, ...(tagU(user) ? { u: tagU(user) } : {}) }) : null; };
  const partes = text.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  if (partes.length >= 2) {   // várias linhas numa mensagem só: "ração 3200 / diesel 450 / vacina 600"
    const w0 = parseConta(partes[0]).w || wlDef;   // "empresa" na primeira linha vale para as outras
    const todos = partes.flatMap((l) => lancar(l, w0) || []);
    if (todos.length) { await salvarItens(env, LU(user), todos); return confirmar(env, user, from, todos); }
  }
  const pc = parseConta(text), wl = pc.w || wlDef, its1 = lancar(text);
  if (its1) { await salvarItens(env, LU(user), its1); return confirmar(env, user, from, its1); }
  if (iaLigada(env) && /\d/.test(text) && (await usaIa(env, user))) {
    const r = await extrairTexto(env, pc.text, hoje), its = r.itens.map((x) => ({ ...x, w: wl, ...(tagU(user) ? { u: tagU(user) } : {}) }));
    if (its.length) { await salvarItens(env, LU(user), its); return confirmar(env, user, from, its); }
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
  const its = r.itens.map((x) => ({ ...x, w: user.modo === "e" ? "e" : "p", ...(tagU(user) ? { u: tagU(user) } : {}) }));
  await salvarItens(env, LU(user), its);
  if (kind === "audio" && r.transcricao) await sendText(env, from, `🎙️ Entendi: “${r.transcricao}”`);
  await confirmar(env, user, from, its);
}


// ------------------------------------------------------------------ edição por resposta, família, lembretes e backup
/** Guarda de qual mensagem do bot saiu cada lançamento, para o usuário corrigir respondendo a ela (vale por 3 dias). */
async function lembraMsg(env, from, r, itens) {
  const mid = String(from).startsWith("tg:") ? r?.message_id : r?.messages?.[0]?.id; if (!mid) return;
  await env.DB.batch((itens[0].pg ? [itens[0]] : itens).slice(0, 5).map((it) => env.DB.prepare("INSERT OR IGNORE INTO seen(id,t) VALUES(?,?)").bind(`msg:${from}:${mid}:${it.id}`, Date.now())));
}
const porPessoa = (S) => {
  const por = new Map(); for (const x of S.itens) if (x.tp !== "receita" && !x.pd) { const k = x.u || "Sem nome"; por.set(k, (por.get(k) || 0) + x.v); }
  return por.size >= 2 ? "\n\n👨‍👩‍👧 Por pessoa: " + [...por].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fBRL(v)}`).join(" · ") : "";
};

async function editarPorResposta(env, user, from, text, replyTo, n, hoje) {
  const { results } = await env.DB.prepare("SELECT id FROM seen WHERE id LIKE ?").bind(`msg:${from}:${replyTo}:%`).all();
  if (!results.length) return false;
  const ids = results.map((r) => r.id.split(":").pop()), L = LU(user);
  const rows = hidrata((await env.DB.prepare(`SELECT id,ts,v,c,d,tp,w,x FROM expenses WHERE user=? AND deleted=0 AND id IN (${ids.map(() => "?").join(",")})`).bind(L, ...ids).all()).results);
  if (!rows.length) return false;
  const it = rows[0], agora = Date.now(), nome = it.d || catOf(it.c, it.tp).n;
  if (/^(apaga|apagar|exclui|excluir|remove|remover|desfaz|desfazer|cancela|cancelar)( tudo| esse| essa| este| esta)?$/.test(n)) {
    let alvo = rows;
    if (it.pg) alvo = hidrata((await env.DB.prepare("SELECT id,ts,v,c,d,tp,w,x FROM expenses WHERE user=? AND deleted=0 AND x LIKE ?").bind(L, `%"g":"${it.pg.g}"%`).all()).results);
    await env.DB.batch(alvo.map((x) => env.DB.prepare("UPDATE expenses SET deleted=1, upd=? WHERE user=? AND id=?").bind(agora, L, x.id)));
    await sendText(env, from, `↩️ Apaguei ${alvo.length > 1 ? alvo.length + " lançamentos (o parcelado inteiro)" : fBRL(it.v) + " · " + nome}.`); return true;
  }
  const quer = /^(?:foi|era|na verdade (?:foi|era)|corrige(?: para)?|corrigir para|muda(?:r)? para|valor)?\s*(?:r\$\s*)?(\d[\d.,]*)\s*(?:reais)?$/.exec(n), cat = /^categoria (.+)$/.exec(n), cont = /^(?:conta )?(empresa|empresarial|granjas?|negocio|pessoal)$/.exec(n), desc = /^(?:descricao|nome) (.+)$/.exec(n), td = takeDate(text, hoje);
  const dataSo = td.rest === "" && (td.date !== hoje || /\bhoje\b/.test(n));
  if (!(quer || cat || cont || desc || dataSo)) return false;
  if (rows.length > 1) { await sendText(env, from, "Essa mensagem tem vários lançamentos. Para corrigir um deles, use *últimos* e anote de novo, ou responda *apagar*."); return true; }
  const up = (campos, ...vals) => env.DB.prepare(`UPDATE expenses SET ${campos}, upd=? WHERE user=? AND id=?`).bind(...vals, agora, L, it.id).run();
  if (quer) {
    const v = valorBR(quer[1]); if (v == null) return false;
    if (it.pg) { await sendText(env, from, "Esse lançamento é parcelado. Responda *apagar* para tirar todas as parcelas e anote de novo."); return true; }
    await up("v=?", v); await sendText(env, from, `✏️ Corrigi o valor: ${fBRL(it.v)} → *${fBRL(v)}* · ${nome}`); return true;
  }
  if (cat) {
    const alvo = (it.tp === "receita" ? CATS_REC : CATS).find((c) => norm(c.n) === cat[1] || c.k === cat[1] || norm(c.n).startsWith(cat[1]));
    if (!alvo) { await sendText(env, from, "Não conheço essa categoria. Use: " + (it.tp === "receita" ? CATS_REC : CATS).map((c) => c.n).join(", ") + "."); return true; }
    await up("c=?", alvo.k); await sendText(env, from, `✏️ Categoria: *${alvo.n}* · ${fBRL(it.v)} ${it.d || ""}`.trim()); return true;
  }
  if (cont) { const w = /pessoal/.test(cont[1]) ? "p" : "e"; await up("w=?", w); await sendText(env, from, `✏️ Passei para a conta *${contaNome(w)}*: ${fBRL(it.v)} · ${nome}`); return true; }
  if (desc) { const novo = text.replace(/^\S+\s+/, "").trim().slice(0, 80); await up("d=?", novo); await sendText(env, from, `✏️ Descrição: *${novo}* · ${fBRL(it.v)}`); return true; }
  if (dataSo) { await up("ts=?", td.date); await sendText(env, from, `✏️ Data: *${dBR(td.date)}* · ${fBRL(it.v)} · ${nome}`); return true; }
  return false;
}

const hojeHora = () => { const b = new Date(Date.now() - BRT); return b.getUTCHours(); };
async function backupCsv(env, user, to) {
  const { results } = await env.DB.prepare("SELECT id,ts,v,c,d,tp,src,deleted,w,x FROM expenses WHERE user=? AND deleted=0 ORDER BY ts").bind(LU(user)).all();
  await sendDocument(env, to, new TextEncoder().encode(toCsv(hidrata(results))), `Uiracu-backup-${hojeBRT()}.csv`, "text/csv", `💾 Backup completo: ${results.length} lançamentos. Guarde em um lugar seguro.`);
  return results.length;
}

/** Família, lembretes, backup e apelido. Devolve true se tratou a mensagem. */
async function comandosExtras(env, user, from, text, n, hoje) {
  let mm;
  // ---- família: um caderno de lançamentos compartilhado, cada um lança pelo seu bot
  if (/^(convidar familia|convite familia|criar convite familia|familia convite)$/.test(n)) {
    if (user.owner) { await sendText(env, from, "Você participa da família de outra pessoa; só quem a criou convida mais gente."); return true; }
    const cod = "F" + String(randCode()).replace(/\D/g, "").slice(0, 5).padEnd(5, "0");
    await env.DB.prepare("INSERT OR REPLACE INTO links(code,user,exp) VALUES(?,?,?)").bind(cod, user.id, Date.now() + 24 * 3600e3).run();
    await sendText(env, from, `👨‍👩‍👧 Convite: *${cod}* (vale 24 horas).\nA pessoa precisa já ter o Uiraçu ligado ao bot dela e dizer:\n\`entrar na familia ${cod} Maria\`\nO que ela anotar entra no seu caderno, marcado "por Maria".`); return true;
  }
  if ((mm = /^fam[ií]lia\s+(f\d{5})\s*(.*)$/i.exec(text.replace(/^(?:entrar|entro|participar)\s+(?:na|da|de)?\s*/i, "").trim())) && /^(?:entrar|entro|participar)/i.test(text.trim())) {
    if (user.owner) { await sendText(env, from, "Você já está em uma família. Diga *sair da familia* antes."); return true; }
    const cod = mm[1].toUpperCase(), lk = await env.DB.prepare("SELECT * FROM links WHERE code=? AND exp>?").bind(cod, Date.now()).first();
    if (!lk || lk.user === user.id) { await sendText(env, from, "Esse convite não existe ou venceu. Peça outro a quem criou a família."); return true; }
    const dono = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(lk.user).first(); if (!dono || dono.owner) { await sendText(env, from, "Esse convite não é válido."); return true; }
    const ap = (mm[2] || "").trim().slice(0, 16) || "Membro", apelido = ap.charAt(0).toUpperCase() + ap.slice(1);
    await env.DB.batch([env.DB.prepare("UPDATE users SET owner=?, apelido=? WHERE id=?").bind(dono.id, apelido, user.id), env.DB.prepare("DELETE FROM links WHERE code=?").bind(cod)]);
    user.owner = dono.id; user.apelido = apelido;
    try { await sendText(env, destino(dono), `👨‍👩‍👧 *${apelido}* entrou na sua família. O que ela anotar aparece no seu caderno, marcado "por ${apelido}".`); } catch {}
    await sendText(env, from, `✅ Você entrou na família${dono.apelido ? " de " + dono.apelido : ""}. Agora o que você anotar vai para o caderno compartilhado, marcado "por ${apelido}". Para sair: *sair da familia*.`); return true;
  }
  if (/^(sair da familia|sair familia|deixar familia)$/.test(n)) {
    if (!user.owner) { await sendText(env, from, "Você não está na família de ninguém."); return true; }
    await env.DB.prepare("UPDATE users SET owner=NULL WHERE id=?").bind(user.id).run(); user.owner = null;
    await sendText(env, from, "Você saiu da família. O que já foi anotado continua no caderno de quem a criou; a partir de agora o seu caderno é só seu."); return true;
  }
  if (/^(familia|minha familia|membros)$/.test(n)) {
    if (user.owner) { const d = await env.DB.prepare("SELECT apelido FROM users WHERE id=?").bind(user.owner).first(); await sendText(env, from, `👨‍👩‍👧 Você está na família${d?.apelido ? " de " + d.apelido : ""}, como *${user.apelido || "Membro"}*.`); return true; }
    const { results } = await env.DB.prepare("SELECT apelido FROM users WHERE owner=?").bind(user.id).all();
    await sendText(env, from, results.length ? "👨‍👩‍👧 *Família*\n" + results.map((r) => "• " + (r.apelido || "Membro")).join("\n") + "\n_Para convidar mais: *convidar familia*._" : "Ninguém na sua família ainda. Diga *convidar familia* para gerar um convite."); return true;
  }
  if ((mm = /^remover (?:da )?familia (.+)$/.exec(n)) && !user.owner) {
    const r = await env.DB.prepare("UPDATE users SET owner=NULL WHERE owner=? AND lower(apelido)=?").bind(user.id, mm[1].trim()).run();
    await sendText(env, from, r.meta.changes ? "Removi da família." : "Não achei ninguém com esse nome na família."); return true;
  }
  if ((mm = /^meu (?:apelido|nome) (?:e |eh )?(.+)$/.exec(n))) {
    const ap = text.replace(/^\S+\s+\S+\s+(?:é |e |eh )?/i, "").trim().slice(0, 16); if (!ap) return false;
    await env.DB.prepare("UPDATE users SET apelido=? WHERE id=?").bind(ap, user.id).run(); user.apelido = ap;
    await sendText(env, from, `Combinado: seus lançamentos aparecem como "por ${ap}".`); return true;
  }
  // ---- lembretes ("lembra de cobrar o fulano dia 10")
  if ((mm = /^(?:me\s+)?(?:lembra|lembre|lembrar|avisa|avise)(?:\s+me)?(?:\s+(?:de|que|para|pra))?\s+(.+)$/i.exec(text.trim()))) {
    const r = dataLembrete(mm[1], hoje);
    if (!r.texto) { await sendText(env, from, "Do que devo lembrar? Ex.: *lembra de cobrar o fulano dia 10 às 9h*."); return true; }
    const q = (await env.DB.prepare("SELECT COUNT(*) AS q FROM lembretes WHERE user=? AND done=0").bind(user.id).first()).q;
    if (q >= 50) { await sendText(env, from, "Você já tem 50 lembretes abertos. Dê baixa em alguns com *feito 1*."); return true; }
    await env.DB.prepare("INSERT INTO lembretes(id,user,ts,h,txt,done) VALUES(?,?,?,?,?,0)").bind(newId(), user.id, r.date, r.h, r.texto.slice(0, 200)).run();
    await sendText(env, from, `⏰ Combinado: *${r.texto}* em ${dBR(r.date)}, às ${String(r.h).padStart(2, "0")}h. Eu aviso aqui e no celular.`); return true;
  }
  if (/^(lembretes|meus lembretes|compromissos)$/.test(n)) {
    const { results } = await env.DB.prepare("SELECT * FROM lembretes WHERE user=? AND done=0 ORDER BY ts,h,id LIMIT 20").bind(user.id).all();
    await sendText(env, from, results.length ? "⏰ *Lembretes*\n" + results.map((l, i) => `${i + 1}. ${dBR(l.ts).slice(0, 5)} ${String(l.h).padStart(2, "0")}h · ${l.txt}`).join("\n") + "\n_Para dar baixa: *feito 1*._" : "Nenhum lembrete. Diga, por exemplo: *lembra de cobrar o fulano dia 10*."); return true;
  }
  if ((mm = /^(?:feito|concluido|conclui|ok|apagar lembrete|remover lembrete|cancelar lembrete|tirar lembrete)\s+(\d{1,2})$/.exec(n))) {
    const { results } = await env.DB.prepare("SELECT id,txt FROM lembretes WHERE user=? AND done=0 ORDER BY ts,h,id LIMIT 20").bind(user.id).all(), alvo = results[+mm[1] - 1];
    if (!alvo) return false;
    await env.DB.prepare("UPDATE lembretes SET done=1 WHERE id=?").bind(alvo.id).run(); await sendText(env, from, `✅ Pronto: ${alvo.txt}`); return true;
  }
  // ---- backup
  if (/^(parar backup|desligar backup|cancelar backup)( mensal| automatico)?$/.test(n)) { await env.DB.prepare("UPDATE users SET backup_on=0 WHERE id=?").bind(user.id).run(); await sendText(env, from, "Parei o backup automático. Peça *backup* quando quiser."); return true; }
  if (/^(backup automatico|ligar backup|ativar backup|backup mensal)$/.test(n)) { await env.DB.prepare("UPDATE users SET backup_on=1 WHERE id=?").bind(user.id).run(); await sendText(env, from, "✅ Todo dia 1º, às 9h, eu te envio a planilha completa de todos os lançamentos, como cópia de segurança. Para parar: *parar backup*."); return true; }
  if (/^backup$/.test(n)) { await backupCsv(env, user, from); return true; }
  return false;
}

// ------------------------------------------------------------------ resumo semanal
/** Semana = os 7 dias até hoje; compara com os 7 dias anteriores. Investimentos não entram em "gastos". */
export async function resumoSemanal(env, user, hoje) {
  const ini = addDays(hoje, -6), iniAnt = addDays(hoje, -13), fimAnt = addDays(hoje, -7);
  const { results } = await env.DB.prepare("SELECT id,ts,v,c,d,tp FROM expenses WHERE user=? AND deleted=0 AND ts>=? AND ts<=?").bind(LU(user), iniAnt, hoje).all();
  const gasto = (r) => r.tp !== "receita" && r.c !== "investimento";
  const esta = results.filter((r) => r.ts >= ini && gasto(r)), ant = results.filter((r) => r.ts >= iniAnt && r.ts <= fimAnt && gasto(r));
  const soma = (l) => Math.round(l.reduce((s, r) => s + r.v, 0) * 100) / 100, g = soma(esta), a = soma(ant);
  const porCat = {}; for (const r of esta) porCat[r.c] = (porCat[r.c] || 0) + r.v;
  const top = Object.entries(porCat).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${catOf(k).n} ${fBRL(v)}`);
  const var_ = a > 0 ? Math.round(((g - a) / a) * 100) : null;
  const ym = hoje.slice(0, 7), S = summarize(await doMes(env, LU(user), ym), ym);
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
  // lembrete de contas a vencer: todo dia às 8h (Brasília), uma vez por conta e por dia (hoje, amanhã e atrasadas até 7 dias)
  if (hora === 8) {
    const hojeIso = b.toISOString().slice(0, 10), { results: ven } = await env.DB.prepare("SELECT id,user,ts,v,c,d,tp,w,x FROM expenses WHERE deleted=0 AND x LIKE '%\"pd\":1%' AND ts<=? AND ts>=?").bind(addDays(hojeIso, 1), addDays(hojeIso, -7)).all();
    const porUser = new Map();
    for (const it of hidrata(ven)) {
      if (!it.pd) continue;
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO seen(id,t) VALUES(?,?)").bind(`venc:${it.id}:${hojeIso}`, agora).run();
      if (ins.meta.changes) { if (!porUser.has(it.user)) porUser.set(it.user, []); porUser.get(it.user).push(it); }
    }
    for (const [uid, its] of porUser) {
      const u = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(uid).first(); if (!u) continue;
      const lista = aVencer(its, hojeIso), linha = (x) => `${x.d || catOf(x.c).n} ${fBRL(x.v)} (${prazo(x.dias)})`;
      let canal = "push";
      if (u.tg_chat || (u.wa && u.last_inbound && agora - u.last_inbound < 23 * 3600e3)) { try { await sendText(env, destino(u), "🔔 *Contas a vencer*\n" + lista.map((x) => "• " + linha(x)).join("\n") + "\n_Diga *paguei* e o nome da conta para dar baixa._"); canal = u.tg_chat ? "telegram" : "whatsapp"; } catch {} }
      await pushUser(env, u, { title: "Contas a vencer", body: lista.slice(0, 3).map(linha).join(" · "), tag: "vencimentos" });
      feitos.push({ user: uid, vencimentos: lista.length, canal });
    }
  }
  // lembretes: avisa na hora marcada (ou assim que o servidor acordar, se passou)
  {
    const hojeIso = b.toISOString().slice(0, 10), { results: lem } = await env.DB.prepare("SELECT * FROM lembretes WHERE done=0 AND (ts<? OR (ts=? AND h<=?)) LIMIT 100").bind(hojeIso, hojeIso, hora).all();
    for (const l of lem) {
      await env.DB.prepare("UPDATE lembretes SET done=1 WHERE id=?").bind(l.id).run();
      const u = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(l.user).first(); if (!u) continue;
      const atras = l.ts < hojeIso; let canal = "push";
      if (u.tg_chat || (u.wa && u.last_inbound && agora - u.last_inbound < 23 * 3600e3)) { try { await sendText(env, destino(u), `⏰ *Lembrete*: ${l.txt}${atras ? " _(atrasado)_" : ""}`); canal = u.tg_chat ? "telegram" : "whatsapp"; } catch {} }
      await pushUser(env, u, { title: "Lembrete", body: l.txt, tag: "lembrete" }); feitos.push({ user: u.id, lembrete: l.id, canal });
    }
  }
  // backup mensal: dia 1º, 9h (Brasília), para quem ligou
  if (dia === 1 && hora === 9) {
    const { results: bk } = await env.DB.prepare("SELECT * FROM users WHERE backup_on=1 AND (last_backup IS NULL OR last_backup!=?)").bind(ymNow).all();
    for (const u of bk) {
      await env.DB.prepare("UPDATE users SET last_backup=? WHERE id=?").bind(ymNow, u.id).run(); let canal = "push";
      if (u.tg_chat || (u.wa && u.last_inbound && agora - u.last_inbound < 23 * 3600e3)) { try { await backupCsv(env, u, destino(u)); canal = u.tg_chat ? "telegram" : "whatsapp"; } catch {} }
      if (canal === "push") await pushUser(env, u, { title: "Backup do mês", body: "Peça *backup* ao bot para receber a planilha completa.", tag: "backup" });
      feitos.push({ user: u.id, backup: canal });
    }
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM seen WHERE t<?").bind(agora - 3 * DAY), env.DB.prepare("DELETE FROM links WHERE exp<?").bind(agora)]);
  return feitos;
}
