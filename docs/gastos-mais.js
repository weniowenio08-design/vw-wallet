// Mais recursos de gastos (lógica pura, sem DOM): envelopes (potes), variação de preços, desafios e leitura de extrato CSV do banco.
// Usada pela tela (gastos.js); testada em nuvem/test/mais.test.mjs.
import { summarize, norm, num, guessCat, catOf } from "./gastos-core.js";

const r2 = (v) => Math.round(v * 100) / 100;
const diasEntre = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

// ------------------------------------------------------------ envelopes: a renda do mês dividida em potes
export const PRESETS_ENV = {
  "50-30-20": { nome: "50 / 30 / 20", potes: [
    { k: "necessidades", n: "Necessidades", pct: 50, cats: ["mercado", "moradia", "saude", "transporte", "educacao"] },
    { k: "desejos", n: "Desejos", pct: 30, cats: ["alimentacao", "lazer", "compras", "assinaturas", "outros"] },
    { k: "futuro", n: "Futuro", pct: 20, cats: ["investimento"] },
  ] },
  "60-20-20": { nome: "60 / 20 / 20", potes: [
    { k: "necessidades", n: "Necessidades", pct: 60, cats: ["mercado", "moradia", "saude", "transporte", "educacao"] },
    { k: "desejos", n: "Desejos", pct: 20, cats: ["alimentacao", "lazer", "compras", "assinaturas", "outros"] },
    { k: "futuro", n: "Futuro", pct: 20, cats: ["investimento"] },
  ] },
};
/** Estado de cada pote no mês. renda: o que o usuário definiu, ou as receitas do mês. */
export function envelopes(list, ym, { renda = 0, preset = "50-30-20" } = {}) {
  const S = summarize(list, ym), P = PRESETS_ENV[preset] || PRESETS_ENV["50-30-20"], base = renda > 0 ? renda : S.receitas;
  const potes = P.potes.map((p) => {
    const gasto = r2(p.cats.reduce((s, k) => s + (k === "investimento" ? S.investido : S.porCat.find((c) => c.k === k)?.v || 0), 0)), teto = r2((base * p.pct) / 100), resta = r2(teto - gasto), pr = teto > 0 ? gasto / teto : null;
    // o pote "futuro" é o contrário dos demais: bom é ter guardado (gasto = guardado)
    const futuro = p.k === "futuro";
    return { ...p, teto, gasto, resta, p: pr, nivel: futuro ? (pr != null && pr >= 1 ? "ok" : "alerta") : pr == null ? "ok" : pr >= 1 ? "estourou" : pr >= 0.8 ? "alerta" : "ok", futuro };
  });
  return { base, fonte: renda > 0 ? "informada" : "receitas do mês", potes, nome: P.nome };
}

// ------------------------------------------------------------ variação de preços do mesmo item
const nomeItem = (d) => norm(String(d || "").replace(/\(\d+\/\d+\)\s*$/, "")).replace(/\s+/g, " ").trim();
/** Quanto custou da última vez o mesmo item (mesma descrição), antes de uma data. Para avisar na hora de anotar. */
export function ultimoPreco(list, desc, ate) {
  const k = nomeItem(desc); if (!k) return null;
  const prev = list.filter((x) => !x.deleted && !x.pd && x.tp !== "receita" && nomeItem(x.d) === k && x.ts <= ate).sort((a, b) => (a.ts < b.ts ? 1 : -1))[0];
  return prev ? { v: prev.v, ts: prev.ts } : null;
}
/** Itens comprados mais de uma vez cujo preço mudou (últimos dois preços), do que mais variou para o que menos. */
export function precosQueMudaram(list, { minPct = 0.05, minReais = 2, max = 6 } = {}) {
  const por = new Map();
  for (const x of list) { if (x.deleted || x.pd || x.tp === "receita" || x.pg) continue; const k = nomeItem(x.d); if (k) (por.get(k) || por.set(k, []).get(k)).push(x); }
  const out = [];
  for (const its of por.values()) {
    if (its.length < 2) continue; its.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    const a = its.at(-2), b = its.at(-1), dif = b.v - a.v;
    if (a.v > 0 && Math.abs(dif) >= minReais && Math.abs(dif) / a.v >= minPct) out.push({ nome: b.d, antes: a.v, agora: b.v, delta: dif / a.v, quando: b.ts });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, max);
}

