// Testes da agenda dos gastos: contas a vencer, fatura do cartão, "posso gastar?" e fechamento do mês (lógica pura).
import test from "node:test";
import assert from "node:assert/strict";
import { aVencer, calendarioMes, faturaCartao, podeGastar, fechamento, prazo } from "../../docs/gastos-agenda.js";
import { parseExtras, parseMessage, expandir, ajustaVencimento, summarize } from "../../docs/gastos-core.js";

const HOJE = "2026-10-28";
test("conta a vencer: não entra nos totais, aparece na agenda e o dia passado vai para o mês seguinte", () => {
  const ex = parseExtras("boleto luz 180 dia 5"); assert.equal(ex.pd, 1); assert.equal(ex.text, "luz 180 dia 5");
  const p = ajustaVencimento(parseMessage(ex.text, HOJE), ex, HOJE); assert.equal(p.date, "2026-11-05");
  const its = expandir(p, ex, { src: "app" }); assert.equal(its[0].pd, 1);
  assert.equal(summarize(its, "2026-11").gastos, 0);
  const hoje2 = ajustaVencimento(parseMessage("luz 180 dia 30", HOJE), { pd: 1 }, HOJE); assert.equal(hoje2.date, "2026-10-30");
  assert.equal(parseExtras("paguei a fatura 500").pd, undefined);   // pagar não é "a vencer"
  const ag = aVencer([...its, { id: "z", ts: "2026-10-27", v: 50, c: "outros", d: "água", tp: "gasto", pd: 1 }], HOJE);
  assert.deepEqual(ag.map((x) => x.dias), [-1, 8]); assert.equal(prazo(-1), "atrasada 1 dia"); assert.equal(prazo(0), "hoje"); assert.equal(prazo(1), "amanhã"); assert.equal(prazo(5), "em 5 dias");
  assert.deepEqual(Object.keys(calendarioMes(ag, "2026-10")), ["2026-10-27"]);
});
test("fatura do cartão: ciclo aberto, próxima e vencimento", () => {
  const L = [
    { id: "1", ts: "2026-10-05", v: 100, c: "outros", d: "a", tp: "gasto", m: "Nubank" },   // dentro (12/10 < ... fecha 12? veja corte)
    { id: "2", ts: "2026-10-20", v: 300, c: "outros", d: "b", tp: "gasto", m: "Nubank" },
    { id: "3", ts: "2026-11-20", v: 50, c: "outros", d: "c", tp: "gasto", m: "nubank" },
    { id: "4", ts: "2026-10-21", v: 70, c: "outros", d: "d", tp: "gasto", m: "Inter" },
  ];
  const f = faturaCartao(L, { nome: "Nubank", corte: 12, venc: 20 }, HOJE);   // hoje 28/10 > corte 12: ciclo de 13/10 a 12/11
  assert.equal(f.fecha, "2026-11-12"); assert.equal(f.vencimento, "2026-11-20"); assert.equal(f.total, 300); assert.equal(f.proxima, 50);
  assert.equal(f.fechada, null);   // a fatura que fechou em 12/10 já venceu em 20/10
  const f2 = faturaCartao(L, { nome: "Nubank", corte: 12, venc: 20 }, "2026-10-15");   // fechou há 3 dias, vence em 5
  assert.equal(f2.fechada.total, 100); assert.equal(f2.fechada.vencimento, "2026-10-20"); assert.equal(f2.fechada.dias, 5);
});
test("posso gastar: sim, cuidado, não e sem base", () => {
  const L = [{ id: "1", ts: "2026-10-03", v: 600, c: "mercado", d: "m", tp: "gasto" }, { id: "2", ts: "2026-10-30", v: 100, c: "moradia", d: "luz", tp: "gasto", pd: 1 }];
  const base = { hoje: HOJE, list: L, limite: 1000 };   // cabem 1000 - 600 - 100 = 300
  assert.equal(podeGastar({ ...base, valor: 100 }).nivel, "sim");
  assert.equal(podeGastar({ ...base, valor: 200 }).nivel, "cuidado");
  const nao = podeGastar({ ...base, valor: 400 }); assert.equal(nao.nivel, "nao"); assert.match(nao.titulo, /passa em/);
  assert.equal(podeGastar({ hoje: HOJE, list: L, valor: 10 }).nivel, "sem-base");
  assert.equal(podeGastar({ ...base, valor: 100, cat: "mercado", orcamentos: { mercado: 650 } }).nivel, "nao");   // orçamento da categoria só tem 50
  assert.equal(podeGastar({ hoje: HOJE, list: L, valor: 50, saldo: 120 }).nivel, "nao");   // 120 em conta - 100 a vencer = 20
});
test("fechamento do mês: melhorou, piorou e sugestão", () => {
  const L = [
    { id: "a", ts: "2026-09-10", v: 500, c: "mercado", d: "x", tp: "gasto" }, { id: "b", ts: "2026-09-12", v: 300, c: "lazer", d: "y", tp: "gasto" },
    { id: "c", ts: "2026-10-10", v: 800, c: "mercado", d: "x", tp: "gasto" }, { id: "d", ts: "2026-10-12", v: 100, c: "lazer", d: "y", tp: "gasto" }, { id: "e", ts: "2026-10-01", v: 3000, c: "salario", d: "s", tp: "receita" },
  ];
  const f = fechamento(L, "2026-10"); assert.equal(f.gastos, 900); assert.equal(f.anterior, 800); assert.equal(f.sobra, 2100);
  assert.equal(f.piorou[0].k, "mercado"); assert.equal(f.melhorou[0].k, "lazer"); assert.equal(f.sugestao, 760);   // média dos meses anteriores (800) * 0,95
});
