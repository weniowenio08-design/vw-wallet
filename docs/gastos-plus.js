// Lógica pura dos recursos extras da aba Gastos (sem DOM): orçamentos, limite do mês, comparativo, série de 6 meses,
// gastos fixos que se lançam sozinhos, meta de economia e busca. Usada pela tela (gastos.js) e testada em nuvem/test.
import { summarize, ymAdd, catOf, norm, contaDe } from "./gastos-core.js";

const two = (n) => String(n).padStart(2, "0");
const diasDoMes = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).getUTCDate();

/** Série dos últimos n meses terminando em ym: [{ ym, gastos, receitas, investido, saldo }] */
export function serie(list, ym, n = 6) {
  return Array.from({ length: n }, (_, i) => { const y = ymAdd(ym, i - n + 1), S = summarize(list, y); return { ym: y, gastos: S.gastos, receitas: S.receitas, investido: S.investido, saldo: S.saldo }; });
}

/** Categorias do mês com o valor do mês anterior e a variação (delta = null quando não havia gasto antes). */
export function comparaCategorias(list, ym) {
  const A = summarize(list, ym), B = summarize(list, ymAdd(ym, -1));
  const ant = Object.fromEntries(B.porCat.map((c) => [c.k, c.v]));
  return A.porCat.map((c) => ({ ...c, ant: ant[c.k] || 0, delta: ant[c.k] ? (c.v - ant[c.k]) / ant[c.k] : null }));
}

/** Situação de um gasto contra um limite: { p, nivel: "ok" | "alerta" (80%+) | "estourou" (100%+) } ou null sem limite. */
export function statusLimite(gasto, limite) {
  if (!limite || limite <= 0) return null;
  const p = gasto / limite; return { p, nivel: p >= 1 ? "estourou" : p >= 0.8 ? "alerta" : "ok" };
}

/** Alertas novos do mês: devolve [{ chave, titulo, corpo }] e marca em `feitos` (objeto do mês) o que já foi avisado. */
export function alertasNovos({ S, limite, orcamentos, feitos, fBRL }) {
  const out = [];
  if (limite > 0) for (const nv of [80, 100]) {
    if (S.gastos >= (limite * nv) / 100 && !feitos["l" + nv]) { feitos["l" + nv] = 1; out.push({ chave: "l" + nv, titulo: nv >= 100 ? "Limite do mês estourou" : "80% do limite do mês", corpo: `Você gastou ${fBRL(S.gastos)} de ${fBRL(limite)}.` }); }
  }
  for (const c of S.porCat) {
    const o = orcamentos?.[c.k];
    if (o > 0 && c.v >= o && !feitos["c" + c.k]) { feitos["c" + c.k] = 1; out.push({ chave: "c" + c.k, titulo: `Orçamento de ${c.n} estourou`, corpo: `${fBRL(c.v)} de ${fBRL(o)} neste mês.` }); }
  }
  return out;
}

/** Lançamentos de gastos fixos que já venceram e ainda não existem. Ids determinísticos: o mesmo fixo no mesmo mês nunca duplica (nem entre aparelhos). */
export function fixosPendentes(fixos, list, hoje) {
  const ids = new Set(list.map((x) => x.id)), out = [], ymHoje = hoje.slice(0, 7);
  for (const f of fixos || []) {
    if (!f.ativo || !(f.v > 0)) continue;
    for (let ym = f.desde || ymHoje; ym <= ymHoje; ym = ymAdd(ym, 1)) {
      const dia = Math.min(Math.max(1, f.dia | 0), diasDoMes(ym)), ts = `${ym}-${two(dia)}`, id = `fx${f.id}${ym.replace("-", "")}`;
      if (ts <= hoje && !ids.has(id)) { ids.add(id); out.push({ id, ts, v: f.v, c: f.c || "outros", d: f.d || "Gasto fixo", tp: "gasto", src: "app", deleted: 0 }); }
    }
  }
  return out;
}

