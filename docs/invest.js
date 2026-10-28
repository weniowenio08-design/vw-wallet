// Investimentos (lógica pura, sem DOM): preço médio, rentabilidade contra CDI/IPCA/Ibovespa, proventos, vencimentos, rebalanceamento,
// cenários de estresse, independência financeira, meta com prazo, exposição ao dólar, diário de decisões e evolução do patrimônio.
// Usada pela tela (patrimonio.js); testada em nuvem/test/invest.test.mjs.
// Posição ("lote"): { id, cls: selic|ipca|cdb|fii|acao|ext, sym, plat, value (valor atual), inv (investido), q?, bp?, dt? (AAAA-MM-DD), venc?, taxa? }
// Tudo o que vem de taxa de hoje (CDI, IPCA) é ESTIMATIVA: o app não tem o histórico dessas taxas.
import { addMonthsISO, ymAdd } from "./gastos-core.js";

const r2 = (v) => Math.round(v * 100) / 100;
export const diasEntre = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const mesesEntre = (ymA, ymB) => (+ymB.slice(0, 4) - +ymA.slice(0, 4)) * 12 + (+ymB.slice(5, 7) - +ymA.slice(5, 7));

// ------------------------------------------------------------ preço médio e aportes (histórico de compras)
/** Agrupa os lotes de cada ativo: quantidade, quanto investiu, preço médio, valor e lucro de hoje. */
export function precoMedio(pos, priceOf) {
  const por = new Map();
  for (const p of pos) {
    if (!p.sym || !(p.q > 0)) continue;
    const g = por.get(p.sym) || { sym: p.sym, q: 0, inv: 0, lotes: 0, desde: null }; g.q += p.q; g.inv += p.inv ?? 0; g.lotes++;
    if (p.dt && (!g.desde || p.dt < g.desde)) g.desde = p.dt; por.set(p.sym, g);
  }
  return [...por.values()].map((g) => {
    const px = priceOf(g.sym), valor = px ? g.q * px : null, lucro = valor != null ? valor - g.inv : null;
    return { ...g, inv: r2(g.inv), pm: g.q ? r2(g.inv / g.q) : null, px: px ?? null, valor: valor != null ? r2(valor) : null, lucro: lucro != null ? r2(lucro) : null, pct: lucro != null && g.inv > 0 ? lucro / g.inv : null };
  }).sort((a, b) => (b.valor ?? b.inv) - (a.valor ?? a.inv));
}
/** Quanto foi aportado em cada mês (só os lotes com data de compra). */
export function aportesPorMes(pos) {
  const m = new Map(); let semData = 0;
  for (const p of pos) { const v = p.inv ?? 0; if (!p.dt) { semData += v; continue; } const k = p.dt.slice(0, 7); m.set(k, (m.get(k) || 0) + v); }
  return { meses: [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([ym, v]) => ({ ym, v: r2(v) })), semData: r2(semData) };
}

// ------------------------------------------------------------ rentabilidade contra CDI, IPCA e Ibovespa
export const acumulado = (taxaAnualPct, dias) => Math.pow(1 + taxaAnualPct / 100, Math.max(0, dias) / 365) - 1;
/** Variação de uma série { t: [datas], c: [fechamentos] } entre duas datas (usa o último fechamento até cada data). Nulo se a série não cobre. */
export function retornoSerie(serie, de, ate) {
  if (!serie?.t?.length || de < serie.t[0]) return null;
  const px = (d) => { let lo = 0, hi = serie.t.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (serie.t[mid] <= d) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r >= 0 ? serie.c[r] : null; };
  const a = px(de), b = px(ate); return a && b ? b / a - 1 : null;
}
/** Retorno de cada lote com data de compra e comparação com os índices. ctx = { hoje, cdi, ipca12, ibov }. */
export function rentabilidade(pos, ctx) {
  const lotes = [], sem = [];
  for (const p of pos) {
    const inv = p.inv ?? 0; if (!p.dt || !(inv > 0)) { sem.push(p); continue; }
    const dias = diasEntre(p.dt, ctx.hoje); if (dias < 1) { sem.push(p); continue; }
    let ret = null, estimado = false;
    if (p.q > 0 && p.bp) ret = p.value / inv - 1;
    else if ((p.cls === "selic" || p.cls === "cdb") && p.taxa > 0 && ctx.cdi != null) { ret = acumulado((ctx.cdi * p.taxa) / 100, dias); estimado = true; }
    else if (p.cls === "ipca" && p.taxa != null && ctx.ipca12 != null) { ret = (1 + acumulado(ctx.ipca12, dias)) * (1 + acumulado(p.taxa, dias)) - 1; estimado = true; }
    if (ret == null) { sem.push(p); continue; }
    lotes.push({ id: p.id, sym: p.sym, cls: p.cls, dt: p.dt, dias, inv, ret, estimado, cdi: ctx.cdi != null ? acumulado(ctx.cdi, dias) : null, ipca: ctx.ipca12 != null ? acumulado(ctx.ipca12, dias) : null, ibov: retornoSerie(ctx.ibov, p.dt, ctx.hoje) });
  }
  const pesa = (campo) => { const ok = lotes.filter((l) => l[campo] != null), w = ok.reduce((s, l) => s + l.inv, 0); return w ? ok.reduce((s, l) => s + l.inv * l[campo], 0) / w : null; };
  return { lotes, semBase: sem.length, geral: lotes.length ? { ret: pesa("ret"), cdi: pesa("cdi"), ipca: pesa("ipca"), ibov: pesa("ibov"), inv: r2(lotes.reduce((s, l) => s + l.inv, 0)), n: lotes.length } : null };
}

