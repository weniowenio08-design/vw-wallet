// Cérebro do Alfred Carteira: lê preços, juros e notícias SEM gastar tokens, calcula indicadores,
// classifica ofertas (perfil seguro e de longo prazo) e avisa o celular pelo ntfy.
// Uso: node brain/run.mjs   (variáveis opcionais: NTFY_TOPIC, APP_URL, ANTHROPIC_API_KEY, OUT_DIR, NO_NOTIFY=1)
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { UNIVERSE, CONTEXT, toYahoo } from "./universe.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, "docs", "data");
const STATE_FILE = path.join(ROOT, "state", "state.json");
const UA = "Mozilla/5.0 (compatible; AlfredCarteira/1.0)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowBRT = () => new Date(Date.now() - 3 * 3600e3);
const log = (...a) => console.log("[cerebro]", ...a);

async function get(url, tries = 3, asText = false) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return asText ? await r.text() : await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

// ------------------------------------------------------------------ preços
async function intra(sym) {
  // últimas 5 sessões a cada 5 minutos (faixas de 24 h, 2 dias e 1 semana do app)
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=5m`);
  const r = j.chart?.result?.[0];
  if (!r) throw new Error("sem intradiário " + sym);
  const t = [], c = [];
  (r.timestamp || []).forEach((ts, i) => { const v = r.indicators?.quote?.[0]?.close?.[i]; if (v != null) { t.push(ts); c.push(+v.toFixed(3)); } });
  return { t, c };
}
async function writeIntra(ysym, key) {
  try { await fs.writeFile(path.join(OUT, "series", key + ".i.json"), JSON.stringify(await intra(ysym))); } catch (e) { log("intradiário falhou", key, e.message); }
}
async function chart(sym, range = "5y") {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&events=div`);
  const r = j.chart?.result?.[0];
  if (!r) throw new Error("sem dados " + sym);
  const ts = r.timestamp || [];
  const cl = r.indicators?.quote?.[0]?.close || [];
  const dates = [], close = [];
  for (let i = 0; i < ts.length; i++) {
    if (cl[i] == null) continue;
    dates.push(new Date((ts[i] - 3 * 3600) * 1000).toISOString().slice(0, 10));
    close.push(+cl[i].toFixed(3));
  }
  const divs = Object.values(r.events?.dividends || {}).map((d) => ({ t: d.date, a: d.amount })).sort((x, y) => x.t - y.t);
  return { dates, close, divs, meta: r.meta || {} };
}

