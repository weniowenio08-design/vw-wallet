// Núcleo do módulo de gastos: sem DOM e sem dependências, usado pelo app (navegador) e pelo bot (Cloudflare Worker).
// Lançamento: { id, ts: "AAAA-MM-DD", v: número em reais, c: chave da categoria, d: descrição, tp: "gasto"|"receita", src: "app"|"wa", deleted?: 0|1 }

export const CATS = [
  { k: "mercado", n: "Mercado", cor: "#2E9E6E", kw: ["mercado", "supermercado", "feira", "padaria", "acougue", "hortifruti", "atacadao", "assai", "carrefour", "compras do mes", "sacolao"] },
  { k: "alimentacao", n: "Alimentação", cor: "#F26B21", kw: ["restaurante", "lanche", "ifood", "pizza", "hamburguer", "almoco", "jantar", "cafe", "sorvete", "marmita", "delivery", "rappi", "bar", "churrasco"] },
  { k: "transporte", n: "Transporte", cor: "#1F4FD8", kw: ["uber", "99", "taxi", "onibus", "metro", "gasolina", "combustivel", "etanol", "estacionamento", "pedagio", "passagem", "bilhete unico", "mecanico", "oficina"] },
  { k: "moradia", n: "Moradia", cor: "#0B6F6F", kw: ["aluguel", "condominio", "luz", "energia", "agua", "internet", "gas", "iptu", "telefone", "plano celular", "conta de luz"] },
  { k: "saude", n: "Saúde", cor: "#C0392B", kw: ["farmacia", "remedio", "consulta", "dentista", "exame", "medico", "plano de saude", "psicologo", "academia", "drogaria"] },
  { k: "lazer", n: "Lazer", cor: "#8E44AD", kw: ["cinema", "jogo", "game", "viagem", "hotel", "show", "ingresso", "steam", "festa", "passeio", "hospedagem"] },
  { k: "educacao", n: "Educação", cor: "#B7950B", kw: ["curso", "livro", "escola", "faculdade", "mensalidade", "udemy", "material escolar"] },
  { k: "compras", n: "Compras", cor: "#D35400", kw: ["roupa", "tenis", "sapato", "shopee", "amazon", "mercado livre", "shein", "presente", "eletronico", "celular novo", "camiseta", "camisetas", "camisa", "calca", "vestido", "bermuda", "meia", "meias"] },
  { k: "assinaturas", n: "Assinaturas", cor: "#5D6D7E", kw: ["netflix", "spotify", "youtube", "prime", "disney", "hbo", "claude", "chatgpt", "assinatura", "icloud", "google one"] },
  { k: "investimento", n: "Investimento", cor: "#F2A900", kw: ["aporte", "tesouro", "investimento", "cdb", "acoes", "fii", "bolsa", "corretora"] },
  { k: "outros", n: "Outros", cor: "#7F8C8D", kw: [] },
];
export const CATS_REC = [
  { k: "salario", n: "Salário", cor: "#2E9E6E", kw: ["salario", "pagamento", "holerite", "13o"] },
  { k: "renda_extra", n: "Renda extra", cor: "#F2A900", kw: ["freela", "freelance", "upwork", "projeto", "extra", "venda", "cliente"] },
  { k: "outras_receitas", n: "Outras receitas", cor: "#7F8C8D", kw: [] },
];
export const catOf = (k, tp = "gasto") => (tp === "receita" ? CATS_REC : CATS).find((c) => c.k === k) || (tp === "receita" ? CATS_REC[2] : CATS[CATS.length - 1]);

export const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9$,.+/ ]/g, " ").replace(/\s+/g, " ").trim();
const two = (n) => String(n).padStart(2, "0");

// Lê número com vírgula OU ponto: "45,90", "45.90", "1.234,56", "1,234.56". "1.000" vale mil.
export function num(s) {
  let t = String(s ?? "").replace(/R\$|\s/gi, ""); if (!t) return null;
  const hasC = t.includes(","), hasD = t.includes(".");
  if (hasC && hasD) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (hasC) t = t.split(",").length > 2 ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (hasD) { const p = t.split("."); if (p.length > 2 || (p[1].length === 3 && p[0] !== "0" && p[0] !== "")) t = p.join(""); }
  const v = parseFloat(t); return isNaN(v) ? null : v;
}

