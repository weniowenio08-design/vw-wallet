// Relatório anual da carteira em PDF (puro JavaScript, usa o mesmo gerador do relatório de gastos).
// É um apoio para organizar a declaração: confira sempre os informes oficiais da corretora, do banco e do Tesouro.
import { Pdf, INK, OSSO, OLHO, CINZA, VERDE, VERM } from "./relatorio.js";
import { fBRL, dBR } from "./gastos-core.js";

const CLS_NOME = { selic: "Tesouro Selic", ipca: "Tesouro IPCA+", cdb: "CDB / LCI / LCA", fii: "Fundos imobiliários", acao: "Ações", ext: "Exterior" };
const rotulo = (p) => (p.sym === "USD" ? "Dólar" : p.sym || CLS_NOME[p.cls] || "Posição");

/** d = { ano, posicoes: [{cls, sym, plat, dt, inv, value}], total, proventos: { recebidos, meses: [{ym, v}] }, bens: [{nome, valor, tp}], caixa, geradoEm } */
export function relatorioCarteiraPdf(d) {
  const pdf = new Pdf(), M = 40, W = pdf.W, R = W - M, geradoEm = d.geradoEm || new Date();
  let y = 0, pag = 0;
  const topo = () => {
    pag++; pdf.rect(0, 0, W, 74, INK); pdf.rect(0, 74, W, 3, OLHO);
    pdf.text(M, 46, "uiraçu", { size: 24, font: "F2", color: OSSO }); pdf.text(M + 88, 46, "olho de harpia", { size: 9, font: "F2", color: OLHO });
    pdf.text(R, 38, "Relatório anual da carteira", { size: 11, font: "F2", color: OSSO, align: "right" }); pdf.text(R, 55, String(d.ano), { size: 10, color: "#C9CED4", align: "right" });
    y = 108;
  };
  const nova = (precisa) => { if (y + precisa > 800) { pdf.addPage(); topo(); } };
  const titulo = (t) => { nova(40); pdf.text(M, y, t, { size: 13, font: "F2" }); pdf.line(M, y + 5, R, y + 5, OLHO, 1.2); y += 22; };
  topo();
  // resumo
  const bens = (d.bens || []).filter((b) => b.tp !== "divida"), dividas = (d.bens || []).filter((b) => b.tp === "divida");
  const somaB = bens.reduce((s, b) => s + b.valor, 0), somaD = dividas.reduce((s, b) => s + b.valor, 0), caixa = d.caixa || 0;
  const caixas = [["Investimentos", d.total, INK], ["Dinheiro em conta", caixa, INK], ["Bens", somaB, INK], ["Patrimônio líquido", d.total + caixa + somaB - somaD, VERDE]];
  const bw = (R - M - 3 * 8) / 4; caixas.forEach(([t, v, cor], i) => { const x = M + i * (bw + 8); pdf.rect(x, y, bw, 52, OSSO); pdf.text(x + 8, y + 18, t, { size: 8.5, color: CINZA }); pdf.text(x + 8, y + 40, fBRL(v), { size: 12, font: "F2", color: cor }); });
  y += 76;
  // posições
  titulo("Posições (custo de aquisição e valor atual)");
  const col = { a: M, p: M + 150, dt: M + 250, inv: M + 360, v: M + 440, r: R };
  pdf.rect(M, y - 11, R - M, 18, OSSO); pdf.text(col.a + 4, y + 1, "Ativo", { size: 8.5, font: "F2" }); pdf.text(col.p, y + 1, "Plataforma", { size: 8.5, font: "F2" }); pdf.text(col.dt, y + 1, "Compra", { size: 8.5, font: "F2" });
  pdf.text(col.inv + 60, y + 1, "Investido", { size: 8.5, font: "F2", align: "right" }); pdf.text(col.v + 50, y + 1, "Valor hoje", { size: 8.5, font: "F2", align: "right" }); pdf.text(col.r, y + 1, "Resultado", { size: 8.5, font: "F2", align: "right" }); y += 18;
  let tInv = 0, tVal = 0;
  for (const p of d.posicoes) {
    nova(16); const res = p.value - p.inv; tInv += p.inv; tVal += p.value;
    pdf.text(col.a + 4, y, rotulo(p).slice(0, 26), { size: 9 }); pdf.text(col.p, y, String(p.plat || "—").slice(0, 18), { size: 9, color: CINZA }); pdf.text(col.dt, y, p.dt ? dBR(p.dt) : "—", { size: 9, color: CINZA });
    pdf.text(col.inv + 60, y, fBRL(p.inv), { size: 9, align: "right" }); pdf.text(col.v + 50, y, fBRL(p.value), { size: 9, align: "right" }); pdf.text(col.r, y, `${res >= 0 ? "+" : ""}${fBRL(res)}`, { size: 9, align: "right", color: res >= 0 ? VERDE : VERM });
    pdf.line(M, y + 5, R, y + 5, "#E4E1D8", 0.4); y += 16;
  }
  nova(24); pdf.text(col.a + 4, y + 4, "Total", { size: 9.5, font: "F2" }); pdf.text(col.inv + 60, y + 4, fBRL(tInv), { size: 9.5, font: "F2", align: "right" }); pdf.text(col.v + 50, y + 4, fBRL(tVal), { size: 9.5, font: "F2", align: "right" });
  pdf.text(col.r, y + 4, `${tVal - tInv >= 0 ? "+" : ""}${fBRL(tVal - tInv)}`, { size: 9.5, font: "F2", align: "right", color: tVal - tInv >= 0 ? VERDE : VERM }); y += 34;
  // proventos
  titulo(`Proventos estimados de ${d.ano}`);
  const pm = d.proventos?.meses || [];
  if (!pm.length) { pdf.text(M, y, "Nenhum provento estimado (cadastre a data de compra das ações e FIIs para estimar).", { size: 9.5, color: CINZA }); y += 22; }
  else { for (const m of pm) { nova(16); pdf.text(M + 4, y, `${m.ym.slice(5)}/${m.ym.slice(0, 4)}`, { size: 9.5 }); pdf.text(R, y, fBRL(m.v), { size: 9.5, align: "right" }); pdf.line(M, y + 5, R, y + 5, "#E4E1D8", 0.4); y += 16; } nova(20); pdf.text(M + 4, y + 2, "Total estimado", { size: 9.5, font: "F2" }); pdf.text(R, y + 2, fBRL(pm.reduce((s, m) => s + m.v, 0)), { size: 9.5, font: "F2", align: "right" }); y += 28; }
  // bens e dívidas
  if ((d.bens || []).length) {
    titulo("Outros bens e dívidas informados");
    for (const b of d.bens) { nova(16); pdf.text(M + 4, y, `${b.tp === "divida" ? "Dívida · " : "Bem · "}${String(b.nome).slice(0, 60)}`, { size: 9.5 }); pdf.text(R, y, `${b.tp === "divida" ? "-" : ""}${fBRL(b.valor)}`, { size: 9.5, align: "right", color: b.tp === "divida" ? VERM : INK }); pdf.line(M, y + 5, R, y + 5, "#E4E1D8", 0.4); y += 16; }
    y += 14;
  }
  nova(70);
  const aviso = "Documento de apoio gerado no seu aparelho pelo Uiraçu, a partir do que você cadastrou. Valores atuais usam as cotações do dia; proventos são estimativas pelas datas publicadas; rentabilidade de renda fixa, quando exibida, é estimada. Não substitui os informes de rendimentos da corretora, do banco e do Tesouro Direto: confira-os antes de declarar.";
  const linhas = []; let l = ""; for (const w of aviso.split(" ")) { if ((l + " " + w).length > 108) { linhas.push(l); l = w; } else l = l ? l + " " + w : w; } linhas.push(l);
  linhas.forEach((t, i) => pdf.text(M, y + i * 12, t, { size: 8.5, color: CINZA })); y += linhas.length * 12 + 8;
  pdf.text(M, y, `Gerado em ${dBR(geradoEm.toISOString().slice(0, 10))}`, { size: 8.5, color: CINZA });
  return pdf.build();
}
