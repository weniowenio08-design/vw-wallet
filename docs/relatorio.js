// Relatório mensal em PDF (A4), gerado em JS puro: roda no navegador (app) e no Cloudflare Worker (bot). Sem bibliotecas.
import { summarize, catOf, fBRL, dBR, ymLabel, ymAdd } from "./gastos-core.js";
import { WORDMARK, SELO } from "./relatorio-marca.js";

// ------------------------------------------------------------------ PDF mínimo (Helvetica, Helvetica-Bold, Courier + imagens JPEG)
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
  constructor() { this.W = 595.28; this.H = 841.89; this.pages = []; this.cur = null; this.images = {}; this.addPage(); }
  addPage() { this.cur = []; this.pages.push(this.cur); }
  y(y) { return (this.H - y).toFixed(2); } // y medido do topo
  rect(x, y, w, h, hex) { this.cur.push(`${rgb(hex)} rg ${x.toFixed(2)} ${this.y(y + h)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  line(x1, y1, x2, y2, hex, wd = .6) { this.cur.push(`${rgb(hex)} RG ${wd} w ${x1.toFixed(2)} ${this.y(y1)} m ${x2.toFixed(2)} ${this.y(y2)} l S`); }
  /** Polígono preenchido; pontos [x, y] com y medido do topo. */
  poly(pts, hex) { this.cur.push(`${rgb(hex)} rg ` + pts.map(([x, y], i) => `${x.toFixed(2)} ${this.y(y)} ${i ? "l" : "m"}`).join(" ") + " h f"); }
  /** Imagem JPEG já registrada com addImage; (x, y) é o canto superior esquerdo. */
  image(name, x, y, w, h) { this.cur.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${this.y(y + h)} cm /${name} Do Q`); }
  addImage(name, { w, h, b64 }) { this.images[name] = { w, h, b64 }; }
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
    const imgIds = [];
    for (const [name, im] of Object.entries(this.images)) {
      const data = atob(im.b64); // cada char é um byte do JPEG
      imgIds.push(`/${name} ${add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n${data}\nendstream`)} 0 R`);
    }
    const xo = imgIds.length ? ` /XObject << ${imgIds.join(" ")} >>` : "";
    const kids = [];
    for (const ops of this.pages) {
      const body = ops.join("\n"); const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      const p = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xo} >> /Contents ${c} 0 R >>`);
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
// Cores antigas (o relatório da carteira ainda usa) e a paleta da marca Uiraçu (ver Desktop/Uiraçu - Marca/04 Cores).
export const INK = "#0D0F10", OSSO = "#F3F0E8", OLHO = "#F2A900", CINZA = "#6B7684", VERDE = "#1E7B57", VERM = "#B3261E";
const MARINHO = "#0C314A", PETROLEO = "#185365", FLORESTA = "#228A59", OURO = "#C1AB69", OURO_ESC = "#8F7B3A", OURO_CLARO = "#D4C583", CREME = "#F6F3E6", CREME2 = "#EEE9D8", TRILHA = "#E3DDC6", BRANCO = "#FFFFFF", TEXTO2 = "#5B6770";
const PAL = [MARINHO, FLORESTA, PETROLEO, OURO, "#4FA67C", "#5B8DA6", OURO_ESC, "#2F6B8A", "#8FBFA2", "#A99B72", "#3D5A6B"];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mil = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + " mi" : v >= 1000 ? (v / 1000).toFixed(1).replace(".", ",") + " mil" : String(Math.round(v)));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** list = todos os lançamentos; ym = "AAAA-MM"; devolve Uint8Array com o PDF. */
export function relatorioPdf(list, ym, { geradoEm = new Date() } = {}) {
  const S = summarize(list, ym), P = summarize(list, ymAdd(ym, -1));
  const pdf = new Pdf(), M = 40, W = pdf.W, R = W - M;
  pdf.addImage("Im1", WORDMARK); pdf.addImage("Im2", SELO);
  const mesNome = cap(ymLabel(ym));
  // cabeçalho: faixa Marinho com o logo, borda de dentes dourados (grafismo) e o mês
  const header = (primeira) => {
    pdf.rect(0, 0, W, pdf.H, CREME);
    if (primeira) {
      pdf.rect(0, 0, W, 104, MARINHO);
      pdf.image("Im1", M - 6, 18, 166, 64);
      pdf.text(R, 42, "RELATÓRIO DE GASTOS", { size: 8.5, font: "F2", color: OURO_CLARO, align: "right" });
      pdf.text(R, 68, mesNome, { size: 22, font: "F2", color: CREME, align: "right" });
      pdf.text(R, 86, "Resumo do mês, categorias e lançamentos", { size: 8.5, color: "#9FB4C2", align: "right" });
      pdf.rect(0, 104, W, 2.5, OURO);
      for (let x = 0; x < W; x += 16) pdf.poly([[x, 106.5], [x + 16, 106.5], [x + 8, 115]], OURO);
    } else {
      pdf.rect(0, 0, W, 50, MARINHO);
      pdf.image("Im1", M - 4, 8, 90, 34.7);
      pdf.text(R, 31, mesNome, { size: 12, font: "F2", color: CREME, align: "right" });
      pdf.rect(0, 50, W, 2.5, OURO);
    }
  };
  const secao = (titulo, y) => { pdf.text(M, y, titulo, { size: 12.5, font: "F2", color: MARINHO }); pdf.rect(M, y + 5, 22, 2.5, OURO); return y + 24; };
  header(true);
  let y = 136;

  // quatro cartões de resumo
  const cartoes = [
    ["RECEITAS", S.receitas, FLORESTA, "entradas do mês"],
    ["GASTOS", S.gastos, MARINHO, "sem investimentos"],
    ["INVESTIDO", S.investido, OURO_ESC, "separado dos gastos"],
    ["SALDO", S.saldo, S.saldo >= 0 ? FLORESTA : VERM, "receitas – gastos – invest."],
  ];
  const bw = (R - M - 3 * 10) / 4;
  cartoes.forEach(([t, v, cor, nota], i) => {
    const x = M + i * (bw + 10);
    pdf.rect(x, y + 1.5, bw, 70, "#E7E1CB"); // sombra suave
    pdf.rect(x, y, bw, 70, BRANCO); pdf.rect(x, y, bw, 4, cor);
    pdf.text(x + 11, y + 23, t, { size: 7.5, font: "F2", color: TEXTO2 });
    pdf.text(x + 11, y + 44, fBRL(v), { size: 14.5, font: "F2", color: cor });
    pdf.text(x + 11, y + 60, nota, { size: 7, color: CINZA });
  });
  y += 90;

  // leitura rápida: comparação com o mês anterior e maior categoria
  const linhas = [];
  let corFaixa = FLORESTA, fundo = "#E4EFE7";
  if (P.gastos > 0) {
    const d = S.gastos - P.gastos, pct = (d / P.gastos) * 100, ant = ymLabel(ymAdd(ym, -1)).split(" ")[0];
    linhas.push(`Você gastou ${fBRL(Math.abs(d))} ${d >= 0 ? "a mais" : "a menos"} que em ${ant} (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%). Mês anterior: ${fBRL(P.gastos)}.`);
    if (d > 0) { corFaixa = VERM; fundo = "#F6E4E0"; }
  }
  if (S.porCat.length) linhas.push(`Maior gasto do mês: ${S.porCat[0].n}, ${(S.porCat[0].pct * 100).toFixed(0)}% do total (${fBRL(S.porCat[0].v)}).`);
  if (linhas.length) {
    const h = 14 + linhas.length * 15;
    pdf.rect(M, y, R - M, h, fundo); pdf.rect(M, y, 4, h, corFaixa);
    linhas.forEach((t, i) => pdf.text(M + 16, y + 20 + i * 15, t, { size: 9.5, font: i === 0 ? "F2" : "F1", color: MARINHO }));
    y += h + 22;
  }

  // gastos por categoria (cores da marca)
  y = secao("Gastos por categoria", y + 4);
  const corCat = {}; const cats = S.porCat.slice(0, 8);
  if (S.porCat.length > 8) { const resto = S.porCat.slice(8); cats.push({ k: "_", n: "Outras categorias", v: resto.reduce((a, c) => a + c.v, 0), pct: resto.reduce((a, c) => a + c.pct, 0) }); }
  cats.forEach((c, i) => { corCat[c.n] = PAL[i % PAL.length]; });
  S.porCat.slice(8).forEach((c) => { corCat[c.n] = PAL[8 % PAL.length]; });
  if (!cats.length) { pdf.text(M, y + 6, "Nenhum gasto registrado neste mês.", { size: 10, color: CINZA }); y += 28; }
  const barX = M + 118, barMax = 232;
  cats.forEach((c, i) => {
    pdf.rect(M, y + 2, 8, 8, PAL[i % PAL.length]);
    pdf.text(M + 15, y + 10, c.n, { size: 10, color: MARINHO });
    pdf.rect(barX, y + 1, barMax, 10, TRILHA); pdf.rect(barX, y + 1, Math.max(3, barMax * c.pct), 10, PAL[i % PAL.length]);
    pdf.text(R - 46, y + 10, fBRL(c.v), { size: 10, font: "F2", color: MARINHO, align: "right" });
    pdf.text(R, y + 10, (c.pct * 100).toFixed(0) + "%", { size: 9, color: TEXTO2, align: "right" });
    y += 20;
  });
  y += 12;

  // evolução dos gastos nos últimos 6 meses
  y = secao("Evolução dos gastos (6 meses)", y + 4);
  const meses = [-5, -4, -3, -2, -1, 0].map((n) => { const m = ymAdd(ym, n); return { m, v: summarize(list, m).gastos }; });
  const maxV = Math.max(...meses.map((x) => x.v), 1), alt = 78, cw = 54, gap = (R - M - 6 * cw) / 5, base = y + alt + 12;
  pdf.line(M, base, R, base, TRILHA, 1);
  meses.forEach((x, i) => {
    const bx = M + i * (cw + gap), hh = Math.max(x.v > 0 ? 3 : 0, (x.v / maxV) * alt), atual = i === 5;
    pdf.rect(bx, base - hh, cw, hh, atual ? FLORESTA : "#8FA5B3");
    if (x.v > 0) pdf.text(bx + cw / 2, base - hh - 5, mil(x.v), { size: 8, font: "F2", color: atual ? FLORESTA : TEXTO2, align: "center" });
    pdf.text(bx + cw / 2, base + 13, MES[+x.m.slice(5) - 1], { size: 8.5, font: atual ? "F2" : "F1", color: atual ? MARINHO : TEXTO2, align: "center" });
  });
  y = base + 34;

  // lançamentos
  const colV = R, colD = M + 196, colC = M + 66;
  const tableHead = () => {
    pdf.rect(M, y, R - M, 21, MARINHO); pdf.rect(M, y + 21, R - M, 1.5, OURO);
    pdf.text(M + 8, y + 14.5, "Data", { size: 9, font: "F2", color: CREME }); pdf.text(colC, y + 14.5, "Categoria", { size: 9, font: "F2", color: CREME });
    pdf.text(colD, y + 14.5, "Descrição", { size: 9, font: "F2", color: CREME }); pdf.text(colV - 8, y + 14.5, "Valor", { size: 9, font: "F2", color: CREME, align: "right" });
    y += 23;
  };
  if (y > pdf.H - 240) { pdf.addPage(); header(false); y = 74; } // não deixa a tabela começar com poucas linhas no pé da página
  y = secao(`Lançamentos (${S.itens.length})`, y + 2);
  tableHead();
  S.itens.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1)).forEach((x, i) => {
    if (y > pdf.H - 70) { pdf.addPage(); header(false); y = 74; tableHead(); }
    pdf.rect(M, y, R - M, 18, i % 2 === 0 ? BRANCO : CREME2);
    const rec = x.tp === "receita", cat = catOf(x.c, x.tp);
    pdf.text(M + 8, y + 12.5, dBR(x.ts).slice(0, 5), { size: 9, color: MARINHO });
    pdf.rect(colC, y + 6, 5, 5, corCat[cat.n] || (rec ? FLORESTA : PAL[10]));
    pdf.text(colC + 10, y + 12.5, cat.n, { size: 9, color: TEXTO2 });
    let d = x.d; const maxw = colV - 90 - colD; while (d.length > 3 && textWidth(d, 9) > maxw) d = d.slice(0, -2);
    pdf.text(colD, y + 12.5, d === x.d ? d : d.trimEnd() + "…", { size: 9, color: MARINHO });
    pdf.text(colV - 8, y + 12.5, (rec ? "+ " : "") + fBRL(x.v), { size: 9, font: "F2", color: rec ? FLORESTA : MARINHO, align: "right" });
    y += 18;
  });
  if (S.itens.length) {
    pdf.rect(M, y, R - M, 1.5, OURO);
    pdf.text(colV - 8, y + 16, `Total de gastos: ${fBRL(S.gastos)}`, { size: 9.5, font: "F2", color: MARINHO, align: "right" });
  }

  // rodapé em todas as páginas
  const g = geradoEm, dd = `${String(g.getDate()).padStart(2, "0")}/${String(g.getMonth() + 1).padStart(2, "0")}/${g.getFullYear()}`;
  pdf.pages.forEach((ops, i) => {
    pdf.cur = ops; pdf.line(M, pdf.H - 44, R, pdf.H - 44, OURO, .8);
    pdf.image("Im2", M, pdf.H - 38, 18, 18);
    pdf.text(M + 25, pdf.H - 25, `Uiraçu · assessor de gastos · gerado em ${dd}`, { size: 8, color: TEXTO2 });
    pdf.text(R, pdf.H - 25, `Página ${i + 1} de ${pdf.pages.length}`, { size: 8, color: TEXTO2, align: "right" });
  });
  return pdf.build();
}