export function guessCat(text, tp = "gasto") {
  const t = " " + norm(text).replace(/[$,.+/]/g, " ") + " ";
  for (const c of tp === "receita" ? CATS_REC : CATS) for (const kw of c.kw) if (t.includes(" " + kw + " ") || (kw.length > 4 && t.includes(" " + kw))) return c.k;
  return tp === "receita" ? "outras_receitas" : "outros";
}

const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const hojeBRT = (now = Date.now()) => new Date(now - 3 * 3600e3).toISOString().slice(0, 10);

/** Tira a data do texto ("ontem", "dia 12", "12/10") e devolve { date, rest }. */
export function takeDate(text, hoje) {
  let t = " " + norm(text) + " ", date = hoje;
  const m1 = t.match(/ (\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))? /);
  if (m1) {
    const y = m1[3] ? (m1[3].length === 2 ? 2000 + +m1[3] : +m1[3]) : +hoje.slice(0, 4);
    const d = `${y}-${two(+m1[2])}-${two(+m1[1])}`; if (+m1[1] >= 1 && +m1[1] <= 31 && +m1[2] >= 1 && +m1[2] <= 12) { date = d; t = t.replace(m1[0], " "); }
  } else if (/ anteontem /.test(t)) { date = addDays(hoje, -2); t = t.replace(" anteontem ", " "); }
  else if (/ ontem /.test(t)) { date = addDays(hoje, -1); t = t.replace(" ontem ", " "); }
  else if (/ hoje /.test(t)) { t = t.replace(" hoje ", " "); }
  else { const m2 = t.match(/ dia (\d{1,2}) /); if (m2 && +m2[1] >= 1 && +m2[1] <= 31) { date = `${hoje.slice(0, 7)}-${two(+m2[1])}`; if (date > hoje) date = addDays(date, -30); t = t.replace(m2[0], " "); } }
  return { date, rest: t.trim() };
}

const FILLER = new Set(["gastei", "gasto", "paguei", "pago", "comprei", "compra", "no", "na", "nos", "nas", "de", "do", "da", "com", "em", "um", "uma", "reais", "real", "r$", "foi", "deu", "por", "para", "pra", "valor", "recebi", "receita", "entrada", "ganhei", "mais", "o", "a", "e", "fui", "pix", "me", "mandaram", "caiu", "hoje"]);

/** Entende frases como "gastei 45,90 no mercado", "uber 23.5 ontem", "+1500 salario", "recebi 800 do freela". */
export function parseMessage(text, hoje = hojeBRT()) {
  const raw = String(text ?? "").trim(); if (!raw) return { ok: false, motivo: "vazio" };
  const { date, rest } = takeDate(raw, hoje);
  const isRec = /^\s*\+/.test(raw) || /\b(recebi|receita|salario|ganhei|entrada|caiu na conta|me pagaram|me mandaram)\b/.test(rest);
  const toks = [...rest.matchAll(/(?:r\$\s*)?\d[\d.,]*/g)].map((m) => ({ s: m[0], i: m.index }));
  // escolhe o valor: com "R$"/"reais" > depois de "por/total/custou" > o maior número
  let best = null;
  for (const k of toks) {
    const v = num(k.s); if (v == null || v <= 0) continue;
    const marked = /r\$/.test(k.s) || /^\s*(reais|real)/.test(rest.slice(k.i + k.s.length));
    const cue = /(?:^| )(por|total|custou|deu|foi)\s*$/.test(rest.slice(0, k.i));
    const score = marked ? 3 : cue ? 2 : 1;
    if (!best || score > best.score || (score === best.score && v > best.v)) best = { v, s: k.s, score, marked };
  }
  if (!best) return { ok: false, motivo: "sem_valor", date };
  if (/ mil( |$)/.test(" " + rest) && best.v < 1000 && !best.marked) best.v *= 1000;
  const tp = isRec ? "receita" : "gasto";
  // descrição: palavras originais (com acento), sem valor, data e palavras de ligação
  const DATEW = new Set(["ontem", "anteontem", "hoje"]); const rawT = raw.split(/\s+/); const words = []; let amountDropped = false;
  for (let i = 0; i < rawT.length; i++) {
    const w = rawT[i], n = norm(w);
    if (!n || FILLER.has(n) || DATEW.has(n) || /^\+/.test(w) && /^\+?\d/.test(w)) continue;
    if (n === "dia" && /^\d{1,2}$/.test(norm(rawT[i + 1] || ""))) { i++; continue; }
    if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(n)) continue;
    if (/^(r\$)?\d[\d.,]*$/.test(n)) { const v = num(n); if (!amountDropped && v === best.v) { amountDropped = true; continue; } if (/^\d+$/.test(n)) continue; }
    words.push(w.replace(/^\+/, ""));
  }
  const d = words.join(" ").trim();
  const c = guessCat(d || rest, tp);
  if (d && !/[a-zà-ÿ]/i.test(d)) return { ok: false, motivo: "sem_valor", date };
  const desc = d ? d.charAt(0).toUpperCase() + d.slice(1) : catOf(c, tp).n;
  return { ok: true, tp, v: Math.round(best.v * 100) / 100, c, d: desc, date };
}

