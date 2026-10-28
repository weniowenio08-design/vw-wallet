// Testes da lógica dos recursos extras da aba Gastos.
import test from "node:test";
import assert from "node:assert/strict";
import { serie, comparaCategorias, statusLimite, alertasNovos, fixosPendentes, progressoMeta, sobraDoMes, filtrar } from "../../docs/gastos-plus.js";
import { summarize, fBRL } from "../../docs/gastos-core.js";

const it = (id, ts, v, c, tp = "gasto", d = "") => ({ id, ts, v, c, d, tp, src: "app", deleted: 0 });
const L = [
  it("1", "2026-09-05", 400, "mercado"), it("2", "2026-09-10", 100, "transporte"), it("3", "2026-09-01", 3000, "salario", "receita"),
  it("4", "2026-10-03", 600, "mercado", "gasto", "Feira do bairro"), it("5", "2026-10-09", 50, "transporte"), it("6", "2026-10-01", 3000, "salario", "receita"), it("7", "2026-10-20", 500, "investimento"),
];

test("série dos últimos 6 meses", () => {
  const s = serie(L, "2026-10"); assert.equal(s.length, 6); assert.equal(s[5].ym, "2026-10"); assert.equal(s[0].ym, "2026-05");
  assert.equal(s[5].gastos, 650); assert.equal(s[4].gastos, 500); assert.equal(s[5].investido, 500); assert.equal(s[0].gastos, 0);
});

test("comparativo por categoria com o mês anterior", () => {
  const c = comparaCategorias(L, "2026-10"), m = c.find((x) => x.k === "mercado"), t = c.find((x) => x.k === "transporte");
  assert.equal(m.ant, 400); assert.equal(Math.round(m.delta * 100), 50); assert.equal(t.delta, -0.5);
  assert.equal(comparaCategorias(L, "2026-09").find((x) => x.k === "mercado").delta, null, "sem gasto no mês anterior não há variação");
});

test("situação contra o limite", () => {
  assert.equal(statusLimite(50, 0), null); assert.equal(statusLimite(50, 100).nivel, "ok"); assert.equal(statusLimite(80, 100).nivel, "alerta"); assert.equal(statusLimite(100, 100).nivel, "estourou");
});

test("alertas aparecem uma vez só por mês", () => {
  const S = summarize(L, "2026-10"), feitos = {};
  let a = alertasNovos({ S, limite: 700, orcamentos: { mercado: 500 }, feitos, fBRL });
  assert.deepEqual(a.map((x) => x.chave).sort(), ["cmercado", "l80"]); // 650 de 700 = 92%; mercado 600 > 500
  a = alertasNovos({ S, limite: 700, orcamentos: { mercado: 500 }, feitos, fBRL }); assert.equal(a.length, 0, "não repete");
  a = alertasNovos({ S: summarize([...L, it("8", "2026-10-25", 100, "lazer")], "2026-10"), limite: 700, orcamentos: {}, feitos, fBRL }); assert.deepEqual(a.map((x) => x.chave), ["l100"]);
});

test("gastos fixos: lançam no dia, não duplicam e respeitam meses curtos", () => {
  const f = [{ id: "a1", d: "Internet", v: 99.9, c: "moradia", dia: 31, ativo: true, desde: "2026-09" }];
  const p = fixosPendentes(f, L, "2026-10-28"); // setembro (dia 30) já venceu; outubro dia 31 ainda não
  assert.deepEqual(p.map((x) => x.ts), ["2026-09-30"]); assert.equal(p[0].id, "fxa1202609");
  assert.equal(fixosPendentes(f, [...L, ...p], "2026-10-28").length, 0, "já lançado não repete");
  assert.deepEqual(fixosPendentes(f, [...L, ...p], "2026-10-31").map((x) => x.ts), ["2026-10-31"]);
  assert.equal(fixosPendentes([{ ...f[0], ativo: false }], L, "2026-10-31").length, 0);
});

test("meta de economia e sobra do mês", () => {
  const m = progressoMeta(L, { nome: "Reserva", alvo: 10000, ini: "2026-09" }, "2026-10");
  assert.equal(m.guardado, 2500 + 2350); // setembro 3000-500 ; outubro 3000-650
  assert.equal(Math.round(m.pct * 100), 49); assert.equal(m.mesesParaFechar, 3);
  assert.equal(progressoMeta(L, null, "2026-10"), null);
  assert.equal(sobraDoMes(summarize(L, "2026-10")), 3000 - 650 - 500);
});

test("busca e filtros ignoram acento e maiúsculas", () => {
  const s = summarize(L, "2026-10").itens;
  assert.equal(filtrar(s, { q: "FEIRA" }).length, 1); assert.equal(filtrar(s, { cat: "transporte" }).length, 1); assert.equal(filtrar(s, { q: "transporte" }).length, 1); assert.equal(filtrar(s, { q: "zzz" }).length, 0);
});
