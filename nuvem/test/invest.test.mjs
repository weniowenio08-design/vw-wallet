// Testes dos cálculos de investimentos (lógica pura, números conferíveis à mão).
import test from "node:test";
import assert from "node:assert/strict";
import { precoMedio, aportesPorMes, acumulado, retornoSerie, rentabilidade, proventos, vencimentos, rebalancear, estresse, CENARIOS, independencia, metaComPrazo, exposicaoDolar, revisoesDevidas, resultadoDecisao, registraSnapshot, evolucaoMensal, patrimonioTotal } from "../../docs/invest.js";

const HOJE = "2026-10-28";
test("preço médio por ativo e aportes por mês", () => {
  const pos = [
    { id: 1, cls: "acao", sym: "ITUB4", inv: 400, q: 10, bp: 40, value: 450, dt: "2026-08-10" },
    { id: 2, cls: "acao", sym: "ITUB4", inv: 600, q: 10, bp: 60, value: 450, dt: "2026-09-05" },
    { id: 3, cls: "selic", sym: "", inv: 1000, value: 1000, dt: "2026-09-20" },
  ];
  const pm = precoMedio(pos, () => 45); assert.equal(pm.length, 1); assert.equal(pm[0].q, 20); assert.equal(pm[0].inv, 1000); assert.equal(pm[0].pm, 50); assert.equal(pm[0].valor, 900); assert.equal(pm[0].lucro, -100); assert.equal(pm[0].desde, "2026-08-10"); assert.equal(pm[0].lotes, 2);
  const ap = aportesPorMes([...pos, { id: 4, cls: "fii", inv: 50, value: 50 }]); assert.deepEqual(ap.meses, [{ ym: "2026-08", v: 400 }, { ym: "2026-09", v: 1600 }]); assert.equal(ap.semData, 50);
});
test("rentabilidade: preço, taxa estimada e comparação com CDI, IPCA e Ibovespa", () => {
  assert.ok(Math.abs(acumulado(10, 365) - 0.1) < 1e-9);
  const ibov = { t: ["2026-01-02", "2026-06-30", "2026-10-28"], c: [100, 110, 121] };
  assert.equal(retornoSerie(ibov, "2026-06-30", HOJE).toFixed(4), "0.1000"); assert.equal(retornoSerie(ibov, "2025-01-01", HOJE), null);
  const pos = [
    { id: 1, cls: "acao", sym: "ITUB4", inv: 1000, q: 25, bp: 40, value: 1100, dt: "2026-06-30" },
    { id: 2, cls: "cdb", sym: "", inv: 1000, value: 1000, dt: "2026-04-28", taxa: 110 },
    { id: 3, cls: "fii", sym: "KNCR11", inv: 500, value: 500 },   // sem data
  ];
  const r = rentabilidade(pos, { hoje: HOJE, cdi: 13.65, ipca12: 4.58, ibov });
  assert.equal(r.lotes.length, 2); assert.equal(r.semBase, 1);
  assert.equal(r.lotes[0].ret.toFixed(3), "0.100"); assert.equal(r.lotes[0].estimado, false); assert.equal(r.lotes[1].estimado, true);
  assert.ok(r.lotes[1].ret > r.lotes[1].cdi);   // 110% do CDI rende mais que o CDI
  assert.ok(r.geral.ret > 0 && r.geral.cdi > 0 && r.geral.ibov != null);
});
test("proventos: só depois da compra, últimos 12 meses e próximos pela data do ano passado", () => {
  const assets = [{ sym: "KNCR11", divs: [{ d: "2025-11-14", a: 1 }, { d: "2026-01-14", a: 1 }, { d: "2026-09-14", a: 1.2 }, { d: "2026-10-14", a: 1.3 }] }];
  const pos = [{ id: 1, cls: "fii", sym: "KNCR11", inv: 1000, q: 100, value: 1000, dt: "2026-01-01" }];
  const r = proventos(pos, assets, HOJE); assert.equal(r.recebidos, 100 + 120 + 130); assert.equal(r.meses.length, 3); assert.equal(r.ultimos12, 350);
  assert.deepEqual(r.proximos.map((p) => [p.d, p.v]), [["2026-11-14", 100], ["2027-01-14", 100]]);   // nov/2025 e jan/2026 se repetem nos próximos 3 meses
  assert.equal(proventos([{ id: 2, cls: "fii", sym: "KNCR11", inv: 1, q: 100, value: 1 }], assets, HOJE).semData, 100 + 100 + 120 + 130);   // sem data de compra: soma o último ano, sem afirmar que já tinha
});
test("vencimentos com nível de urgência", () => {
  const v = vencimentos([{ id: 1, cls: "cdb", value: 100, venc: "2026-10-25" }, { id: 2, cls: "selic", value: 200, venc: "2026-11-02" }, { id: 3, cls: "ipca", value: 300, venc: "2026-12-30" }, { id: 4, cls: "acao", value: 5 }], HOJE);
  assert.deepEqual(v.map((x) => x.nivel), ["vencido", "urgente", "ok"]); assert.equal(v[1].dias, 5);
  assert.equal(vencimentos([{ id: 9, cls: "cdb", value: 1, venc: "2026-11-20" }], HOJE)[0].nivel, "proximo");
});
test("rebalanceamento: aporte primeiro, vender só se passar da tolerância", () => {
  const T = { selic: 50, acao: 50 };
  let r = rebalancear({ by: { selic: 500, acao: 1500 }, total: 2000, T, aporte: 1000 });   // novo total 3000: ideal 1500 cada
  assert.deepEqual(r.passos.map((p) => [p.tipo, p.cls, p.valor]), [["aportar", "selic", 1000]]); assert.equal(r.ok, true);
  r = rebalancear({ by: { selic: 500, acao: 1500 }, total: 2000, T, aporte: 100 });
  assert.equal(r.passos.find((p) => p.tipo === "aportar").cls, "selic"); assert.ok(r.passos.some((p) => p.tipo === "reduzir" && p.cls === "acao")); assert.equal(r.ok, false);
  assert.equal(rebalancear({ by: { selic: 1000, acao: 1000 }, total: 2000, T, aporte: 0 }).passos.length, 0); assert.equal(rebalancear({ by: {}, total: 0, T, aporte: 0 }).semDados, true);
});
test("estresse: perda por classe e total", () => {
  const e = estresse({ acao: 1000, fii: 1000, selic: 2000, ext: 0 }, CENARIOS.find((c) => c.k === "bolsa").choques);
  assert.equal(e.total, 4000); assert.equal(e.delta, -300 - 150); assert.equal(e.cls[0].cls, "acao"); assert.equal(e.pct.toFixed(4), "-0.1125"); assert.equal(e.depois, 3550);
});
test("independência financeira e meta com prazo", () => {
  const f = independencia({ gastoMensal: 5000, patrimonio: 0, aporte: 3000, taxaReal: 5, retiradaPct: 4 });
  assert.equal(f.alvo, 1500000); assert.equal(f.atingiu, true); assert.ok(f.anos > 20 && f.anos < 30);
  const ja = independencia({ gastoMensal: 1000, patrimonio: 400000, aporte: 0 }); assert.equal(ja.atingiu, true); assert.equal(ja.meses, 0); assert.equal(ja.rendaAtual, 1333.33);
  assert.equal(independencia({ gastoMensal: 5000, patrimonio: 0, aporte: 0 }).atingiu, false);
  const m = metaComPrazo({ alvo: 50000, prazoYm: "2029-10", hoje: HOJE, patrimonio: 10000, aporteAtual: 500, taxaAnual: 10 });
  assert.equal(m.meses, 36); assert.ok(m.precisa > 700 && m.precisa < 900); assert.equal(m.noRitmo, false);
  assert.equal(metaComPrazo({ alvo: 1000, prazoYm: "2027-10", hoje: HOJE, patrimonio: 5000 }).precisa, 0);
  assert.ok(Math.abs(metaComPrazo({ alvo: 12000, prazoYm: "2027-10", hoje: HOJE, patrimonio: 0, taxaAnual: 0 }).precisa - 1000) < 0.01);
});
test("exposição ao dólar", () => {
  const e = exposicaoDolar([{ cls: "ext", sym: "USD", value: 1000 }, { cls: "ext", sym: "IVVB11", value: 500 }, { cls: "acao", sym: "VALE3", value: 8500 }]);
  assert.equal(e.direto, 1500); assert.equal(e.pct, 0.15); assert.equal(e.efeito10, 150); assert.equal(e.dolar, 1000);
});
test("diário: revisões em 6 e 12 meses e resultado", () => {
  const d = [{ id: 1, dt: "2026-04-20", sym: "ITUB4", tipo: "compra", preco: 40, motivo: "dividendos" }, { id: 2, dt: "2025-10-01", sym: "X", tipo: "venda", preco: 10, rev6: true }, { id: 3, dt: "2026-09-01", sym: "Y", tipo: "compra", preco: 5 }];
  const dev = revisoesDevidas(d, HOJE); assert.deepEqual(dev.map((x) => [x.id, x.marco]), [[2, 12], [1, 6]]);
  assert.equal(resultadoDecisao(d[0], 46).leitura, "valorizou desde então"); assert.equal(resultadoDecisao(d[1], 8).leitura, "a venda evitou uma queda"); assert.equal(resultadoDecisao({ tipo: "compra" }, 5), null);
});
test("patrimônio: foto diária e evolução mensal", () => {
  assert.equal(patrimonioTotal({ invest: 1000, caixa: 500, bens: 200000, dividas: 50000 }), 151500);
  let s = registraSnapshot([], "2026-09-15", { invest: 1000, caixa: 0, bens: 0, dividas: 0 });
  s = registraSnapshot(s, "2026-09-30", { invest: 1100, caixa: 0, bens: 0, dividas: 0 }); s = registraSnapshot(s, "2026-10-28", { invest: 1210, caixa: 0, bens: 0, dividas: 0 }); s = registraSnapshot(s, "2026-10-28", { invest: 1300, caixa: 0, bens: 0, dividas: 0 });
  assert.equal(s.length, 3); const ev = evolucaoMensal(s); assert.deepEqual(ev.map((m) => [m.ym, m.total]), [["2026-09", 1100], ["2026-10", 1300]]); assert.equal(ev[1].delta, 200); assert.equal(ev[0].delta, null);
});