// ------------------------------------------------------------ proventos: recebidos (estimados) e próximos
/** assets: [{ sym, divs: [{ d, a }] }] (a = valor por cota/ação). Só conta o que foi pago depois da data de compra do lote. */
export function proventos(pos, assets, hoje) {
  const por = {}, ate = (s, n) => s.d >= n.dt, porSym = new Map(assets.map((a) => [a.sym, a.divs || []]));
  let recebidos = 0, ultimos12 = 0, semData = 0; const futuros = [], umAno = addMonthsISO(hoje, -12);
  for (const p of pos) {
    if (!p.sym || !(p.q > 0)) continue; const divs = porSym.get(p.sym) || [];
    for (const s of divs) {
      if (s.d > hoje) continue;
      if (p.dt) { if (s.d < p.dt) continue; recebidos += s.a * p.q; por[s.d.slice(0, 7)] = (por[s.d.slice(0, 7)] || 0) + s.a * p.q; if (s.d > umAno) ultimos12 += s.a * p.q; }
      else if (s.d > umAno) semData += s.a * p.q;
    }
    // próximos: o que pagou há um ano, repetido na mesma data deste ano (estimativa)
    for (const s of divs) { if (s.d <= umAno || s.d > hoje) continue; const prox = addMonthsISO(s.d, 12); if (prox > hoje && prox <= addMonthsISO(hoje, 3)) futuros.push({ sym: p.sym, d: prox, v: r2(s.a * p.q) }); }
  }
  const meses = Object.entries(por).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([ym, v]) => ({ ym, v: r2(v) }));
  return { recebidos: r2(recebidos), ultimos12: r2(ultimos12), semData: r2(semData), meses, proximos: futuros.sort((a, b) => (a.d < b.d ? -1 : 1)), mediaMensal: meses.length ? r2(meses.reduce((s, m) => s + m.v, 0) / meses.length) : 0 };
}

// ------------------------------------------------------------ vencimentos de Tesouro e CDB
export function vencimentos(pos, hoje) {
  return pos.filter((p) => p.venc).map((p) => { const dias = diasEntre(hoje, p.venc); return { id: p.id, cls: p.cls, sym: p.sym, plat: p.plat, venc: p.venc, dias, valor: r2(p.value ?? 0), nivel: dias < 0 ? "vencido" : dias <= 7 ? "urgente" : dias <= 30 ? "proximo" : "ok" }; }).sort((a, b) => (a.venc < b.venc ? -1 : 1));
}

