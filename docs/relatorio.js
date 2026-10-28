// Relatório mensal em PDF (A4), gerado em JS puro: roda no navegador (app) e no Cloudflare Worker (bot). Sem bibliotecas.
import { summarize, catOf, fBRL, dBR, ymLabel, ymAdd } from "./gastos-core.js";

// ------------------------------------------------------------------ PDF mínimo (Helvetica, Helvetica-Bold, Courier)
const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
export function textWidth(s, size, bold = false) {
  let w = 0;
  for (const ch of String(s)) {
    const base = ch.normalize("NFD")[0]; const c = base.charCodeAt(0);
    w += c >= 32 && c <= 126 ? HW[c - 32] : 556;
  }
  return (w / 1000) * size * (bold ? 1.06 : 1);
}
const CP = { 0x2014: 0x97, 0x2013: 0x96, 0x2022: 0x95, 0x2026: 0x85, 0x20ac: 0x80 };
const enc = (s) => { let o = ""; for (const ch of String(s)) { const c = ch.charCodeAt(0); const b = c < 256 ? c : CP[c] ?? 63; o += String.fromCharCode(b); } return o; };
const esc = (s) => enc(s).replace(/([\\()])/g, "\\$1");
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(" "); };

export class Pdf {
  constructor() { this.W = 595.28; this.H = 841.89; this.pages = []; this.cur = null; this.addPage(); }
  addPage() { this.cur = []; this.pages.push(this.cur); }
  y(y) { return (this.H - y).toFixed(2); } // y medido do topo
  rect(x, y, w, h, hex) { this.cur.push(`${rgb(hex)} rg ${x.toFixed(2)} ${this.y(y + h)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  line(x1, y1, x2, y2, hex, wd = .6) { this.cur.push(`${rgb(hex)} RG ${wd} w ${x1.toFixed(2)} ${this.y(y1)} m ${x2.toFixed(2)} ${this.y(y2)} l S`); }
  text(x, y, s, { size = 10, font = "F1", color = "#0D0F10", align = "left" } = {}) {
    let X = x; const w = font === "F3" ? String(s).length * size * .6 : textWidth(s, size, font === "F2");
    if (align === "right") X = x - w; else if (align === "center") X = x - w / 2;
    this.cur.push(`BT ${rgb(color)} rg /${font} ${size} Tf ${X.toFixed(2)} ${this.y(y)} Td (${esc(s)}) Tj ET`);
  }
  build() {
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    add("<< /Type /Catalog /Pages 2 0 R >>"); add(""); // 2 = Pages (preenchido depois)
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
    const kids = [];
    for (const ops of this.pages) {
      const body = ops.join("\n"); const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      const p = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${c} 0 R >>`);
      kids.push(`${p} 0 R`);
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
    let out = "%PDF-1.4\n"; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const u8 = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255; // cada char já é um byte (cp1252)
    return u8;
  }
}

// ------------------------------------------------------------------ layout do relatório
export const INK = "#0D0F10", OSSO = "#F3F0E8", OLHO = "#F2A900", CINZA = "#6B7684", VERDE = "#1E7B57", VERM = "#B3261E";

