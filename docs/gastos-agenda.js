// Agenda e planejamento dos gastos (lógica pura, sem DOM): contas a vencer, fatura do cartão, "posso gastar?" e fechamento do mês.
// Usada pela tela (gastos.js) e pelo bot (bot.js); testada em nuvem/test/agenda.test.mjs.
// Lançamento "a vencer": o mesmo formato dos demais, com pd: 1 (ainda não pago). Ele NÃO entra nos totais do mês até receber baixa.
import { summarize, ymAdd, catOf, fBRL } from "./gastos-core.js";
import { comparaCategorias } from "./gastos-plus.js";

const r2 = (v) => Math.round(v * 100) / 100;
const two = (n) => String(n).padStart(2, "0");
const diasEntre = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const ultimoDia = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).getUTCDate();
const dia = (ym, d) => `${ym}-${two(Math.min(d, ultimoDia(ym)))}`;
const soma = (its) => r2(its.reduce((s, x) => s + x.v, 0));

/** Contas ainda não pagas, da mais próxima à mais distante, com os dias que faltam (negativo = atrasada). */
export function aVencer(list, hoje) {
  return list.filter((x) => !x.deleted && x.pd).map((x) => ({ ...x, dias: diasEntre(hoje, x.ts) })).sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}
/** Dias do mês com contas a vencer: { "2026-10-30": [itens] }. */
export function calendarioMes(list, ym) {
  const m = {}; for (const x of list) if (!x.deleted && x.pd && x.ts.startsWith(ym)) (m[x.ts] ||= []).push(x);
  return m;
}
/** Texto curto do prazo: "hoje", "amanhã", "em 5 dias", "atrasada 2 dias". */
export const prazo = (dias) => (dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dias > 1 ? `em ${dias} dias` : `atrasada ${-dias} dia${dias === -1 ? "" : "s"}`);

/** Fatura de um cartão. cartao = { nome, corte, venc } (dias do mês). Conta os gastos cujo meio de pagamento é o nome do cartão. */
export function faturaCartao(list, cartao, hoje) {
  const ym = hoje.slice(0, 7), dHoje = +hoje.slice(8, 10), corte = Math.min(31, Math.max(1, +cartao.corte || 1)), venc = Math.min(31, Math.max(1, +cartao.venc || 1));
  const nome = String(cartao.nome || "").trim().toLowerCase();
  const doCartao = (x) => !x.deleted && !x.pd && x.tp !== "receita" && String(x.m || "").trim().toLowerCase() === nome;
  const entre = (de, ate) => soma(list.filter((x) => doCartao(x) && x.ts > de && x.ts <= ate));
  const fechaYm = dHoje <= corte ? ym : ymAdd(ym, 1), fecha = dia(fechaYm, corte), ini = dia(ymAdd(fechaYm, -1), corte);
  const vencimento = dia(venc > corte ? fechaYm : ymAdd(fechaYm, 1), venc);
  // fatura que já fechou mas ainda não venceu
  const antIni = dia(ymAdd(fechaYm, -2), corte), antVenc = dia(venc > corte ? ymAdd(fechaYm, -1) : fechaYm, venc);
  const fechada = antVenc >= hoje ? { total: entre(antIni, ini), vencimento: antVenc, dias: diasEntre(hoje, antVenc) } : null;
  return { ini, fecha, vencimento, total: entre(ini, fecha), proxima: entre(fecha, dia(ymAdd(fechaYm, 1), corte)), diasParaFechar: diasEntre(hoje, fecha), diasParaVencer: diasEntre(hoje, vencimento), fechada };
}

/** "Posso gastar R$ X?": compara com o que ainda cabe (limite do mês, orçamento da categoria, contas a vencer, dinheiro em conta).
 *  `list` já vem filtrado para a conta em questão. Devolve { nivel: "sim"|"cuidado"|"nao"|"sem-base", titulo, linhas, folga }. */
export function podeGastar({ valor, cat, hoje, list, limite = 0, orcamentos = {}, saldo = null }) {
  const ym = hoje.slice(0, 7), S = summarize(list, ym), aPagar = soma(aVencer(list, hoje).filter((x) => x.ts <= dia(ym, 31)));
  const linhas = [], folgas = [];
  if (limite > 0) { const livre = r2(limite - S.gastos - aPagar); folgas.push(livre); linhas.push(`Limite do mês ${fBRL(limite)}: já gastou ${fBRL(S.gastos)}${aPagar ? ` e tem ${fBRL(aPagar)} a vencer` : ""}. Ainda cabem ${fBRL(livre)}.`); }
  const o = cat ? +orcamentos[cat] : 0;
  if (o > 0) { const gasto = S.porCat.find((c) => c.k === cat)?.v || 0, resta = r2(o - gasto); folgas.push(resta); linhas.push(`${catOf(cat).n}: orçamento ${fBRL(o)}, já foram ${fBRL(gasto)}. Restam ${fBRL(resta)}.`); }
  if (saldo != null) { const livre = r2(saldo - aPagar); folgas.push(livre); linhas.push(`Dinheiro em conta ${fBRL(saldo)}${aPagar ? `; descontando as contas a vencer sobram ${fBRL(livre)}` : ""}.`); }
  if (!folgas.length) return { nivel: "sem-base", titulo: "Ainda não tenho base para responder.", linhas: ["Defina um limite do mês, um orçamento da categoria ou informe o dinheiro em conta."], folga: null };
  const folga = Math.min(...folgas);
  if (valor > folga) return { nivel: "nao", titulo: `Não recomendo: passa em ${fBRL(valor - Math.max(0, folga))} do que cabe.`, linhas, folga };
  if (valor > folga * 0.5) return { nivel: "cuidado", titulo: `Dá, mas consome ${Math.round((valor / folga) * 100)}% do que ainda cabe.`, linhas, folga };
  return { nivel: "sim", titulo: `Pode. Depois disso ainda sobram ${fBRL(folga - valor)}.`, linhas, folga };
}

/** Balanço do mês: o que melhorou, o que piorou e uma sugestão de teto para o mês seguinte. */
export function fechamento(list, ym) {
  const S = summarize(list, ym), A = summarize(list, ymAdd(ym, -1)), C = comparaCategorias(list, ym);
  const variacao = A.gastos ? (S.gastos - A.gastos) / A.gastos : null;
  const piorou = C.filter((c) => c.delta != null && c.delta > 0.1 && c.v - c.ant >= 30).sort((a, b) => b.v - b.ant - (a.v - a.ant)).slice(0, 3);
  const melhorou = C.filter((c) => c.delta != null && c.delta < -0.1 && c.ant - c.v >= 30).sort((a, b) => a.v - a.ant - (b.v - b.ant)).slice(0, 3);
  const hist = [1, 2, 3].map((i) => summarize(list, ymAdd(ym, -i)).gastos).filter((v) => v > 0), media = hist.length ? r2(hist.reduce((s, v) => s + v, 0) / hist.length) : null;
  const base = media != null ? Math.min(S.gastos || media, media) : S.gastos || null;
  return { ym, n: S.itens.length, gastos: S.gastos, receitas: S.receitas, investido: S.investido, sobra: r2(S.receitas - S.gastos - S.investido), anterior: A.gastos, variacao, top: S.porCat.slice(0, 3), piorou, melhorou, sugestao: base ? r2(base * 0.95) : null };
}