// ------------------------------------------------------------ rebalanceamento guiado
/** by = valor atual por classe, T = metas (pesos), aporte = quanto vai entrar. Primeiro usa o aporte (sem vender nada, sem imposto); só depois sugere reduzir. */
export function rebalancear({ by, total, T, aporte = 0, tolerancia = 5 }) {
  const tsum = Object.values(T).reduce((a, b) => a + b, 0) || 1, novo = total + aporte, ks = Object.keys(T);
  const desejado = Object.fromEntries(ks.map((k) => [k, (novo * T[k]) / tsum])), gap = Object.fromEntries(ks.map((k) => [k, desejado[k] - (by[k] || 0)]));
  const passos = []; let sobra = aporte;
  const faltam = ks.filter((k) => gap[k] > 0).sort((a, b) => gap[b] - gap[a]), totalGap = faltam.reduce((s, k) => s + gap[k], 0);
  for (const k of faltam) { const v = Math.min(gap[k], totalGap > 0 ? (aporte * gap[k]) / totalGap : 0); if (v >= 1) { passos.push({ tipo: "aportar", cls: k, valor: r2(v) }); sobra -= v; gap[k] -= v; } }
  const desvio = (k) => (novo ? Math.abs(((by[k] || 0) + (passos.find((p) => p.cls === k)?.valor || 0) - desejado[k]) / novo) * 100 : 0);
  for (const k of ks) {
    const apos = (by[k] || 0) + (passos.find((p) => p.cls === k)?.valor || 0), pts = novo ? ((apos - desejado[k]) / novo) * 100 : 0;
    if (pts > tolerancia) passos.push({ tipo: "reduzir", cls: k, valor: r2(apos - desejado[k]), pontos: r2(pts) });
    else if (pts < -tolerancia) passos.push({ tipo: "proximos", cls: k, valor: r2(desejado[k] - apos), pontos: r2(-pts) });
  }
  return { passos, desvioMax: r2(Math.max(0, ...ks.map(desvio))), ok: !passos.some((p) => p.tipo !== "aportar"), semDados: total <= 0 };
}

// ------------------------------------------------------------ cenários de estresse (hipóteses, não previsões)
export const CENARIOS = [
  { k: "bolsa", nome: "Bolsa cai forte", desc: "Queda parecida com as grandes crises: ações -30%, FIIs -15%, renda fixa de longo prazo -2%, exterior em reais +5% (dólar sobe).", choques: { acao: -0.3, fii: -0.15, ipca: -0.02, ext: 0.05, selic: 0, cdb: 0 } },
  { k: "dolar", nome: "Dólar dispara (+20%)", desc: "Exterior e dólar +20% em reais; bolsa local -8%, FIIs -5%, Tesouro IPCA+ -3%.", choques: { ext: 0.2, acao: -0.08, fii: -0.05, ipca: -0.03, selic: 0, cdb: 0 } },
  { k: "juros", nome: "Juros sobem forte (Selic +3 p.p.)", desc: "Marcação a mercado: Tesouro IPCA+ -8%, FIIs -12%, ações -10%. Selic e CDB passam a render mais.", choques: { ipca: -0.08, fii: -0.12, acao: -0.1, ext: 0, selic: 0, cdb: 0 } },
  { k: "inflacao", nome: "Inflação alta", desc: "IPCA+ protege (+3%), mas ações -15%, FIIs -10% e renda fixa pré/CDB sem ganho real.", choques: { ipca: 0.03, acao: -0.15, fii: -0.1, ext: 0.05, selic: 0, cdb: 0 } },
];
export function estresse(by, choques) {
  const cls = Object.keys(by).map((k) => { const v = by[k] || 0, ch = choques[k] ?? 0; return { cls: k, valor: r2(v), choque: ch, delta: r2(v * ch) }; }).filter((x) => x.valor > 0);
  const total = cls.reduce((s, x) => s + x.valor, 0), delta = r2(cls.reduce((s, x) => s + x.delta, 0));
  return { cls: cls.sort((a, b) => a.delta - b.delta), total: r2(total), delta, pct: total ? delta / total : 0, depois: r2(total + delta) };
}