const sma = (c, n) => (c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null);
function rsi(c, n = 14) {
  if (c.length < n + 2) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; d > 0 ? (g += d) : (l -= d); }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function annVol(c, n = 30) {
  const s = c.slice(-(n + 1));
  if (s.length < n + 1) return null;
  const r = []; for (let i = 1; i < s.length; i++) r.push(Math.log(s[i] / s[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252);
}

function analyze(u, ch) {
  const c = ch.close, n = c.length;
  if (n < 60) return null;
  const p = c[n - 1], prev = c[n - 2];
  const win = c.slice(-252);
  const hi = Math.max(...win), lo = Math.min(...win);
  const dd = p / hi - 1;
  const s50 = sma(c, 50), s200 = sma(c, 200);
  const r = rsi(c), vol = annVol(c);
  const d1 = p / prev - 1, d5 = p / c[n - 6] - 1, d21 = p / c[n - 22] - 1;
  const rel200 = s200 ? p / s200 - 1 : null;
  return { p, d1, d5, d21, hi, lo, dd, s50, s200, rel200, rsi: r, vol, n };
}

// ------------------------------------------------------------------ regime e pontuação
function regimeOf(ibov) {
  if (!ibov) return { level: "calmo", why: "sem dados do Ibovespa" };
  if (ibov.d1 <= -0.04 || ibov.d5 <= -0.07) return { level: "estresse", why: `Ibovespa ${(ibov.d1 * 100).toFixed(1)}% no dia e ${(ibov.d5 * 100).toFixed(1)}% em 5 dias` };
  if (ibov.d1 <= -0.02 || ibov.d5 <= -0.04) return { level: "tensao", why: `Ibovespa ${(ibov.d1 * 100).toFixed(1)}% no dia` };
  return { level: "calmo", why: "mercado sem estresse" };
}

function classify(u, a, regime) {
  const why = [];
  let score = 0;
  const mult = u.type === "fii" ? 3.2 : 1.6;
  const ddThr = u.type === "fii" ? -0.08 : -0.15;
  score += Math.min(40, Math.max(0, -a.dd * 100 * mult));
  if (a.dd <= ddThr) why.push(`${(a.dd * 100).toFixed(0)}% abaixo da máxima de 12 meses`);
  if (a.rsi != null) {
    if (a.rsi <= 30) { score += 30; why.push(`RSI ${a.rsi.toFixed(0)}: muito vendida`); }
    else if (a.rsi <= 35) { score += 22; why.push(`RSI ${a.rsi.toFixed(0)}: vendida`); }
    else if (a.rsi <= 40) { score += 12; why.push(`RSI ${a.rsi.toFixed(0)}: fraca`); }
  }
  if (a.rel200 != null) {
    if (a.rel200 >= -0.15) score += 15;
    else if (a.rel200 < -0.3) { score -= 20; why.push("muito abaixo da média de 200 dias (tendência ruim)"); }
  }
  if (a.vol != null && a.vol > 0.55) { score -= 10; why.push(`volatilidade alta (${(a.vol * 100).toFixed(0)}% ao ano)`); }
  if (u.type === "fii" && a.pvp != null) {
    const d = (1 - a.pvp) * 100;
    if (a.pvp <= 0.9) { score += 10; why.push(`P/VP ${a.pvp.toFixed(2).replace(".", ",")}: ${d.toFixed(0)}% de desconto sobre o patrimônio`); }
    else if (a.pvp <= 1.0) score += 5;
    else if (a.pvp >= 1.1) { score -= 10; why.push(`P/VP ${a.pvp.toFixed(2).replace(".", ",")}: ${(-d).toFixed(0)}% de ágio, caro`); }
  }
  if (u.core) { score += 15; if (why.length) why.push("empresa/fundo de qualidade (lista core)"); }
  else score = Math.min(score, 60);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let label = "neutro";
  if (score >= 70 && u.core) label = regime.level === "estresse" ? "aguardar" : "oferta";
  else if (score >= 50) label = "observar";
  if (a.rsi != null && a.rsi >= 72 && a.rel200 != null && a.rel200 >= 0.25) {
    label = "esticada";
    why.length = 0;
    why.push(`RSI ${a.rsi.toFixed(0)} e ${(a.rel200 * 100).toFixed(0)}% acima da média de 200 dias: preço esticado`);
  }
  if (a.dd <= -0.35 && a.rel200 != null && a.rel200 < -0.2 && !u.core) label = "evitar";
  return { score, label, why };
}

// ------------------------------------------------------------------ macro e notícias
async function bcb(code, n = 2) {
  try {
    const j = await get(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/${n}?formato=json`, 2);
    return j.map((x) => ({ d: x.data, v: parseFloat(x.valor) }));
  } catch { return null; }
}

const POS = ["sobe", "dispara", "recorde", "alta de", "avança", "valoriza", "melhora", "supera", "corte de juros", "reduz juros", "recupera", "salta", "ganha", "otimismo", "lucro"];
const NEG = ["cai", "queda", "despenca", "desaba", "afunda", "derrete", "crise", "risco", "rombo", "rebaixa", "rebaixamento", "pressão", "teme", "temor", "perde", "circuit breaker", "dívida", "déficit", "alta de juros", "inflação sobe", "estresse", "pânico"];
const KEY = ["copom", "selic", "circuit breaker", "rebaixa", "rebaixamento", "ministro da fazenda", "pec", "arcabouço", "meta fiscal", "rating", "moody", "fitch", "petrobras", "dividendos", "fed ", "tarifa"];
const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function rss(url, srcName) {
  try {
    const x = await get(url, 2, true);
    const items = [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20);
    return items.map((m) => {
      const b = m[1];
      const tag = (t) => { const r = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return r ? decode(r[1]) : ""; };
      let title = tag("title"), source = tag("source") || srcName;
      if (srcName === "Google" && title.includes(" - ")) title = title.slice(0, title.lastIndexOf(" - "));
      return { title, link: tag("link"), date: new Date(tag("pubDate") || Date.now()).toISOString(), source };
    }).filter((n) => n.title);
  } catch { return []; }
}

const BR_FEEDS = [
  ["InfoMoney", "https://www.infomoney.com.br/feed/"], ["Money Times", "https://www.moneytimes.com.br/feed/"], ["Exame", "https://exame.com/invest/feed/"],
  ["G1 Economia", "https://g1.globo.com/rss/g1/economia/"], ["Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml"],
  ["Folha Mercado", "https://feeds.folha.uol.com.br/mercado/rss091.xml"], ["Seu Dinheiro", "https://www.seudinheiro.com/feed/"],
  ["E-Investidor", "https://einvestidor.estadao.com.br/feed/"], ["Investing.com", "https://br.investing.com/rss/news.rss"], ["Suno", "https://www.suno.com.br/noticias/feed/"],
];
const GQ_BR = ["Ibovespa bolsa hoje", "Selic Copom Banco Central", "dólar real câmbio", "política fiscal governo ministro da Fazenda", "fundos imobiliários FIIs", "Tesouro Direto juros futuros", "inflação IPCA Brasil", "Petrobras Vale Itaú ações"];
const GQ_WORLD = ["Federal Reserve juros Estados Unidos", "Wall Street bolsas mundiais", "petróleo Brent Oriente Médio", "China economia", "mercados globais emergentes"];
const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:2d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
const EXTRA_ALIAS = { MGLU3: ["magalu"], BPAC11: ["btg"], BBAS3: ["banco do brasil"], B3SA3: ["b3"], SANB11: ["santander brasil"], VIVT3: ["vivo"], RADL3: ["raiadrogasil", "raia drogasil"], WEGE3: ["weg"], ABEV3: ["ambev"], PETR4: ["petrobras"], VALE3: ["vale"] };
function mentions(title, syms) {
  const out = [];
  for (const u of syms) {
    const names = [u.sym.toLowerCase(), u.name.toLowerCase(), ...(EXTRA_ALIAS[u.sym] || [])];
    if (names.some((n) => new RegExp(`(?<![\\p{L}\\d])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "iu").test(title))) out.push(u.sym);
  }
  return out;
}
async function news(assets) {
  let all = [];
  const GENERIC = ["Investing.com", "G1 Economia", "Folha Mercado", "Agência Brasil", "Exame"];
  const RELEV = /ibovespa|bolsa|\bb3\b|d[óo]lar|juros|selic|copom|infla[çc][ãa]o|ipca|fiscal|tesouro|\bfiis?\b|fundos imobili|a[çc][õo]es brasil|petrobras|\bvale\b|ita[úu]|bradesco|banco central|ministro da fazenda|haddad|arcabou[çc]o|d[ií]vida p[úu]blica|\bpib\b|mercado financeiro|dividendos|\bbc\b|infla|c[âa]mbio/i;
  for (const [n, u] of BR_FEEDS) {
    (await rss(u, n)).filter((x) => !GENERIC.includes(n) || RELEV.test(x.title) || mentions(x.title, UNIVERSE).length).forEach((x) => all.push({ ...x, cat: "br" }));
    await sleep(150);
  }
  for (const q of GQ_BR) { (await rss(gnews(q), "Google")).forEach((x) => all.push({ ...x, cat: "br" })); await sleep(250); }
  for (const q of GQ_WORLD) { (await rss(gnews(q), "Google")).forEach((x) => all.push({ ...x, cat: "mundo" })); await sleep(250); }
  const decorate = (n) => {
    const t = n.title.toLowerCase();
    const pos = POS.filter((w) => t.includes(w)).length, neg = NEG.filter((w) => t.includes(w)).length;
    return { ...n, tone: pos > neg ? "pos" : neg > pos ? "neg" : "neu", key: KEY.some((w) => t.includes(w)), syms: mentions(n.title, UNIVERSE) };
  };
  const seen = new Set(), out = [];
  for (const n of all.sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const k = n.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(decorate(n));
  }
  const fresh = out.filter((n) => Date.now() - new Date(n.date) < 72 * 3600e3);
  const items = [...fresh.filter((n) => n.cat === "br").slice(0, 60), ...fresh.filter((n) => n.cat === "mundo").slice(0, 20)].sort((a, b) => (a.date < b.date ? 1 : -1));
  // notícias por ativo (para a tela de cada ação)
  const byAsset = {};
  const focus = [...assets].sort((a, b) => b.score - a.score).slice(0, 14);
  for (const a of focus) {
    const its = (await rss(gnews(`"${a.name}" ${a.sym}`), "Google")).filter((x) => Date.now() - new Date(x.date) < 7 * 86400e3).slice(0, 6).map(decorate);
    if (its.length) byAsset[a.sym] = its.map(({ title, link, date, source, tone }) => ({ title, link, date, source, tone }));
    await sleep(250);
  }
  for (const n of items) for (const s of n.syms) { byAsset[s] = byAsset[s] || []; if (byAsset[s].length < 8 && !byAsset[s].some((x) => x.title === n.title)) byAsset[s].push({ title: n.title, link: n.link, date: n.date, source: n.source, tone: n.tone }); }
  const p = items.filter((n) => n.tone === "pos").length, g = items.filter((n) => n.tone === "neg").length;
  return { items, byAsset, mood: items.length ? +((p - g) / (p + g + 1)).toFixed(2) : 0 };
}
async function newsOld() {
  const qs = ["Ibovespa", "Selic Copom", "dólar hoje real", "política fiscal governo Haddad ministro da Fazenda", "Tesouro Direto juros"];
  let all = [];
  for (const q of qs) {
    all = all.concat(await rss(`https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:2d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, "Google"));
    await sleep(300);
  }
  all = all.concat(await rss("https://www.infomoney.com.br/feed/", "InfoMoney"));
  const seen = new Set(), out = [];
  for (const n of all.sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const k = n.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seen.has(k)) continue;
    seen.add(k);
    const t = n.title.toLowerCase();
    const pos = POS.filter((w) => t.includes(w)).length, neg = NEG.filter((w) => t.includes(w)).length;
    out.push({ ...n, tone: pos > neg ? "pos" : neg > pos ? "neg" : "neu", key: KEY.some((w) => t.includes(w)) });
  }
  const recent = out.filter((n) => Date.now() - new Date(n.date) < 72 * 3600e3).slice(0, 30);
  const p = recent.filter((n) => n.tone === "pos").length, g = recent.filter((n) => n.tone === "neg").length;
  return { items: recent, mood: recent.length ? +((p - g) / (p + g + 1)).toFixed(2) : 0 };
}

// ------------------------------------------------------------------ notificação (ntfy)
async function ntfy(topic, msg) {
  const r = await fetch("https://ntfy.sh", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ topic, ...msg }),
  });
  if (!r.ok) throw new Error("ntfy HTTP " + r.status);
}

// ------------------------------------------------------------------ Focus (Banco Central), Tesouro Direto (Tesouro Transparente) e FIIs (informe mensal da CVM)
async function focus() {
  const out = {};
  for (const [k, ind] of [["selic", "Selic"], ["ipca", "IPCA"], ["pib", "PIB Total"], ["cambio", "Câmbio"]]) {
    try {
      const j = await get(`https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=12&$filter=${encodeURIComponent(`Indicador eq '${ind}'`)}&$orderby=Data%20desc&$format=json`, 2);
      const rows = j.value || [], date = rows[0]?.Data;
      out[k] = {}; rows.filter((r) => r.Data === date).forEach((r) => { out[k][r.DataReferencia] = +r.Mediana; });
      out.data = date;
    } catch (e) { log("focus falhou", k, e.message); }
  }
  return out;
}
async function tesouro() {
  const txt = await get("https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv", 2, true);
  const num = (x) => parseFloat(String(x).replace(",", "."));
  const key = (d) => { const [dd, mm, yy] = d.split("/"); return yy + mm + dd; };
  const rows = txt.split(/\r?\n/).slice(1).map((l) => l.split(";")).filter((p) => p.length > 5);
  let last = "";
  for (const p of rows) { const k = key(p[2]); if (k > last) last = k; }
  const WANT = ["Tesouro Selic", "Tesouro IPCA+", "Tesouro IPCA+ com Juros Semestrais", "Tesouro Prefixado", "Tesouro Prefixado com Juros Semestrais"];
  const iso = (k) => k.replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3");
  const itens = rows.filter((p) => key(p[2]) === last && WANT.includes(p[0])).map((p) => ({ tipo: p[0], venc: iso(key(p[1])), compra: num(p[3]), venda: num(p[4]), pu: num(p[5]) })).sort((a, b) => (a.tipo + a.venc < b.tipo + b.venc ? -1 : 1));
  return { data: iso(last), itens };
}
function unzip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nl);
    const ds = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28), data = buf.subarray(ds, ds + csize);
    out[name] = method === 0 ? data : zlib.inflateRawSync(data); p += 46 + nl + xl + cl;
  }
  return out;
}
async function cvmFii() {
  const year = nowBRT().getUTCFullYear();
  const r = await fetch(`https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_${year}.zip`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("CVM HTTP " + r.status);
  const z = unzip(Buffer.from(await r.arrayBuffer()));
  const parse = (name) => { const f = Object.keys(z).find((k) => k.includes(name)); const lines = z[f].toString("latin1").split(/\r?\n/).filter(Boolean); const h = lines[0].split(";"); return lines.slice(1).map((l) => { const p = l.split(";"), o = {}; h.forEach((k, i) => (o[k] = p[i])); return o; }); };
  const geral = parse("geral"), comp = parse("complemento");
  const isin = {}; for (const g of geral) { const c = g.CNPJ_Fundo_Classe; if (!isin[c] || g.Data_Referencia >= isin[c].d) isin[c] = { d: g.Data_Referencia, v: g.Codigo_ISIN }; }
  const latest = {}; for (const c of comp) { const k = c.CNPJ_Fundo_Classe, prev = latest[k]; if (!prev || c.Data_Referencia > prev.Data_Referencia || (c.Data_Referencia === prev.Data_Referencia && +c.Versao > +prev.Versao)) latest[k] = c; }
  const out = {};
  for (const u of UNIVERSE.filter((x) => x.type === "fii")) {
    const pre = "BR" + u.sym.slice(0, 4);
    const cnpj = Object.keys(isin).filter((k) => isin[k].v?.startsWith(pre) && latest[k]).sort((a, b) => (+latest[b].Total_Numero_Cotistas - +latest[a].Total_Numero_Cotistas))[0];
    if (!cnpj) continue;
    const c = latest[cnpj], vp = parseFloat(c.Valor_Patrimonial_Cotas);
    if (vp > 0) out[u.sym] = { vp, pl: parseFloat(c.Patrimonio_Liquido), cotistas: +c.Total_Numero_Cotistas, dyMes: parseFloat(c.Percentual_Dividend_Yield_Mes) * 100, ref: c.Data_Referencia };
  }
  return out;
}
const tesRef = (t) => { const pick = (tipo, year) => t.itens.filter((i) => i.tipo === tipo && i.venc.startsWith(year))[0]; const i32 = pick("Tesouro IPCA+", "2032") || pick("Tesouro IPCA+", "2035"); const sel = t.itens.filter((i) => i.tipo === "Tesouro Selic")[0]; return { data: t.data, ipca2032: i32?.compra ?? null, ipcaVenc: i32?.venc ?? null, selicSpread: sel?.compra ?? null }; };

// ------------------------------------------------------------------ principal
async function main() {
  await fs.mkdir(path.join(OUT, "series"), { recursive: true });
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  let state = { notified: {}, regime: "", digestDate: "" };
  try { state = { ...state, ...JSON.parse(await fs.readFile(STATE_FILE, "utf8")) }; } catch {}

  // contexto
  const ctx = {};
  for (const c of CONTEXT) {
    try {
      const ch = await chart(c.yahoo);
      const a = analyze({ type: "ctx", core: false }, ch);
      if (a) ctx[c.key] = { name: c.name, p: a.p, d1: a.d1, d5: a.d5, dd: a.dd };
      await fs.writeFile(path.join(OUT, "series", c.key + ".json"), JSON.stringify({ t: ch.dates, c: ch.close }));
      await writeIntra(c.yahoo, c.key);
    } catch (e) { log("contexto falhou", c.key, e.message); }
    await sleep(250);
  }
  const regime = regimeOf(ctx.ibov);

  const fx = await cvmFii().catch((e) => { log("CVM falhou:", e.message); return {}; });
  const focusD = await focus().catch(() => ({}));
  const tes = await tesouro().catch((e) => { log("Tesouro falhou:", e.message); return null; });
  log("P/VP oficial para", Object.keys(fx).length, "FIIs | Tesouro:", tes ? tes.data : "indisponível");
  // ativos
  const assets = [];
  const spark = {};
  for (const u of UNIVERSE) {
    try {
      const ch = await chart(toYahoo(u));
      const a = analyze(u, ch);
      if (!a) continue;
      const f = fx[u.sym] && a.p / fx[u.sym].vp > 0.4 && a.p / fx[u.sym].vp < 2.5 ? fx[u.sym] : null; if (f) { a.pvp = a.p / f.vp; a.vp = f.vp; }
      const cl = classify(u, a, regime);
      const yr = Date.now() / 1000 - 365 * 86400;
      const dy = a.p ? ch.divs.filter((d) => d.t >= yr).reduce((s, d) => s + d.a, 0) / a.p : 0;
      const lastDivs = ch.divs.slice(-6).map((d) => ({ d: new Date(d.t * 1000).toISOString().slice(0, 10), a: +d.a.toFixed(4) }));
      assets.push({ sym: u.sym, name: u.name, type: u.type, core: u.core, sector: u.sector, ...round(a), ...cl, dy: +dy.toFixed(4), divs: lastDivs, pvp: a.pvp != null ? +a.pvp.toFixed(3) : null, vp: a.vp != null ? +a.vp.toFixed(3) : null, cotistas: f?.cotistas ?? null, dyMes: f?.dyMes != null ? +f.dyMes.toFixed(2) : null, refCvm: f?.ref ?? null });
      spark[u.sym] = ch.close.slice(-60);
      await fs.writeFile(path.join(OUT, "series", u.sym + ".json"), JSON.stringify({ t: ch.dates, c: ch.close }));
      await writeIntra(toYahoo(u), u.sym);
    } catch (e) { log("ativo falhou", u.sym, e.message); }
    await sleep(250);
  }
  log("ativos ok:", assets.length, "de", UNIVERSE.length);

  // macro
  const [selic, cdi, usd, ipca] = await Promise.all([bcb(432), bcb(4389), bcb(1), bcb(433, 12)]);
  let ipca12 = null;
  if (ipca && ipca.length === 12) ipca12 = +((ipca.reduce((a, x) => a * (1 + x.v / 100), 1) - 1) * 100).toFixed(2);
  const macro = {
    selic: selic?.at(-1)?.v ?? null, cdi: cdi?.at(-1)?.v ?? null, usd_ptax: usd?.at(-1)?.v ?? null, ipca12,
    data: selic?.at(-1)?.d ?? null,
  };

  // séries do Banco Central para os gráficos do panorama (Selic, CDI, IPCA em 12 meses)
  for (const [key, code] of [["selic", 432], ["cdi", 4389], ["ipca12", 13522]]) {
    try {
      const d0 = new Date(Date.now() - 5 * 365.25 * 864e5), f = `${String(d0.getUTCDate()).padStart(2, "0")}/${String(d0.getUTCMonth() + 1).padStart(2, "0")}/${d0.getUTCFullYear()}`;
      const j = await get(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${f}`, 2);
      const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), jj = j.filter((x) => x.data.split("/").reverse().join("-") <= hoje), s = { t: jj.map((x) => x.data.split("/").reverse().join("-")), c: jj.map((x) => parseFloat(x.valor)) };
      if (s.c.length > 1) await fs.writeFile(path.join(OUT, "series", key + ".json"), JSON.stringify(s));
    } catch (e) { log("série macro falhou", key, e.message); }
  }
  macro.focus = focusD; macro.tesouro = tes ? tesRef(tes) : null;
  const nw = await news(assets);
  const byD1 = [...assets].sort((x, y) => y.d1 - x.d1);
  const summary = {
    updated: new Date().toISOString(),
    regime, macro, context: ctx,
    gainers: byD1.slice(0, 6).map(slim),
    losers: byD1.slice(-6).reverse().map(slim),
    offers: assets.filter((x) => x.label === "oferta").sort((a, b) => b.score - a.score).slice(0, 8).map(slim),
    waiting: assets.filter((x) => x.label === "aguardar").sort((a, b) => b.score - a.score).slice(0, 8).map(slim),
    watch: assets.filter((x) => x.label === "observar").sort((a, b) => b.score - a.score).slice(0, 8).map(slim),
    stretched: assets.filter((x) => x.label === "esticada").sort((a, b) => b.rsi - a.rsi).slice(0, 8).map(slim),
    avoid: assets.filter((x) => x.label === "evitar").slice(0, 6).map(slim),
    newsMood: nw.mood,
  };
  await fs.writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary));
  if (tes) await fs.writeFile(path.join(OUT, "tesouro.json"), JSON.stringify(tes));
  await fs.writeFile(path.join(OUT, "assets.json"), JSON.stringify(assets));
  await fs.writeFile(path.join(OUT, "news.json"), JSON.stringify({ updated: summary.updated, mood: nw.mood, items: nw.items.map(({ title, link, date, source, tone, key, cat, syms }) => ({ title, link, date, source, tone, key, cat, syms })), byAsset: nw.byAsset }));
  // versão leve das notícias (o app abre mais rápido e gasta menos dados) e notícias por ativo em arquivos pequenos
  const slimNews = ({ title, link, date, source, tone, key, cat, syms }) => ({ title, link, date, source, tone, key, cat, syms });
  await fs.writeFile(path.join(OUT, "news-top.json"), JSON.stringify({ updated: summary.updated, mood: nw.mood, items: nw.items.slice(0, 14).map(slimNews) }));
  await fs.mkdir(path.join(OUT, "news"), { recursive: true });
  for (const [sym, items] of Object.entries(nw.byAsset || {})) await fs.writeFile(path.join(OUT, "news", sym + ".json"), JSON.stringify(items.slice(0, 6)));
  await fs.writeFile(path.join(OUT, "spark.json"), JSON.stringify(spark));

  // notificações
  const topic = process.env.NTFY_TOPIC;
  const app = process.env.APP_URL || "";
  const hr = nowBRT().getUTCHours();
  const quiet = hr >= 22 || hr < 7;
  const today = nowBRT().toISOString().slice(0, 10);
  const todo = [];
  if (state.regime && state.regime !== regime.level && (regime.level === "estresse" || state.regime === "estresse")) {
    const ib = typeof ctx !== "undefined" ? ctx?.ibov?.d1 : null, ibTxt = ib != null ? `Ibovespa ${ib >= 0 ? "+" : ""}${(ib * 100).toFixed(1).replace(".", ",")}%. ` : "";
    todo.push({ sfx: "-mercado", key: `regime-${regime.level}-${today}`, title: regime.level === "estresse" ? "Mercado em estresse" : "Mercado acalmou", message: regime.level === "estresse" ? `${ibTxt}Ofertas em espera.` : "Ofertas voltam a valer.", priority: regime.level === "estresse" ? 4 : 3, tags: ["warning"], urgent: true });
  }
  for (const o of summary.offers) {
    const last = state.notified[`oferta-${o.sym}`];
    if (last && Date.now() - new Date(last) < 7 * 86400e3) continue;
    todo.push({ key: `oferta-${o.sym}`, title: `Oferta: ${o.sym}`, message: `R$ ${o.p.toFixed(2).replace(".", ",")} · ${Math.abs(o.dd * 100).toFixed(0)}% abaixo da máxima · nota ${o.score}/100`, priority: 4, tags: ["chart_with_downwards_trend", "moneybag"], click: app ? `${app}#/ativo/${o.sym}` : undefined });
  }
  for (const n of nw.items.filter((x) => x.key && /circuit breaker|copom|ministro da fazenda|rebaixa|rebaixamento/i.test(x.title)).slice(0, 2)) {
    const k = "news-" + n.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    if (Date.now() - new Date(n.date) > 6 * 3600e3 || state.notified[k]) continue;
    todo.push({ sfx: "-mercado", key: k, title: "Notícia importante", message: `${n.title.length > 90 ? n.title.slice(0, 87) + "…" : n.title} (${n.source})`, priority: 3, tags: ["newspaper"], click: n.link });
  }
  let sent = 0;
  for (const m of todo) {
    if (sent >= 3) break;
    if (quiet && !m.urgent) continue;
    if (!topic || process.env.NO_NOTIFY === "1") { log("[sem envio]", m.title, "-", m.message); continue; }
    try {
      await ntfy(topic + (m.sfx || ""), { title: m.title, message: m.message, priority: m.priority, tags: m.tags, click: m.click });
      state.notified[m.key] = new Date().toISOString();
      sent++;
      log("enviado:", m.title);
    } catch (e) { log("ntfy falhou:", e.message); }
  }
  state.regime = regime.level;
  for (const k of Object.keys(state.notified)) if (Date.now() - new Date(state.notified[k]) > 30 * 86400e3) delete state.notified[k];

  // resumo diário com IA (opcional; só roda se existir chave e só 1 vez por dia, depois das 18h BRT)
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && hr >= 18 && hr < 22 && state.digestDate !== today) {
    try {
      const ctxTxt = JSON.stringify({ regime, macro, ibov: ctx.ibov, usd: ctx.usd, gainers: summary.gainers.slice(0, 3), losers: summary.losers.slice(0, 3), ofertas: summary.offers.map((o) => o.sym), manchetes: nw.items.slice(0, 8).map((n) => n.title) });
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.CLAUDE_MODEL || "claude-haiku-4-5", max_tokens: 500,
          messages: [{ role: "user", content: `Você é o Alfred, mordomo discreto de um investidor brasileiro de perfil seguro e longo prazo. Com os dados abaixo, escreva em português, em 5 linhas curtas, o resumo do dia, o que mudou e uma cautela. Não dê ordem de compra ou venda e não invente números.\n${ctxTxt}` }],
        }),
      });
      const j = await r.json();
      const text = j.content?.[0]?.text;
      if (text) { await fs.writeFile(path.join(OUT, "digest.json"), JSON.stringify({ date: today, text })); state.digestDate = today; }
    } catch (e) { log("resumo IA falhou:", e.message); }
  }

  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 1));
  log("fim. regime:", regime.level, "| ofertas:", summary.offers.length, "| aguardando:", summary.waiting.length, "| notícias:", nw.items.length);
}

const r2 = (x, d = 4) => (x == null ? null : +x.toFixed(d));
function round(a) {
  return { p: r2(a.p, 2), d1: r2(a.d1), d5: r2(a.d5), d21: r2(a.d21), hi: r2(a.hi, 2), lo: r2(a.lo, 2), dd: r2(a.dd), s50: r2(a.s50, 2), s200: r2(a.s200, 2), rel200: r2(a.rel200), rsi: r2(a.rsi, 1), vol: r2(a.vol) };
}
function slim(x) { return { sym: x.sym, name: x.name, type: x.type, core: x.core, p: x.p, d1: x.d1, dd: x.dd, rsi: x.rsi, score: x.score, label: x.label, why: x.why, dy: x.dy }; }

main().catch((e) => { console.error(e); process.exit(1); });