/** Meta de economia: o que sobrou (receitas menos gastos; investir conta como guardar) desde o mês de início. */
export function progressoMeta(list, meta, ymAtual) {
  if (!meta || !(meta.alvo > 0)) return null;
  let guardado = 0, meses = 0; const sobras = [];
  for (let ym = meta.ini || ymAtual; ym <= ymAtual; ym = ymAdd(ym, 1)) {
    const S = summarize(list, ym); const sobra = S.receitas - S.gastos; guardado += sobra; if (S.itens.length) { meses++; sobras.push(sobra); }
  }
  const g = Math.round(guardado * 100) / 100, pct = Math.max(0, Math.min(1, g / meta.alvo));
  const media = meses ? sobras.reduce((a, b) => a + b, 0) / meses : 0;
  const faltam = Math.max(0, meta.alvo - g), prev = faltam <= 0 ? 0 : media > 0 ? Math.ceil(faltam / media) : null;
  return { guardado: g, pct, faltam: Math.round(faltam * 100) / 100, mediaMensal: Math.round(media * 100) / 100, mesesParaFechar: prev };
}

/** Sobra do mês: pode virar o aporte do mês no investimento. */
export const sobraDoMes = (S) => Math.max(0, Math.round((S.receitas - S.gastos - S.investido) * 100) / 100);

/** Busca e filtros: q procura na descrição e na categoria (sem acento); cat filtra por categoria. */
export function filtrar(itens, { q = "", cat = "" } = {}) {
  const t = norm(q);
  return itens.filter((x) => (!cat || x.c === cat) && (!t || norm(`${x.d} ${catOf(x.c, x.tp).n} ${x.m || ""} ${x.l || ""}`).includes(t)));
}

/** Dinheiro estimado em uma conta: saldo informado + receitas - gastos lançados depois dele.
 *  base = { v, ts: "AAAA-MM-DD", skip: [ids] }. Os lançamentos que já existiam no dia em que o saldo foi informado (skip) já estão dentro dele. */
export function saldoConta(list, w, base) {
  if (!base || !isFinite(base.v)) return null;
  const skip = new Set(base.skip || []); let s = base.v;
  for (const x of list) { if (x.deleted || contaDe(x) !== w || x.ts < base.ts || skip.has(x.id)) continue; s += x.tp === "receita" ? x.v : -x.v; }
  return Math.round(s * 100) / 100;
}

// ------------------------------------------------------------ olhares sobre os extras (meio, lote, dedutível, parcelas)
const r2 = (v) => Math.round(v * 100) / 100;
function agrupar(list, ym, chave) {
  const m = new Map();
  for (const x of list) { if (x.deleted || x.tp === "receita" || !x.ts.startsWith(ym)) continue; const k = chave(x); if (k) m.set(k, (m.get(k) || 0) + x.v); }
  return [...m].map(([k, v]) => ({ k, v: r2(v) })).sort((a, b) => b.v - a.v);
}
export const porMeio = (list, ym) => agrupar(list, ym, (x) => x.m);
export const porLote = (list, ym) => agrupar(list, ym, (x) => x.l);
/** Gastos marcados como dedutíveis no ano (ano = "AAAA"). */
export function dedutiveis(list, ano) {
  const its = list.filter((x) => !x.deleted && x.dd && x.tp !== "receita" && x.ts.startsWith(ano));
  return { itens: its, total: r2(its.reduce((s, x) => s + x.v, 0)) };
}
/** Parcelas que ainda vão vencer (data depois de hoje), somadas por mês. */
export function comprometido(list, hoje) {
  const por = new Map();
  for (const x of list) if (!x.deleted && x.pg && x.ts > hoje) por.set(x.ts.slice(0, 7), (por.get(x.ts.slice(0, 7)) || 0) + x.v);
  return [...por].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([ym, v]) => ({ ym, v: r2(v) }));
}
/** Gastos do mês que combinam com um termo: categoria, descrição, meio ou lote ("ração", "nubank", "lote 3"). */
export function buscaTermo(list, ym, termo) {
  const t = norm(termo); if (!t) return [];
  return list.filter((x) => !x.deleted && x.tp !== "receita" && x.ts.startsWith(ym) && [catOf(x.c, x.tp).n, x.d, x.m, x.l].some((s) => s && norm(s).includes(t)));
}