// ------------------------------------------------------------ independência financeira e meta com prazo
/** Quanto precisa juntar para viver de renda (regra da retirada, padrão 4% ao ano) e em quanto tempo chega, com retorno REAL (acima da inflação). */
export function independencia({ gastoMensal, patrimonio = 0, aporte = 0, taxaReal = 5, retiradaPct = 4 }) {
  const alvo = retiradaPct > 0 ? (gastoMensal * 12) / (retiradaPct / 100) : 0, i = Math.pow(1 + taxaReal / 100, 1 / 12) - 1;
  let pat = patrimonio, m = 0; const proj = [{ ano: 0, v: r2(pat) }];
  while (pat < alvo && m < 1200 && (aporte > 0 || pat * i > 0)) { pat = pat * (1 + i) + aporte; m++; if (m % 12 === 0) proj.push({ ano: m / 12, v: r2(pat) }); }
  const atingiu = pat >= alvo;
  return { alvo: r2(alvo), meses: atingiu ? m : null, anos: atingiu ? r2(m / 12) : null, atingiu, faltam: r2(Math.max(0, alvo - patrimonio)), pctAlvo: alvo ? Math.min(1, patrimonio / alvo) : 0, rendaAtual: r2((patrimonio * (retiradaPct / 100)) / 12), proj };
}
/** Meta com prazo: quanto aportar por mês para chegar ao alvo e se o ritmo atual basta. prazoYm = "AAAA-MM". */
export function metaComPrazo({ alvo, prazoYm, hoje, patrimonio = 0, aporteAtual = 0, taxaAnual = 10 }) {
  const n = Math.max(1, mesesEntre(hoje.slice(0, 7), prazoYm)), i = Math.pow(1 + taxaAnual / 100, 1 / 12) - 1;
  const fator = Math.pow(1 + i, n), fvAtual = patrimonio * fator, anuid = i === 0 ? n : (fator - 1) / i, falta = alvo - fvAtual;
  const pmt = falta > 0 ? falta / anuid : 0, projetado = fvAtual + aporteAtual * anuid;
  return { meses: n, precisa: r2(pmt), projetado: r2(projetado), noRitmo: projetado >= alvo, folga: r2(projetado - alvo), pct: alvo ? Math.min(1, patrimonio / alvo) : 0 };
}

// ------------------------------------------------------------ exposição ao dólar
export function exposicaoDolar(pos) {
  const total = pos.reduce((s, p) => s + (p.value ?? 0), 0), dolar = pos.filter((p) => p.sym === "USD").reduce((s, p) => s + p.value, 0), ext = pos.filter((p) => p.cls === "ext" && p.sym !== "USD").reduce((s, p) => s + p.value, 0), direto = dolar + ext;
  return { total: r2(total), dolar: r2(dolar), exterior: r2(ext), direto: r2(direto), pct: total ? direto / total : 0, efeito10: r2(direto * 0.1) };
}

// ------------------------------------------------------------ diário de decisões (revisão em 6 e 12 meses)
/** decisoes: [{ id, dt, sym, tipo: compra|venda|manter, motivo, preco, rev6?, rev12? }]. Devolve as que já passaram do marco e ainda não foram revistas. */
export function revisoesDevidas(decisoes, hoje) {
  const out = [];
  for (const d of decisoes) for (const marco of [6, 12]) { const quando = addMonthsISO(d.dt, marco); if (quando <= hoje && !d[`rev${marco}`]) out.push({ ...d, marco, quando }); }
  return out.sort((a, b) => (a.quando < b.quando ? -1 : 1));
}
/** Resultado da decisão até hoje: compra/manter = preço de hoje vs o da época; venda = o que o ativo fez depois (se subiu, vendeu cedo). */
export function resultadoDecisao(d, pxAtual) {
  if (!d.preco || !pxAtual) return null; const pct = pxAtual / d.preco - 1;
  return { pct, leitura: d.tipo === "venda" ? (pct > 0.05 ? "o ativo subiu depois da venda" : pct < -0.05 ? "a venda evitou uma queda" : "ficou parecido") : (pct > 0.05 ? "valorizou desde então" : pct < -0.05 ? "desvalorizou desde então" : "ficou parecido") };
}

// ------------------------------------------------------------ evolução do patrimônio mês a mês
export const patrimonioTotal = ({ invest = 0, caixa = 0, bens = 0, dividas = 0 }) => r2(invest + caixa + bens - dividas);
/** Guarda uma foto por dia (a de hoje substitui a anterior de hoje). snaps: [{ dt, total, invest, caixa, bens, dividas }]. */
export function registraSnapshot(snaps, hoje, partes) {
  const t = { dt: hoje, ...Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, r2(v)])), total: patrimonioTotal(partes) };
  return [...snaps.filter((s) => s.dt !== hoje), t].sort((a, b) => (a.dt < b.dt ? -1 : 1)).slice(-800);
}
/** Última foto de cada mês, com a variação em relação ao mês anterior. */
export function evolucaoMensal(snaps) {
  const por = new Map(); for (const s of snaps) por.set(s.dt.slice(0, 7), s);
  const arr = [...por].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([ym, s]) => ({ ym, total: s.total, invest: s.invest, dt: s.dt }));
  return arr.map((m, i) => ({ ...m, delta: i ? r2(m.total - arr[i - 1].total) : null, pct: i && arr[i - 1].total ? (m.total - arr[i - 1].total) / arr[i - 1].total : null }));
}
export { ymAdd };