// ------------------------------------------------------------ desafios
export const DESAFIOS = [
  { k: "delivery", nome: "7 dias sem restaurante e delivery", dias: 7, cats: ["alimentacao"] },
  { k: "compras", nome: "14 dias sem compras por impulso", dias: 14, cats: ["compras"] },
  { k: "lazer", nome: "30 dias sem gastos de lazer", dias: 30, cats: ["lazer"] },
  { k: "assinaturas", nome: "30 dias sem assinatura nova", dias: 30, cats: ["assinaturas"] },
];
/** Situação de um desafio { k, nome, dias, cats, ini }: andamento, falhou (com o gasto que quebrou) ou concluído. */
export function statusDesafio(list, d, hoje) {
  const fim = new Date(Date.parse(d.ini + "T12:00:00Z") + (d.dias - 1) * 864e5).toISOString().slice(0, 10);
  const quebra = list.filter((x) => !x.deleted && !x.pd && x.tp !== "receita" && d.cats.includes(x.c) && x.ts >= d.ini && x.ts <= (hoje < fim ? hoje : fim)).sort((a, b) => (a.ts < b.ts ? -1 : 1))[0];
  const dia = Math.min(d.dias, Math.max(1, diasEntre(d.ini, hoje) + 1));
  if (quebra) return { estado: "falhou", dia: Math.max(0, diasEntre(d.ini, quebra.ts)), dias: d.dias, quebra };
  if (hoje > fim) return { estado: "concluido", dia: d.dias, dias: d.dias, restam: 0 };
  return { estado: "andamento", dia, dias: d.dias, restam: d.dias - dia };
}

// ------------------------------------------------------------ extrato CSV do banco
function celulas(linha, delim) {
  const out = []; let cur = "", asp = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') { if (asp && linha[i + 1] === '"') { cur += '"'; i++; } else asp = !asp; }
    else if (ch === delim && !asp) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim()); return out;
}
function dataISO(s, hoje) {
  s = String(s || "").trim().replace(/\s.*$/, "");
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s))) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`; }
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})$/.exec(s))) return `${hoje.slice(0, 4)}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
  return null;
}
/** Lê o texto de um extrato (Nubank, Inter, Itaú, Bradesco ou planilha genérica com data, descrição e valor).
 *  Devolve { itens: [{ ts, v, d, tp, c }], ignoradas, sinais }. Com valores negativos: negativo = gasto, positivo = receita; só positivos (fatura de cartão): tudo é gasto. */
export function lerExtrato(texto, hoje) {
  const linhas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { itens: [], ignoradas: 0, sinais: "vazio" };
  const amostra = linhas.slice(0, 6).join("\n"), delim = (amostra.match(/;/g) || []).length >= (amostra.match(/,/g) || []).length / 2 && /;/.test(amostra) ? ";" : ",";
  let ini = 0, iD = -1, iT = [], iV = -1;
  for (let i = 0; i < Math.min(linhas.length, 12); i++) {
    const c = celulas(linhas[i], delim).map(norm);
    const d = c.findIndex((x) => /^data/.test(x) || x === "date"), v = c.findIndex((x) => /^(valor|amount|value)/.test(x));
    if (d >= 0 && v >= 0) { ini = i + 1; iD = d; iV = v; iT = c.map((x, j) => (j !== d && j !== v && /(descri|lancamento|historico|estabelecimento|title|detalhe|memo)/.test(x) ? j : -1)).filter((j) => j >= 0); if (!iT.length) iT = c.map((x, j) => (j !== d && j !== v && /^(categoria|category)/.test(x) ? j : -1)).filter((j) => j >= 0); break; }
  }
  const linhasDados = linhas.slice(ini).map((l) => celulas(l, delim)), brutos = [];
  let ignoradas = 0;
  for (const c of linhasDados) {
    let d = iD >= 0 ? c[iD] : c.find((x) => dataISO(x, hoje)), v = iV >= 0 ? c[iV] : [...c].reverse().find((x) => /^-?\s*(r\$)?\s*\d[\d.,]*$/i.test(x.replace(/\s/g, ""))), t = iT.length ? [...new Set(iT.map((j) => c[j]).filter(Boolean))].join(" – ") : c.filter((x) => x !== d && x !== v).sort((a, b) => b.length - a.length)[0];
    const ts = dataISO(d, hoje), n = num(String(v ?? "").replace(/[^\d,.\-]/g, ""));
    if (!ts || n == null || !isFinite(n) || n === 0) { ignoradas++; continue; }
    brutos.push({ ts, n, d: String(t || "").replace(/\s+/g, " ").trim().slice(0, 80) });
  }
  const temNeg = brutos.some((x) => x.n < 0), itens = brutos.map((x) => {
    const tp = temNeg ? (x.n < 0 ? "gasto" : "receita") : "gasto";
    return { ts: x.ts, v: r2(Math.abs(x.n)), d: x.d, tp, c: guessCat(x.d, tp) };
  });
  return { itens, ignoradas, sinais: temNeg ? "negativos-sao-gastos" : "tudo-e-gasto" };
}
/** Marca os candidatos que já existem (mesma data, valor e descrição) para não duplicar. */
export function marcaDuplicados(candidatos, list) {
  const ja = new Set(list.filter((x) => !x.deleted).map((x) => `${x.ts}|${r2(x.v)}|${norm(x.d)}`));
  return candidatos.map((c) => ({ ...c, dup: ja.has(`${c.ts}|${r2(c.v)}|${norm(c.d)}`) }));
}
export { catOf };