/** list = todos os lançamentos; ym = "AAAA-MM"; devolve Uint8Array com o PDF. */
export function relatorioPdf(list, ym, { geradoEm = new Date() } = {}) {
  const S = summarize(list, ym), P = summarize(list, ymAdd(ym, -1));
  const pdf = new Pdf(), M = 40, W = pdf.W, R = W - M;
  const header = () => {
    pdf.rect(0, 0, W, 74, INK); pdf.rect(0, 74, W, 3, OLHO);
    pdf.text(M, 46, "uiraçu", { size: 24, font: "F2", color: OSSO });
    pdf.text(M + 88, 46, "olho de harpia", { size: 9, font: "F2", color: OLHO });
    pdf.text(R, 38, "Relatório de gastos", { size: 11, font: "F2", color: OSSO, align: "right" });
    pdf.text(R, 55, ymLabel(ym), { size: 10, color: "#C9CED4", align: "right" });
  };
  header();
  let y = 108;
  // quatro caixas de resumo
  const boxes = [["Receitas", S.receitas, VERDE], ["Gastos", S.gastos, INK], ["Investido", S.investido, "#8A6100"], ["Saldo", S.saldo, S.saldo >= 0 ? VERDE : VERM]];
  const bw = (R - M - 3 * 10) / 4;
  boxes.forEach(([t, v, cor], i) => {
    const x = M + i * (bw + 10); pdf.rect(x, y, bw, 58, "#F4F4F2"); pdf.rect(x, y, 3, 58, cor);
    pdf.text(x + 12, y + 19, t.toUpperCase(), { size: 8, font: "F2", color: CINZA });
    pdf.text(x + 12, y + 42, fBRL(v), { size: 13, font: "F2", color: cor });
  });
  y += 80;
  // comparação com o mês anterior
  if (P.gastos > 0) {
    const d = S.gastos - P.gastos, pct = (d / P.gastos) * 100;
    pdf.text(M, y, `Gastos ${d >= 0 ? "acima" : "abaixo"} do mês anterior em ${fBRL(Math.abs(d))} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%). Mês anterior: ${fBRL(P.gastos)}.`, { size: 9, color: d > 0 ? VERM : VERDE });
    y += 22;
  }
  // categorias
  pdf.text(M, y + 12, "Gastos por categoria", { size: 12, font: "F2" }); y += 26;
  if (!S.porCat.length) { pdf.text(M, y + 10, "Nenhum gasto registrado neste mês.", { size: 10, color: CINZA }); y += 30; }
  const barMax = 250;
  for (const c of S.porCat.slice(0, 11)) {
    pdf.text(M, y + 10, c.n, { size: 10 });
    pdf.rect(M + 110, y + 1, barMax, 11, "#ECEAE4"); pdf.rect(M + 110, y + 1, Math.max(2, barMax * c.pct), 11, c.cor);
    pdf.text(R - 60, y + 10, fBRL(c.v), { size: 10, font: "F2", align: "right" });
    pdf.text(R, y + 10, (c.pct * 100).toFixed(0) + "%", { size: 9, color: CINZA, align: "right" });
    y += 20;
  }
  y += 14;
  // lançamentos
  const colV = R, colD = M + 190, colC = M + 66;
  const tableHead = () => {
    pdf.rect(M, y, R - M, 20, INK);
    pdf.text(M + 8, y + 14, "Data", { size: 9, font: "F2", color: OSSO }); pdf.text(colC, y + 14, "Categoria", { size: 9, font: "F2", color: OSSO });
    pdf.text(colD, y + 14, "Descrição", { size: 9, font: "F2", color: OSSO }); pdf.text(colV - 8, y + 14, "Valor", { size: 9, font: "F2", color: OSSO, align: "right" });
    y += 20;
  };
  pdf.text(M, y + 12, `Lançamentos (${S.itens.length})`, { size: 12, font: "F2" }); y += 22;
  tableHead();
  S.itens.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1)).forEach((x, i) => {
    if (y > pdf.H - 70) { pdf.addPage(); header(); y = 100; tableHead(); }
    if (i % 2 === 0) pdf.rect(M, y, R - M, 18, "#F7F6F2");
    const rec = x.tp === "receita";
    pdf.text(M + 8, y + 12.5, dBR(x.ts).slice(0, 5), { size: 9 });
    pdf.text(colC, y + 12.5, catOf(x.c, x.tp).n, { size: 9, color: CINZA });
    let d = x.d; const maxw = colV - 90 - colD; while (d.length > 3 && textWidth(d, 9) > maxw) d = d.slice(0, -2);
    pdf.text(colD, y + 12.5, d === x.d ? d : d.trimEnd() + "…", { size: 9 });
    pdf.text(colV - 8, y + 12.5, (rec ? "+ " : "") + fBRL(x.v), { size: 9, font: "F2", color: rec ? VERDE : INK, align: "right" });
    y += 18;
  });
  // rodapé em todas as páginas
  const g = geradoEm, dd = `${String(g.getDate()).padStart(2, "0")}/${String(g.getMonth() + 1).padStart(2, "0")}/${g.getFullYear()}`;
  pdf.pages.forEach((ops, i) => { pdf.cur = ops; pdf.line(M, pdf.H - 40, R, pdf.H - 40, "#D8D6CF"); pdf.text(M, pdf.H - 26, `uiraçu · gerado em ${dd}`, { size: 8, color: CINZA }); pdf.text(R, pdf.H - 26, `Página ${i + 1} de ${pdf.pages.length}`, { size: 8, color: CINZA, align: "right" }); });
  return pdf.build();
}
