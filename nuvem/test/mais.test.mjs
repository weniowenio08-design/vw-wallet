// Testes de envelopes, preços, desafios e leitura de extrato CSV (lógica pura).
import test from "node:test";
import assert from "node:assert/strict";
import { envelopes, ultimoPreco, precosQueMudaram, statusDesafio, DESAFIOS, lerExtrato, marcaDuplicados } from "../../docs/gastos-mais.js";

const HOJE = "2026-10-28";
test("envelopes 50/30/20 a partir da renda informada", () => {
  const L = [{ id: "1", ts: "2026-10-03", v: 1200, c: "mercado", d: "m", tp: "gasto" }, { id: "2", ts: "2026-10-04", v: 700, c: "lazer", d: "l", tp: "gasto" }, { id: "3", ts: "2026-10-05", v: 300, c: "investimento", d: "i", tp: "gasto" }];
  const e = envelopes(L, "2026-10", { renda: 4000 }); assert.equal(e.base, 4000);
  const [nec, des, fut] = e.potes; assert.equal(nec.teto, 2000); assert.equal(nec.gasto, 1200); assert.equal(nec.resta, 800); assert.equal(nec.nivel, "ok");
  assert.equal(des.teto, 1200); assert.equal(des.gasto, 700); assert.equal(fut.teto, 800); assert.equal(fut.gasto, 300); assert.equal(fut.nivel, "alerta");   // guardou menos que o previsto
  const sem = envelopes([...L, { id: "4", ts: "2026-10-01", v: 5000, c: "salario", d: "s", tp: "receita" }], "2026-10"); assert.equal(sem.base, 5000); assert.equal(sem.fonte, "receitas do mês");
});
test("preço do mesmo item: última vez e variação", () => {
  const L = [{ id: "1", ts: "2026-09-10", v: 100, c: "mercado", d: "Ração", tp: "gasto" }, { id: "2", ts: "2026-10-10", v: 118, c: "mercado", d: "racao ", tp: "gasto" }, { id: "3", ts: "2026-10-11", v: 20, c: "mercado", d: "Pão", tp: "gasto" }, { id: "4", ts: "2026-10-12", v: 3000, c: "outros", d: "Notebook (1/6)", tp: "gasto", pg: { g: "a", i: 1, n: 6 } }];
  assert.deepEqual(ultimoPreco(L, "ração", "2026-10-20"), { v: 118, ts: "2026-10-10" }); assert.equal(ultimoPreco(L, "nada", HOJE), null);
  const m = precosQueMudaram(L); assert.equal(m.length, 1); assert.equal(m[0].antes, 100); assert.equal(m[0].agora, 118); assert.equal(Math.round(m[0].delta * 100), 18);
});
test("desafios: andamento, falhou e concluído", () => {
  const d = { ...DESAFIOS[0], ini: "2026-10-25" };   // 7 dias sem alimentação
  assert.deepEqual([statusDesafio([], d, "2026-10-28").estado, statusDesafio([], d, "2026-10-28").dia, statusDesafio([], d, "2026-10-28").restam], ["andamento", 4, 3]);
  const f = statusDesafio([{ id: "x", ts: "2026-10-27", v: 40, c: "alimentacao", d: "pizza", tp: "gasto" }], d, "2026-10-28"); assert.equal(f.estado, "falhou"); assert.equal(f.dia, 2);
  assert.equal(statusDesafio([], d, "2026-11-05").estado, "concluido");
  assert.equal(statusDesafio([{ id: "y", ts: "2026-11-20", v: 40, c: "alimentacao", d: "p", tp: "gasto" }], d, "2026-11-25").estado, "concluido");   // gasto depois do fim não quebra
});
test("extrato: Nubank conta (negativos), Nubank cartão (positivos) e Inter (;)", () => {
  const conta = 'Data,Valor,Identificador,Descrição\n27/10/2026,-45.90,abc,Compra no débito - Mercado Bom\n26/10/2026,1500.00,def,Transferência recebida - Cliente\n';
  let r = lerExtrato(conta, HOJE); assert.equal(r.itens.length, 2); assert.equal(r.sinais, "negativos-sao-gastos");
  assert.deepEqual(r.itens.map((i) => [i.ts, i.v, i.tp, i.c]), [["2026-10-27", 45.9, "gasto", "mercado"], ["2026-10-26", 1500, "receita", "renda_extra"]]);
  const cartao = "date,category,title,amount\n2026-10-20,restaurante,Ifood *Pedido,52.30\n2026-10-21,transporte,Uber *Trip,23.50\n";
  r = lerExtrato(cartao, HOJE); assert.equal(r.sinais, "tudo-e-gasto"); assert.deepEqual(r.itens.map((i) => [i.v, i.c]), [[52.3, "alimentacao"], [23.5, "transporte"]]);
  const inter = '"Saldo do dia: 100,00"\n"Data Lançamento";"Histórico";"Descrição";"Valor";"Saldo"\n"25/10/2026";"Pix enviado";"Farmácia Popular";"-37,80";"900,00"\n';
  r = lerExtrato(inter, HOJE); assert.equal(r.itens.length, 1); assert.equal(r.itens[0].v, 37.8); assert.equal(r.itens[0].c, "saude");
  assert.equal(lerExtrato("nada aqui", HOJE).itens.length, 0);
  const sem = lerExtrato("27/10/2026;Padaria do Zé;-12,50\n28/10/2026;Uber;-20,00\n", HOJE); assert.equal(sem.itens.length, 2); assert.equal(sem.itens[0].v, 12.5);   // sem cabeçalho
});
test("duplicados são marcados", () => {
  const cand = [{ ts: "2026-10-27", v: 45.9, d: "Mercado Bom", tp: "gasto", c: "mercado" }, { ts: "2026-10-28", v: 10, d: "Novo", tp: "gasto", c: "outros" }];
  const r = marcaDuplicados(cand, [{ id: "1", ts: "2026-10-27", v: 45.9, d: "mercado bom", c: "mercado", tp: "gasto" }]); assert.deepEqual(r.map((x) => x.dup), [true, false]);
});
