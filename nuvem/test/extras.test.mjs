// Testes da etapa 1: meio de pagamento, lote, dedutível, parcelas e as consultas sobre eles (lógica pura, sem rede).
import test from "node:test";
import assert from "node:assert/strict";
import { parseExtras, expandir, parseMessage, addMonthsISO, cleanItem, toCsv } from "../../docs/gastos-core.js";
import { porMeio, porLote, dedutiveis, comprometido, buscaTermo } from "../../docs/gastos-plus.js";

const HOJE = "2026-10-28";
test("parseExtras: meio, lote, dedutível e parcelas saem da frase", () => {
  let x = parseExtras("notebook 3000 em 6x no nubank");
  assert.equal(x.parc, 6); assert.equal(x.m, "Nubank"); assert.equal(x.text, "notebook 3000");
  x = parseExtras("ração 3200 lote 3"); assert.equal(x.l, "Lote 3"); assert.equal(x.text, "ração 3200");
  x = parseExtras("diesel 450 #galpao2"); assert.equal(x.l, "Galpao2");
  x = parseExtras("consulta 250 dedutível"); assert.equal(x.dd, 1); assert.equal(x.text, "consulta 250");
  x = parseExtras("geladeira 3x de 500 no cartão"); assert.equal(x.parc, 3); assert.equal(x.porParcela, true); assert.equal(x.m, "Cartão");
  x = parseExtras("uber 23,50"); assert.equal(x.parc, undefined); assert.equal(x.m, undefined);
  x = parseExtras("2x pastel 15"); assert.equal(x.parc, undefined);   // "2x" sozinho não é parcela
});
test("expandir: parcela total vs por parcela, centavos e fim de mês", () => {
  const p = parseMessage("notebook 1000", HOJE), its = expandir(p, { parc: 3 }, { src: "app" });
  assert.equal(its.length, 3); assert.deepEqual(its.map((i) => i.v), [333.33, 333.33, 333.34]);
  assert.deepEqual(its.map((i) => i.ts), ["2026-10-28", "2026-11-28", "2026-12-28"]); assert.equal(its[2].pg.n, 3); assert.match(its[1].d, /\(2\/3\)/);
  const q = expandir(parseMessage("geladeira 500", HOJE), { parc: 4, porParcela: true }); assert.equal(q.reduce((s, i) => s + i.v, 0), 2000);
  assert.equal(addMonthsISO("2026-01-31", 1), "2026-02-28"); assert.equal(addMonthsISO("2026-11-15", 3), "2027-02-15");
  assert.equal(expandir({ ...parseMessage("+500 venda", HOJE) }, { parc: 3 }).length, 1);   // receita não parcela
});
test("cleanItem mantém extras válidos e descarta lixo", () => {
  const it = cleanItem({ id: "a1", ts: HOJE, v: 10, c: "outros", m: "Nubank", l: "Lote 3", dd: 1, pg: { g: "ab12", i: 2, n: 6 } });
  assert.equal(it.m, "Nubank"); assert.equal(it.l, "Lote 3"); assert.equal(it.dd, 1); assert.deepEqual(it.pg, { g: "ab12", i: 2, n: 6 });
  const ruim = cleanItem({ id: "a2", ts: HOJE, v: 10, pg: { g: "", i: 9, n: 2 }, m: 5 }); assert.equal(ruim.pg, undefined); assert.equal(ruim.m, undefined);
});
test("agrupamentos, dedutíveis, comprometido e busca", () => {
  const L = [
    { id: "1", ts: "2026-10-05", v: 100, c: "mercado", d: "ração", tp: "gasto", m: "Nubank", l: "Lote 3", dd: 1 },
    { id: "2", ts: "2026-10-06", v: 50, c: "mercado", d: "milho", tp: "gasto", m: "Pix", l: "Lote 3" },
    { id: "3", ts: "2026-11-05", v: 200, c: "outros", d: "nb (2/3)", tp: "gasto", pg: { g: "x", i: 2, n: 3 } },
    { id: "4", ts: "2026-12-05", v: 200, c: "outros", d: "nb (3/3)", tp: "gasto", pg: { g: "x", i: 3, n: 3 } },
  ];
  assert.deepEqual(porMeio(L, "2026-10"), [{ k: "Nubank", v: 100 }, { k: "Pix", v: 50 }]); assert.deepEqual(porLote(L, "2026-10"), [{ k: "Lote 3", v: 150 }]);
  assert.equal(dedutiveis(L, "2026").total, 100); assert.deepEqual(comprometido(L, HOJE), [{ ym: "2026-11", v: 200 }, { ym: "2026-12", v: 200 }]);
  assert.equal(buscaTermo(L, "2026-10", "ração").length, 1); assert.equal(buscaTermo(L, "2026-10", "lote 3").length, 2); assert.equal(buscaTermo(L, "2026-10", "nubank").length, 1);
});
test("CSV leva meio, lote, dedutível e parcela", () => {
  const csv = toCsv([{ id: "1", ts: "2026-10-05", v: 100, c: "mercado", d: "ração", tp: "gasto", m: "Nubank", l: "Lote 3", dd: 1, pg: { g: "x", i: 1, n: 3 } }]);
  assert.match(csv, /"Meio";"Lote";"Dedutível";"Parcela"/); assert.match(csv, /"Nubank";"Lote 3";"Sim";"1\/3"/);
});