export const fBRL = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const ymOf = (iso) => iso.slice(0, 7);
export const ymLabel = (ym) => { const M = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]; return `${M[+ym.slice(5) - 1]} de ${ym.slice(0, 4)}`; };
export const ymAdd = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5) - 1 + n, 1)); return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}`; };
export const dBR = (iso) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Resumo de um mês. Investimentos não entram em "gastos": aparecem como "investido". */
export function summarize(list, ym, w) {
  const itens = list.filter((x) => !x.deleted && x.ts.startsWith(ym) && !x.pd && (!w || contaDe(x) === w)).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  let gastos = 0, receitas = 0, investido = 0; const por = {};
  for (const x of itens) {
    if (x.tp === "receita") receitas += x.v;
    else if (x.c === "investimento") investido += x.v;
    else { gastos += x.v; por[x.c] = (por[x.c] || 0) + x.v; }
  }
  const porCat = Object.entries(por).map(([k, v]) => ({ k, n: catOf(k).n, cor: catOf(k).cor, v, pct: gastos ? v / gastos : 0 })).sort((a, b) => b.v - a.v);
  const r2 = (v) => Math.round(v * 100) / 100;
  return { ym, itens, gastos: r2(gastos), receitas: r2(receitas), investido: r2(investido), saldo: r2(receitas - gastos - investido), porCat };
}

/** CSV para Excel/Planilhas em português: separador ";", vírgula decimal, UTF-8 com BOM. */
export function toCsv(list) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["Data", "Tipo", "Categoria", "Descrição", "Valor (R$)", "Origem", "Conta", "Meio", "Lote", "Dedutível", "Parcela", "A vencer"].map(q).join(";")];
  for (const x of [...list].filter((x) => !x.deleted).sort((a, b) => (a.ts < b.ts ? -1 : 1)))
    rows.push([q(dBR(x.ts)), q(x.tp === "receita" ? "Receita" : "Gasto"), q(catOf(x.c, x.tp).n), q(x.d), q(String(x.v.toFixed(2)).replace(".", ",")), q(x.src === "wa" ? "WhatsApp" : "App"), q(contaDe(x) === "e" ? "Empresa" : "Pessoal"), q(x.m || ""), q(x.l || ""), q(x.dd ? "Sim" : ""), q(x.pg ? `${x.pg.i}/${x.pg.n}` : ""), q(x.pd ? "Sim" : "")].join(";"));
  return "﻿" + rows.join("\r\n") + "\r\n";
}

export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Valida e limpa um lançamento vindo de fora (app, IA ou webhook). */
export function cleanItem(x) {
  if (!x || typeof x !== "object") return null;
  const v = Number(x.v), ts = String(x.ts || "");
  if (!isFinite(v) || v <= 0 || v > 1e9 || !/^\d{4}-\d{2}-\d{2}$/.test(ts)) return null;
  const tp = x.tp === "receita" ? "receita" : "gasto";
  const cs = (tp === "receita" ? CATS_REC : CATS).map((c) => c.k);
  return { id: (String(x.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || newId()), ts, v: Math.round(v * 100) / 100, c: cs.includes(x.c) ? x.c : tp === "receita" ? "outras_receitas" : "outros", d: String(x.d ?? "").slice(0, 120), tp, src: x.src === "wa" ? "wa" : "app", deleted: x.deleted ? 1 : 0, ...(x.w === "e" ? { w: "e" } : {}), ...cleanExtras(x) };
}

// ------------------------------------------------------------ contas: Pessoal e Empresa (granjas)
export const CONTAS = [{ k: "p", n: "Pessoal" }, { k: "e", n: "Empresa" }];
export const contaDe = (x) => (x && x.w === "e" ? "e" : "p");
export const contaNome = (w) => (w === "e" ? "Empresa" : "Pessoal");
/** Valor em reais escrito de qualquer jeito: "100000", "100.000", "100,50", "R$ 100 mil". */
export function valorBR(s) {
  let t = String(s ?? "").toLowerCase().replace(/r\$/g, "").replace(/reais|real/g, "").trim();
  const mil = /\bmil\b/.test(t); t = t.replace(/\bmil\b/, "").trim();
  let n = num(t); if (n == null || !isFinite(n)) return null;
  if (mil) n *= 1000; return n > 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
}
/** Tira do começo ou do fim da frase a palavra que diz a conta ("empresa ração 3200", "diesel 450 granja"). */
export function parseConta(text) {
  let t = String(text ?? "").trim(), w = null, m;
  const nm = "(empresa|empresarial|granjas?|negocio|negócio|pessoal)", ehP = (s) => /pessoal/i.test(s);
  if ((m = new RegExp("^" + nm + "\\s*[:,\\-]?\\s+", "i").exec(t))) { w = ehP(m[1]) ? "p" : "e"; t = t.slice(m[0].length); }
  else if ((m = new RegExp("[\\s,\\-]+(?:na |da |do |no |de )?" + nm + "\\s*$", "i").exec(t))) { w = ehP(m[1]) ? "p" : "e"; t = t.slice(0, m.index); }
  return { w, text: t.trim() };
}

// ------------------------------------------------------------ extras do lançamento: meio de pagamento, lote, dedutível, parcelas
export const EXTRAS = ["m", "l", "dd", "pg", "pd"];
/** Valida os campos extras vindos de fora. */
export function cleanExtras(x) {
  const ex = {};
  if (typeof x.m === "string" && x.m.trim()) ex.m = x.m.trim().slice(0, 24);
  if (typeof x.l === "string" && x.l.trim()) ex.l = x.l.trim().slice(0, 30);
  if (x.dd) ex.dd = 1;
  if (x.pd) ex.pd = 1;   // conta a vencer: ainda não paga, fora dos totais até a baixa
  if (x.pg && typeof x.pg === "object") {
    const i = Math.round(+x.pg.i), n = Math.round(+x.pg.n), g = String(x.pg.g || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16);
    if (g && i >= 1 && n >= i && n <= 60) ex.pg = { g, i, n };
  }
  return ex;
}
const MEIOS = { pix: "Pix", dinheiro: "Dinheiro", especie: "Dinheiro", debito: "Débito", credito: "Crédito", cartao: "Cartão", nubank: "Nubank", inter: "Inter", itau: "Itaú", bradesco: "Bradesco", caixa: "Caixa", santander: "Santander", c6: "C6", picpay: "PicPay", "mercado pago": "Mercado Pago", "banco do brasil": "Banco do Brasil", bb: "BB" };
const capl = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Tira da frase o meio de pagamento ("no nubank"), o lote ("lote 3", "#galpao2"), "dedutível" e as parcelas ("em 3x", "3x de 100"). */
export function parseExtras(text) {
  let t = String(text ?? ""), ex = {};
  const take = (re, fn) => { const m = re.exec(t); if (m && fn(m) !== false) t = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim(); };
  take(/\b(?:dedut[ií]vel|deduzir|declarar)\b/i, () => { ex.dd = 1; });
  if (!/\b(?:paguei|pago|pagou|quitei)\b/i.test(t)) take(/\b(?:boleto|a pagar|vence|vencimento|vencendo|fatura)\b/i, () => { ex.pd = 1; });   // conta a vencer
  take(/\b(lote|galp[aã]o|talh[aã]o|avi[aá]rio|safra)\s+([\p{L}\d]{1,12})\b/iu, (m) => { ex.l = capl(m[1].toLowerCase()) + " " + m[2]; });
  if (!ex.l) take(/#\s*([\p{L}\d_-]{1,20})/u, (m) => { ex.l = capl(m[1]); });
  const parc = (n, por) => { n = +n; if (n < 2 || n > 60) return false; ex.parc = n; if (por) ex.porParcela = true; };
  take(/\b(\d{1,2})\s*x\s+de\b/i, (m) => parc(m[1], true));
  if (!ex.parc) take(/\bem\s+(\d{1,2})\s*x\b/i, (m) => parc(m[1]));
  if (!ex.parc) take(/\bparcel\w*\s+(?:em\s+)?(\d{1,2})\s*x?\b/i, (m) => parc(m[1]));
  if (!ex.parc) take(/\b(?:em\s+)?(\d{1,2})\s*(?:vezes|parcelas?)\b/i, (m) => parc(m[1]));
  take(/\b(?:no|na|com|pelo|pela|via)\s+(?:o\s+|a\s+)?(?:cart[aã]o\s+(?:d[oae]\s+)?)?(nubank|inter|ita[uú]|bradesco|caixa|santander|c6|picpay|mercado\s+pago|banco\s+do\s+brasil|bb|pix|dinheiro|esp[eé]cie|d[eé]bito|cr[eé]dito|cart[aã]o)\b/i, (m) => { ex.m = MEIOS[norm(m[1])] || capl(m[1]); });
  return { text: t, ...ex };
}
/** Soma meses a uma data AAAA-MM-DD, sem estourar o fim do mês (31/jan + 1 mês = 28/fev). */
export function addMonthsISO(iso, k) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10), alvo = new Date(Date.UTC(y, m + k, 1)), ult = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return `${alvo.getUTCFullYear()}-${two(alvo.getUTCMonth() + 1)}-${two(Math.min(d, ult))}`;
}
/** Transforma o que foi entendido da frase em lançamentos: 1, ou N parcelas mensais (a primeira na data da compra). */
export function expandir(p, ex = {}, base = {}) {
  const extras = { ...(ex.m ? { m: ex.m } : {}), ...(ex.l ? { l: ex.l } : {}), ...(ex.dd ? { dd: 1 } : {}) };
  const n = ex.parc && p.tp === "gasto" ? ex.parc : 1;
  if (n === 1) return [{ id: newId(), ts: p.date, v: p.v, c: p.c, d: p.d, tp: p.tp, ...base, ...extras, ...(ex.pd && p.tp === "gasto" ? { pd: 1 } : {}) }];
  const g = newId().slice(0, 8), total = ex.porParcela ? Math.round(p.v * n * 100) / 100 : p.v, cada = ex.porParcela ? p.v : Math.floor((total * 100) / n) / 100, nome = p.d || catOf(p.c, p.tp).n;
  return Array.from({ length: n }, (_, i) => ({ id: newId(), ts: addMonthsISO(p.date, i), v: i === n - 1 ? Math.round((total - cada * (n - 1)) * 100) / 100 : cada, c: p.c, d: `${nome} (${i + 1}/${n})`, tp: p.tp, ...base, ...extras, pg: { g, i: i + 1, n } }));
}

/** Conta a vencer escrita com "dia 5": se o dia já passou neste mês, vale o do mês seguinte. */
export function ajustaVencimento(p, ex, hoje) {
  return ex.pd && p.date < hoje ? { ...p, date: addMonthsISO(p.date, 1) } : p;
}