test("relatório anual da carteira gera um PDF válido, mesmo com muitas posições", async () => {
  const { relatorioCarteiraPdf } = await import("../../docs/relatorio-carteira.js");
  const posicoes = Array.from({ length: 70 }, (_, i) => ({ cls: i % 2 ? "fii" : "acao", sym: i % 2 ? "KNCR11" : "ITUB4", plat: "XP", dt: "2026-03-10", inv: 100 + i, value: 110 + i }));
  const bytes = relatorioCarteiraPdf({ ano: "2026", posicoes, total: 9000, caixa: 500, bens: [{ nome: "Galpão 2", valor: 250000, tp: "bem" }, { nome: "Financiamento", valor: 80000, tp: "divida" }], proventos: { recebidos: 350, meses: [{ ym: "2026-09", v: 120 }, { ym: "2026-10", v: 230 }] }, geradoEm: new Date("2026-10-28T12:00:00Z") });
  const txt = new TextDecoder("latin1").decode(bytes);
  assert.equal(txt.slice(0, 5), "%PDF-"); assert.ok(txt.trimEnd().endsWith("%%EOF")); assert.ok((txt.match(/\/Type \/Page /g) || []).length >= 2, "paginou"); assert.ok(txt.includes("Relat")); assert.ok(txt.includes("Galp"));
});

test("plano de entrada em parcelas: fecha no centavo, datas de 14 em 14 dias, limites", async () => {
  const { planoEntrada } = await import("../../docs/invest.js");
  const p = planoEntrada({ valor: 1500, n: 4, hoje: "2026-10-29", passoDias: 14 });
  assert.deepEqual(p.parcelas.map((x) => x.dt), ["2026-10-29", "2026-11-12", "2026-11-26", "2026-12-10"]);
  assert.deepEqual(p.parcelas.map((x) => x.v), [375, 375, 375, 375]);
  const q = planoEntrada({ valor: 100, n: 3, hoje: "2026-10-29" });
  assert.equal(q.parcelas.reduce((s, x) => Math.round((s + x.v) * 100) / 100, 0), 100); assert.equal(q.parcelas[2].v, 33.34);
  assert.equal(planoEntrada({ valor: 50, n: 99, hoje: "2026-10-29" }).parcelas.length, 12);
  assert.equal(planoEntrada({ valor: -5, n: 0, hoje: "2026-10-29" }).total, 0);
});
