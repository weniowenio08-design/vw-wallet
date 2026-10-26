// VW Wallet Investments: app minimalista. Dados vêm de data/*.json (gerados pelo cérebro na nuvem).
// Tudo que o usuário digita (patrimônio, metas, favoritos, alertas) fica SÓ neste aparelho (localStorage).
import { makeExtras } from "./extras.js";
import { makeDados } from "./dados.js";
const $ = (s, el = document) => el.querySelector(s);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem("vw:" + k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("vw:" + k, JSON.stringify(v)); } catch {} },
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fN = (n, d = 2) => (n == null || isNaN(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fBRL = (n) => (n == null || isNaN(n) ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (x, d = 1) => (x == null ? "—" : (x >= 0 ? "+" : "") + fN(x * 100, d) + "%");
const cl = (x) => (x >= 0 ? "up" : "down");
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
// Lê número digitado com vírgula OU ponto como decimal: "803,38", "803.38", "1.234,56", "1,234.56". "1.000" (três casas depois do ponto) é lido como mil, como no Brasil.
const num = (s) => {
  let t = String(s ?? "").replace(/R\$|\s/g, ""); if (!t) return null;
  const hasC = t.includes(","), hasD = t.includes(".");
  if (hasC && hasD) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (hasC) t = t.split(",").length > 2 ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (hasD) { const p = t.split("."); if (p.length > 2 || (p[1].length === 3 && p[0] !== "0" && p[0] !== "")) t = p.join(""); }
  const v = parseFloat(t); return isNaN(v) ? null : v;
};
const nrm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const two = (n) => String(n).padStart(2, "0");
const brt = (unix) => new Date((unix - 3 * 3600) * 1000);
const todayBRT = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

// ------------------------------------------------------------------ ícones (mesmo traço da logo: linha fina arredondada)
const IC = {
  home: "M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5",
  chart: "M4 19V5M4 19h16M8 15l4-5 3 3 5-7",
  news: "M5 5h11v14H7a2 2 0 01-2-2zM16 9h3v8a2 2 0 01-2 2M8 9h5M8 12h5M8 15h3",
  wallet: "M4 7a2 2 0 012-2h11v3M4 7v10a2 2 0 002 2h13a1 1 0 001-1V9a1 1 0 00-1-1H6a2 2 0 01-2-1zM16 13.5h2",
  grid: "M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z",
  bell: "M6 16v-5a6 6 0 1112 0v5l1.5 2h-15zM10 20a2 2 0 004 0",
  filter: "M4 6h16M7 12h10M10 18h4",
  calendar: "M5 6h14v13H5zM5 10h14M9 4v4M15 4v4",
  share: "M12 15V4M8 8l4-4 4 4M5 13v6h14v-6",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  back: "M15 5l-7 7 7 7",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0",
  target: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 12h.01",
  check: "M5 12l5 5 9-10",
  book: "M5 5h6a2 2 0 012 2v12a2 2 0 00-2-2H5zM19 5h-6a2 2 0 00-2 2v12a2 2 0 012-2h6z",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z",
  down: "M7 5v12M3 13l4 4 4-4M17 19V7M13 11l4-4 4 4",
};
const ic = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n]}"/></svg>`;
const icFill = (n) => `<svg class="ic fill" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n]}"/></svg>`;

const CLS = [["selic", "Tesouro Selic"], ["ipca", "Tesouro IPCA+"], ["cdb", "CDB / LCI / LCA"], ["fii", "Fundos imobiliários"], ["acao", "Ações"], ["ext", "Exterior"]];
const DEF_T = { selic: 45, ipca: 26, cdb: 0, fii: 12, acao: 7, ext: 10 };
const RISK = ["fii", "acao", "ext"];
const REGIME = {
  estresse: { t: "Mercado em estresse", p: "Estresse", d: "As ofertas ficam em espera até o mercado estabilizar: o Alfred prefere perder uma oportunidade a comprar uma faca caindo." },
  tensao: { t: "Mercado tenso", p: "Tenso", d: "Cautela: só ofertas fortes e em parcelas pequenas." },
  calmo: { t: "Mercado calmo", p: "Calmo", d: "Sem estresse: ofertas de qualidade podem ser avaliadas." },
};
const AGENDA = [
  ["2026-10-28", "Fed decide os juros dos EUA"], ["2026-10-28", "Petrobras: dados operacionais · Santander: balanço"], ["2026-11-03", "Eleições de meio de mandato nos EUA"],
  ["2026-11-04", "Copom decide a Selic · Itaú: balanço do 3T26 (03 ou 04/11)"], ["2026-11-11", "Banco do Brasil: balanço"], ["2026-11-23", "Petrobras: plano estratégico 2027-31"],
];

let D = { summary: null, assets: [], news: null, backtest: null, digest: null, spark: {} };
const seriesCache = {}, intraCache = {};

// "no-cache": o navegador pergunta ao servidor se mudou (resposta 304, quase sem bytes) em vez de baixar tudo de novo
async function j(p) { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p); return r.json(); }
async function ensureNews() { if (D.news?.byAsset) return; try { const n = await j("data/news.json"); D.newsFull = n; D.news = n; } catch {} } // lista completa só quando a aba Notícias é aberta
const assetNewsOf = async (sym) => { if (D.news?.byAsset?.[sym]) return D.news.byAsset[sym]; try { return await j(`data/news/${sym}.json`); } catch { return []; } };
async function load(force) {
  // consulta leve primeiro: se o resumo não mudou desde a última vez, não baixa mais nada (economiza bateria e dados)
  const summary = await j("data/summary.json");
  if (!force && D.loaded && D.summary.updated === summary.updated) return false;
  const [assets, news, spark] = await Promise.all([j("data/assets.json"), j("data/news-top.json").catch(() => j("data/news.json")), j("data/spark.json").catch(() => ({}))]);
  const changed = !D.summary || D.summary.updated !== summary.updated;
  D.summary = summary; D.assets = assets; D.news = D.newsFull?.updated === news.updated ? D.newsFull : news; D.spark = spark;
  try { D.backtest = await j("data/backtest.json"); } catch {}
  try { D.digest = await j("data/digest.json"); } catch {}
  try { D.tesouro = await j("data/tesouro.json"); } catch {}
  store.set("snap", { summary, assets, spark, news: { updated: D.news.updated, mood: D.news.mood, items: D.news.items.slice(0, 14) } });
  D.loaded = true;
  return changed;
}
function restoreSnap() { const s = store.get("snap", null); if (s?.summary) { D.summary = s.summary; D.assets = s.assets; D.news = s.news; D.spark = s.spark || {}; return true; } return false; }
const series = async (sym) => { if (!(sym in seriesCache)) { try { seriesCache[sym] = await j(`data/series/${sym}.json`); } catch { seriesCache[sym] = null; } } return seriesCache[sym]; };
const intraOf = async (sym) => { if (!(sym in intraCache)) { try { intraCache[sym] = await j(`data/series/${sym}.i.json`); } catch { intraCache[sym] = null; } } return intraCache[sym]; };
const asset = (sym) => D.assets.find((a) => a.sym === sym);
// posição = { id, cls, sym, plat, value (valor investido), bp (preço pago por cota), q (quantidade) }. Com q e bp o valor atual acompanha o preço do ativo.
const priceOf = (sym) => (sym === "USD" ? D.summary?.context?.usd?.p : asset(sym)?.p); // "USD" = dólar comprado como moeda
const curVal = (p) => { const px = p.sym && p.q ? priceOf(p.sym) : null; return px ? p.q * px : p.value; };
// aporte: valor base mensal (R$ 1.000) e exceções por mês. Outubro/2026 foi combinado em R$ 1.500; em novembro volta sozinho ao valor base.
const AP_PLANO = { "2026-10": 1500 };
const aporteBase = () => store.get("aporte", 1000);
const aporteMes = () => { const k = todayBRT().slice(0, 7); return store.get("aporteMes", {})[k] ?? AP_PLANO[k] ?? aporteBase(); };
const setAporteMes = (v) => { const k = todayBRT().slice(0, 7), o = store.get("aporteMes", {}); o[k] = v; store.set("aporteMes", o); };
const posLive = () => store.get("posicoes", []).map((p) => ({ ...p, inv: p.value, value: curVal(p) }));

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600); }

// ------------------------------------------------------------------ favoritos e alertas de preço
const favs = () => new Set(store.get("fav", []));
function toggleFav(sym) { const s = favs(); s.has(sym) ? s.delete(sym) : s.add(sym); store.set("fav", [...s]); }
const alerts = () => store.get("alertas", []);
async function checkAlerts() {
  const al = alerts(); let ch = false;
  for (const a of al) {
    if (a.done) continue; const x = asset(a.sym); if (!x) continue;
    if ((a.dir === "acima" && x.p >= a.price) || (a.dir === "abaixo" && x.p <= a.price)) {
      a.done = true; ch = true;
      const body = `${a.sym}: R$ ${fN(x.p)} (alvo ${a.dir} de R$ ${fN(a.price)}).`;
      toast("🔔 " + body);
      try { if (Notification?.permission === "granted") (await navigator.serviceWorker.getRegistration())?.showNotification("Alerta: " + a.sym, { body, icon: "icons/icon-192.png", tag: "alert-" + a.sym }); } catch {}
    }
  }
  if (ch) store.set("alertas", al);
}

// ------------------------------------------------------------------ plataformas (busca com sugestão)
const ALL = ["selic", "ipca", "cdb", "fii", "acao", "ext"], BRC = ["selic", "ipca", "cdb", "fii", "acao"], TES = ["selic", "ipca"], RF = ["selic", "ipca", "cdb"], CDBO = ["cdb"], NOCL = [];
// kind: Corretora, Banco, Fintech, Exterior, Cripto. "caps" = o que costuma ser possível comprar lá (pode variar: confirme no app).
const PLATS = [
  // corretoras
  { n: "XP Investimentos", k: "Corretora", a: ["xp", "xpi", "xp inc", "banco xp"], caps: BRC }, { n: "Rico", k: "Corretora", a: ["rico"], caps: BRC },
  { n: "Clear", k: "Corretora", a: ["clear"], caps: ["selic", "ipca", "fii", "acao"] }, { n: "NuInvest / Nubank", k: "Fintech", a: ["nu", "nubank", "nuinvest", "nu invest", "easynvest", "roxinho"], caps: BRC },
  { n: "BTG Pactual", k: "Banco", a: ["btg", "btg pactual", "banco btg"], caps: ALL }, { n: "Modalmais", k: "Corretora", a: ["modal", "modalmais", "modal mais"], caps: BRC },
  { n: "Genial Investimentos", k: "Corretora", a: ["genial", "banco genial"], caps: BRC }, { n: "Toro Investimentos", k: "Corretora", a: ["toro", "toro investimentos"], caps: BRC },
  { n: "Warren", k: "Corretora", a: ["warren"], caps: ["selic", "ipca", "cdb", "fii"] }, { n: "Órama", k: "Corretora", a: ["orama"], caps: BRC },
  { n: "Ativa Investimentos", k: "Corretora", a: ["ativa"], caps: BRC }, { n: "Necton", k: "Corretora", a: ["necton"], caps: BRC }, { n: "Vitreo", k: "Corretora", a: ["vitreo"], caps: ["selic", "ipca", "cdb", "fii"] },
  { n: "Guide Investimentos", k: "Corretora", a: ["guide"], caps: BRC }, { n: "Mirae Asset", k: "Corretora", a: ["mirae"], caps: BRC }, { n: "Terra Investimentos", k: "Corretora", a: ["terra"], caps: BRC },
  { n: "Planner", k: "Corretora", a: ["planner"], caps: BRC }, { n: "Ágora Investimentos", k: "Corretora", a: ["agora"], caps: BRC }, { n: "Itaú Corretora / Íon", k: "Corretora", a: ["ion", "itau corretora", "itau"], caps: BRC },
  { n: "Safra Corretora", k: "Corretora", a: ["safra"], caps: BRC }, { n: "Magnetis", k: "Corretora", a: ["magnetis"], caps: ["selic", "ipca", "cdb", "fii"] }, { n: "Kinvo (acompanhamento)", k: "Corretora", a: ["kinvo"], caps: NOCL },
  // bancos
  { n: "Itaú", k: "Banco", a: ["itau", "itaú"], caps: BRC }, { n: "Bradesco", k: "Banco", a: ["bradesco", "next"], caps: BRC }, { n: "Santander", k: "Banco", a: ["santander"], caps: BRC },
  { n: "Banco do Brasil", k: "Banco", a: ["bb", "banco do brasil"], caps: BRC }, { n: "Caixa Econômica Federal", k: "Banco", a: ["caixa", "cef"], caps: RF }, { n: "Inter", k: "Banco", a: ["inter", "banco inter", "inter global"], caps: ALL },
  { n: "C6 Bank", k: "Banco", a: ["c6", "c6 bank"], caps: ALL }, { n: "Banrisul", k: "Banco", a: ["banrisul"], caps: BRC }, { n: "BRB", k: "Banco", a: ["brb"], caps: RF }, { n: "Banco Pan", k: "Banco", a: ["pan", "banco pan"], caps: CDBO },
  { n: "Neon", k: "Fintech", a: ["neon"], caps: CDBO }, { n: "Original", k: "Banco", a: ["original", "banco original"], caps: CDBO }, { n: "Agibank", k: "Banco", a: ["agi", "agibank"], caps: CDBO },
  { n: "BS2", k: "Banco", a: ["bs2"], caps: CDBO }, { n: "Daycoval", k: "Banco", a: ["daycoval"], caps: CDBO }, { n: "BV (Votorantim)", k: "Banco", a: ["bv", "votorantim"], caps: CDBO },
  { n: "Safra", k: "Banco", a: ["safra"], caps: BRC }, { n: "Sofisa Direto", k: "Banco", a: ["sofisa"], caps: CDBO }, { n: "Sicredi", k: "Banco", a: ["sicredi"], caps: CDBO }, { n: "Sicoob", k: "Banco", a: ["sicoob"], caps: CDBO },
  { n: "Will Bank", k: "Fintech", a: ["will"], caps: CDBO }, { n: "PagBank", k: "Fintech", a: ["pagbank", "pagseguro"], caps: CDBO }, { n: "Mercado Pago", k: "Fintech", a: ["mercado pago", "mp"], caps: ["cdb", "selic"] },
  { n: "PicPay", k: "Fintech", a: ["picpay"], caps: ["cdb", "selic", "acao"] }, { n: "Nubank (conta e Caixinhas)", k: "Fintech", a: ["nu", "nubank", "roxinho"], caps: ["cdb", "selic"] },
  // exterior
  { n: "Revolut", k: "Exterior", a: ["revolut", "revo"], caps: ["ext"] }, { n: "Avenue", k: "Exterior", a: ["avenue"], caps: ["ext"] }, { n: "Nomad", k: "Exterior", a: ["nomad"], caps: ["ext"] },
  { n: "Interactive Brokers", k: "Exterior", a: ["ibkr", "interactive", "interactive brokers"], caps: ["ext"] }, { n: "Wise", k: "Exterior", a: ["wise"], caps: NOCL }, { n: "Tesouro Direto (site oficial)", k: "Corretora", a: ["tesouro direto", "tesouro"], caps: TES },
  // cripto
  { n: "Mercado Bitcoin", k: "Cripto", a: ["mercado bitcoin", "mb"], caps: NOCL }, { n: "Binance", k: "Cripto", a: ["binance"], caps: NOCL }, { n: "Foxbit", k: "Cripto", a: ["foxbit"], caps: NOCL }, { n: "Coinbase", k: "Cripto", a: ["coinbase"], caps: NOCL },
];
function findPlats(q, limit = 7) {
  const t = nrm(q);
  const seen = new Set(), uniq = PLATS.filter((p) => (seen.has(p.n) ? false : seen.add(p.n)));
  if (!t) return uniq.slice(0, limit);
  const sc = uniq.map((p) => { let s = 0; for (const x of [p.n, ...p.a, p.k].map(nrm)) { if (x === t) s = Math.max(s, 100); else if (x.startsWith(t)) s = Math.max(s, 80 - x.length * 0.1); else if (x.split(" ").some((w) => w.startsWith(t))) s = Math.max(s, 60); else if (x.includes(t) && t.length >= 3) s = Math.max(s, 30); } return [p, s]; });
  return sc.filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[0].n.length - b[0].n.length).slice(0, limit).map(([p]) => p);
}
// campo com sugestões enquanto digita; se o nome não existir na lista, oferece "usar o que você digitou" (serve para qualquer banco ou plataforma)
function suggestBox(inputEl, onPick) {
  const box = document.createElement("div"); box.className = "sug"; inputEl.parentNode.style.position = "relative"; inputEl.parentNode.appendChild(box);
  const show = () => {
    const m = findPlats(inputEl.value), typed = inputEl.value.trim(), exact = m.some((p) => nrm(p.n) === nrm(typed));
    box.innerHTML = m.map((p) => `<button type="button" data-p="${esc(p.n)}"><b>${esc(p.n)}</b><small>${esc(p.k)}</small></button>`).join("") + (typed && !exact ? `<button type="button" data-p="${esc(typed)}" class="own"><b>Usar “${esc(typed)}”</b><small>outra plataforma</small></button>` : "");
    box.style.display = box.innerHTML ? "block" : "none";
  };
  inputEl.addEventListener("input", show); inputEl.addEventListener("focus", show);
  box.addEventListener("pointerdown", (e) => { const b = e.target.closest("button"); if (!b) return; e.preventDefault(); inputEl.value = b.dataset.p; box.style.display = "none"; onPick?.(b.dataset.p); });
  inputEl.addEventListener("blur", () => setTimeout(() => (box.style.display = "none"), 120));
}
const myPlats = () => store.get("plats", ["XP Investimentos", "Revolut"]);

// ------------------------------------------------------------------ DICIONÁRIO (toque no "?" ao lado da sigla)
const GLOSS = {
  "CDB": ["Certificado de Depósito Bancário", "Você empresta dinheiro a um banco e ele devolve com juros. Se o banco quebrar, o FGC devolve até R$ 250 mil por pessoa. Exemplo: um CDB que paga 100% do CDI rende parecido com a Selic."],
  "CDI": ["Certificado de Depósito Interbancário", "É a taxa que os bancos usam entre si e anda quase igual à Selic. Serve de régua: \"100% do CDI\" significa render o mesmo que ela; \"110% do CDI\" rende 10% a mais."],
  "Selic": ["Taxa Selic", "É a taxa básica de juros do Brasil, definida pelo Banco Central a cada cerca de 45 dias. Quando ela sobe, a renda fixa rende mais e a bolsa costuma sofrer; quando cai, é o contrário."],
  "Tesouro Selic": ["Tesouro Selic (LFT)", "Título do governo que acompanha a Selic. É o mais seguro e simples do Brasil: dá para resgatar em 1 dia útil. Bom para reserva de emergência e para guardar dinheiro enquanto espera uma boa oportunidade."],
  "Tesouro IPCA+": ["Tesouro IPCA+ (NTN-B)", "Título do governo que paga a inflação (IPCA) mais uma taxa fixa. Exemplo: IPCA + 7% significa que seu dinheiro cresce 7% acima da inflação. Protege o poder de compra no longo prazo."],
  "Tesouro Direto": ["Tesouro Direto", "Programa do governo para comprar títulos públicos pela internet, a partir de cerca de R$ 30. Você compra por uma corretora ou banco, que cuida do título para você."],
  "IPCA": ["Índice Nacional de Preços ao Consumidor Amplo", "É a inflação oficial do Brasil: o quanto os preços subiram. Se o IPCA é 4,5% e seu investimento rende 4,5%, você só manteve o poder de compra."],
  "FII": ["Fundo de Investimento Imobiliário", "Você compra cotas de um fundo que tem imóveis (shoppings, galpões) ou títulos imobiliários e recebe renda todo mês, sem comprar um imóvel. Pela regra atual, os rendimentos são isentos de IR para pessoa física."],
  "ETF": ["Exchange Traded Fund (fundo de índice)", "Fundo negociado na bolsa como uma ação que copia um índice. Exemplo: o IVVB11 acompanha o S&P 500, as 500 maiores empresas dos EUA. Com uma compra você investe em muitas empresas."],
  "RSI": ["Índice de Força Relativa", "Mede, de 0 a 100, se o preço caiu ou subiu rápido demais. Abaixo de 30 a 35 costuma indicar que a queda exagerou (\"vendida\"); acima de 70, que a alta esticou. É uma pista, não uma previsão."],
  "Dividend yield": ["Rendimento de dividendos", "Quanto o ativo pagou de proventos nos últimos 12 meses, dividido pelo preço de hoje. Exemplo: 8% significa R$ 8 de proventos por ano para cada R$ 100 investidos."],
  "Proventos": ["Proventos", "Dinheiro que a empresa ou o fundo paga ao dono da ação ou da cota: dividendos, juros sobre capital próprio e rendimentos de FIIs."],
  "P/VP": ["Preço sobre Valor Patrimonial", "Compara o preço da cota de um FII com o valor do patrimônio dele. Abaixo de 1,0 a cota está com desconto; acima de 1,0, com ágio. Confira no relatório do fundo."],
  "FGC": ["Fundo Garantidor de Créditos", "É um \"seguro\" mantido pelos bancos: se o banco quebrar, devolve até R$ 250 mil por pessoa e por instituição em CDB, LCI e LCA. Não cobre ações, FIIs nem Tesouro (o Tesouro tem garantia do governo)."],
  "LCI": ["Letra de Crédito Imobiliário", "Parecida com o CDB, mas ligada ao crédito imobiliário. Para pessoa física é isenta de Imposto de Renda e tem a proteção do FGC."],
  "LCA": ["Letra de Crédito do Agronegócio", "Parecida com o CDB, mas ligada ao agronegócio. Para pessoa física é isenta de Imposto de Renda e tem a proteção do FGC."],
  "IR": ["Imposto de Renda", "Na renda fixa o imposto diminui com o tempo: 22,5% até 6 meses, 20% até 1 ano, 17,5% até 2 anos e 15% depois. FIIs e LCI/LCA têm regras melhores. Confirme sempre a regra atual."],
  "Copom": ["Comitê de Política Monetária", "Grupo do Banco Central que decide a taxa Selic a cada cerca de 45 dias. A decisão mexe com juros, dólar e bolsa."],
  "Fed": ["Federal Reserve", "O banco central dos Estados Unidos. Quando ele sobe os juros lá, o dinheiro tende a sair de países como o Brasil e o dólar sobe."],
  "DI": ["Depósito Interfinanceiro (juros futuros)", "Taxa que o mercado espera para os juros no futuro. Quando o DI de longo prazo sobe muito, o mercado está desconfiado das contas do governo."],
  "Ibovespa": ["Índice Bovespa", "Principal índice da bolsa brasileira: uma média das maiores e mais negociadas ações. Quando se diz que \"a bolsa caiu\", normalmente é ele."],
  "S&P 500": ["Standard & Poor's 500", "Índice das 500 maiores empresas dos Estados Unidos. É o termômetro da bolsa americana."],
  "Brent": ["Petróleo Brent", "Tipo de petróleo usado como referência de preço no mundo. Influencia a Petrobras e a inflação."],
  "ROE": ["Retorno sobre o Patrimônio", "Mostra quanto lucro a empresa gera para cada R$ 100 de patrimônio dos acionistas. Exemplo: 24% é um retorno muito bom para um banco."],
  "JCP": ["Juros sobre Capital Próprio", "Forma de a empresa pagar seus acionistas, parecida com dividendos, mas com 15% de imposto retido na fonte."],
  "Volatilidade": ["Volatilidade", "O quanto o preço balança. Quanto maior, mais o ativo sobe e desce e maior o risco de ver o investimento no vermelho no curto prazo."],
  "média de 200 dias": ["Média móvel de 200 dias", "Preço médio dos últimos 200 pregões. Mostra a tendência de fundo: preço bem acima dela costuma indicar força; bem abaixo, fraqueza."],
  "Média 200 dias": ["Média móvel de 200 dias", "Preço médio dos últimos 200 pregões. Mostra a tendência de fundo: preço bem acima dela costuma indicar força; bem abaixo, fraqueza."],
  "Reserva de emergência": ["Reserva de emergência", "Dinheiro guardado para imprevistos, de 3 a 6 meses dos seus gastos, em investimento seguro e que resgata rápido, como Tesouro Selic ou CDB de liquidez diária."],
  "Liquidez": ["Liquidez", "A facilidade e a rapidez de transformar o investimento em dinheiro. Tesouro Selic tem liquidez de 1 dia útil; um CDB de 2 anos só resgata no vencimento."],
  "Renda fixa": ["Renda fixa", "Investimentos em que você já sabe como será calculado o ganho (Tesouro, CDB, LCI, LCA). Oscilam pouco e são os mais seguros."],
  "Renda variável": ["Renda variável", "Investimentos sem ganho garantido, como ações, FIIs e ETFs. Podem render mais e também cair."],
  "Marcação a mercado": ["Marcação a mercado", "Quando os juros mudam, o preço do seu título muda antes do vencimento. Se você segurar até o final, recebe o combinado; se vender antes, pode ganhar ou perder."],
  "Rebalancear": ["Rebalancear a carteira", "Voltar às proporções que você definiu. Exemplo: se as ações subiram e passaram da meta, você aporta mais nas outras classes."],
  "Circuit breaker": ["Circuit breaker", "Parada automática da bolsa quando o Ibovespa cai 10% no dia, para o mercado respirar. Aconteceu em 26/10/2026, pela primeira vez desde 2020."],
  "Fiscal": ["Contas públicas (fiscal)", "Diz respeito às contas do governo: quanto gasta, quanto arrecada e quanto deve. Se o mercado desconfia dessas contas, os juros e o dólar sobem."],
  "B3": ["Brasil, Bolsa, Balcão", "A bolsa de valores do Brasil, onde se compram e vendem ações, FIIs e ETFs."],
  "ntfy": ["ntfy", "Aplicativo gratuito de avisos. O VW Wallet usa o ntfy para mandar a notificação ao seu celular mesmo com o app fechado."],
  "Suitability": ["Perfil de investidor (suitability)", "Questionário que as corretoras fazem para saber quanto risco você aceita e por quanto tempo. O VW Wallet usa um parecido para sugerir sua carteira."],
  "Oferta": ["Oferta (sinal do Alfred)", "Ativo de qualidade que caiu bastante e, pelas regras do Alfred, está num preço atraente para quem pensa no longo prazo. Não é ordem de compra."],
  "Em espera": ["Em espera (sinal do Alfred)", "Parece uma boa oferta, mas o mercado está em estresse. O Alfred prefere esperar acalmar a comprar enquanto tudo cai."],
  "Esticada": ["Esticada (sinal do Alfred)", "O preço subiu rápido demais e está bem acima da média. Quem já tem pode pensar em realizar parte do lucro."],
  "Focus": ["Boletim Focus", "Pesquisa semanal do Banco Central com as previsões de economistas e bancos para Selic, inflação, PIB e dólar. Mostra o que o mercado espera, não o que vai acontecer."],
  "Teste de estresse": ["Teste de estresse", "Simulação de como a sua carteira se comportaria numa queda forte do mercado, para ver se a perda caberia no seu limite."],
  "VP": ["Valor patrimonial por cota", "Quanto vale, no balanço, cada cota de um fundo imobiliário. Comparando com o preço de mercado, você descobre o P/VP."],
  "Nota do Alfred": ["Nota do Alfred", "Pontuação de 0 a 100 que combina o tamanho da queda, o RSI, a tendência e a qualidade do ativo. Acima de 70 e em ativo de qualidade vira \"oferta\"."],
};
const GALIAS = { "FIIs": "FII", "ETFs": "ETF", "CDBs": "CDB", "LCIs": "LCI", "LCAs": "LCA", "Dividend Yield": "Dividend yield", "dividend yield": "Dividend yield", "dividendos": "Proventos", "Selic.": "Selic", "IPCA+": "Tesouro IPCA+", "volatilidade": "Volatilidade", "renda fixa": "Renda fixa", "renda variável": "Renda variável", "reserva de emergência": "Reserva de emergência", "liquidez": "Liquidez", "rebalancear": "Rebalancear", "marcação a mercado": "Marcação a mercado", "RSI baixo": "RSI", "Média 200 dias": "Média 200 dias" };
const termKey = (t) => (GLOSS[t] ? t : GALIAS[t] || null);
const TERM_RE = new RegExp("(?<![\\p{L}\\d/+])(" + [...Object.keys(GLOSS), ...Object.keys(GALIAS)].filter((x) => !x.endsWith(".")).sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\p{L}\\d])", "gu");
const qicon = (key) => `<span class="q" role="button" tabindex="0" data-term="${esc(key)}" aria-label="O que é ${esc(key)}?">?</span>`;
function annotate(root) {
  const SKIP = "a,button,input,select,textarea,option,svg,script,style,.tk,.badge,.term,.q,.row,.chip,.dic,h1";
  const used = new Map();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim().length > 1 && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const blk = n.parentElement.closest(".card,.kpi,.stat,.banner,.warn,h2,.alloc,td,th,.ag,.about,p,label,.seg") || root;
    const set = used.get(blk) || new Set(); used.set(blk, set);
    const text = n.nodeValue; let last = 0, out = "", hit = false; TERM_RE.lastIndex = 0;
    for (let m = TERM_RE.exec(text); m; m = TERM_RE.exec(text)) {
      const key = termKey(m[1]); if (!key || set.has(key)) continue; set.add(key); hit = true;
      out += esc(text.slice(last, m.index)) + `<span class="term">${esc(m[1])}${qicon(key)}</span>`; last = m.index + m[1].length;
    }
    if (hit) { out += esc(text.slice(last)); const sp = document.createElement("span"); sp.innerHTML = out; n.replaceWith(...sp.childNodes); }
  }
}
function openTerm(key) {
  const g = GLOSS[key]; if (!g) return;
  $("#sh-body").innerHTML = `<div class="sh-k">${esc(key)}</div><div class="sh-n">${esc(g[0])}</div><p>${esc(g[1])}</p>`;
  $("#sheet").classList.add("on"); document.body.classList.add("noscroll");
}
function closeTerm() { $("#sheet").classList.remove("on"); if (!$("#search").classList.contains("on")) document.body.classList.remove("noscroll"); }
function vDicionario(q = "", all = false) {
  const t = nrm(q), list0 = Object.entries(GLOSS).filter(([k, v]) => !t || nrm(k).includes(t) || nrm(v[0]).includes(t) || nrm(v[1]).includes(t)).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")), list = t || all ? list0 : list0.slice(0, 6);
  return (list.map(([k, v]) => `<div class="dic" data-opent="${esc(k)}"><b>${esc(k)}</b><span class="mut">${esc(v[0])}</span></div>`).join("") || '<div class="empty">Nenhum termo encontrado.</div>') + (!t && !all ? `<button class="btn ghost" id="dic-more">Ver todos os ${list0.length} termos</button>` : "");
}

// ------------------------------------------------------------------ componentes
function spark(c, up) {
  const s = c.slice(-60), mn = Math.min(...s), mx = Math.max(...s), w = 64, hh = 28;
  const pts = s.map((v, i) => `${(i / (s.length - 1) * w).toFixed(1)},${(hh - 2 - ((v - mn) / (mx - mn || 1)) * (hh - 4)).toFixed(1)}`).join(" ");
  return `<polyline points="${pts}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
}
const BADGE = { oferta: '<span class="badge">OFERTA</span>', aguardar: '<span class="badge w">EM ESPERA</span>', esticada: '<span class="badge s">ESTICADA</span>', evitar: '<span class="badge s">EVITAR</span>', observar: '<span class="badge w">OBSERVAR</span>' };
const logo = (sym, big) => `<span class="logo${big ? " big" : ""}"><b>${esc(sym.slice(0, 2))}</b><img src="logos/${esc(sym)}.svg" alt="" loading="lazy" decoding="async"></span>`;
function row(a, why = false) {
  const f = favs().has(a.sym) ? `<span class="fav">${icFill("star")}</span>` : "";
  return `<div class="row" data-go="#/ativo/${a.sym}">${logo(a.sym)}<div class="grow"><div class="tk">${a.sym}${f}${BADGE[a.label] || ""}</div><div class="nm">${esc(a.name)}</div>${why && a.why?.length ? `<div class="chips">${a.why.slice(0, 3).map((w) => `<span class="chip">${esc(w)}</span>`).join("")}</div>` : ""}</div><svg class="spark" viewBox="0 0 64 28" data-spark="${a.sym}" data-up="${a.d1 >= 0 ? 1 : 0}"></svg><div class="px num"><b>${fN(a.p)}</b><i class="${cl(a.d1)}">${pct(a.d1)}</i></div></div>`;
}
function hydrate(root) {
  root.querySelectorAll("[data-spark]").forEach(async (el) => {
    const c = D.spark?.[el.dataset.spark] || (await series(el.dataset.spark))?.c;
    if (c) el.innerHTML = spark(c, el.dataset.up === "1");
  });
}
const kpi = (l, v, d, key) => `<div class="kpi"${key ? ` data-go="#/indice/${key}"` : ""}><small>${l}</small><b class="num">${v}</b>${d != null ? `<i class="${cl(d)} num">${pct(d)}</i>` : ""}</div>`;
const secTitle = (t, right = "") => `<h2><span>${t}</span>${right}</h2>`;

// ------------------------------------------------------------------ HOJE
function vHoje() {
  const s = D.summary, R = REGIME[s.regime.level], c = s.context, m = s.macro, fav = favs();
  let h = dados.backupBanner() + X.aporteBanner() + sinaisCard(posLive(), true) + `<div class="banner ${s.regime.level}"><b>${R.t}</b><span>${esc(s.regime.why)}. ${R.d}</span></div>`;
  h += secTitle("Panorama") + `<div class="strip">${kpi("Selic", m.selic != null ? fN(m.selic) + "%" : "—", null, "selic")}${kpi("CDI", m.cdi != null ? fN(m.cdi) + "%" : "—", null, "cdi")}${kpi("IPCA 12m", m.ipca12 != null ? fN(m.ipca12) + "%" : "—", null, "ipca12")}${kpi("Dólar", c.usd ? "R$ " + fN(c.usd.p) : "—", c.usd?.d1, "usd")}${kpi("Ibovespa", c.ibov ? fN(c.ibov.p, 0) : "—", c.ibov?.d1, "ibov")}${kpi("S&P 500", c.sp500 ? fN(c.sp500.p, 0) : "—", c.sp500?.d1, "sp500")}</div>`;
  h += X.focusCard() + X.tesouroCard();
  if (D.digest?.text) h += secTitle("Resumo do dia") + `<div class="card" style="line-height:1.5;font-size:14.5px">${esc(D.digest.text).replace(/\n/g, "<br>")}</div>`;
  const fl = D.assets.filter((a) => fav.has(a.sym));
  if (fl.length) h += secTitle("Favoritos") + `<div class="card">${fl.map((a) => row(a)).join("")}</div>`;
  h += secTitle("Ofertas agora") + `<div class="card">${s.offers.length ? s.offers.map((a) => row(a, true)).join("") : `<div class="empty">Nenhuma oferta no momento. O Alfred segue vigiando e avisa no celular quando surgir uma que combine com o seu perfil (seguro, longo prazo).</div>`}</div>`;
  if (s.waiting.length) h += secTitle("Em espera: boas, mas o mercado está agitado") + `<div class="card">${s.waiting.slice(0, 6).map((a) => row(a, true)).join("")}</div>`;
  if (s.stretched.length) h += secTitle("Esticadas: se você tem, considere realizar parte") + `<div class="card">${s.stretched.map((a) => row(a, true)).join("")}</div>`;
  const nx = AGENDA.filter(([d]) => d >= todayBRT()).slice(0, 5);
  if (nx.length) h += secTitle(`${ic("calendar", "sm")} Agenda`) + `<div class="card">${nx.map(([d, t]) => { const dd = Math.round((new Date(d) - new Date(todayBRT())) / 86400e3); const [y, mo, da] = d.split("-"); return `<div class="ag"><div class="d num"><b>${da}</b><small>${mo}/${y.slice(2)}</small></div><div class="t">${esc(t)}<div class="mut" style="font-size:12px;margin-top:2px">${dd === 0 ? "hoje" : dd === 1 ? "amanhã" : `em ${dd} dias`}</div></div></div>`; }).join("")}</div>`;
  h += secTitle("Últimas notícias do Brasil") + `<div class="card news">${newsList(D.news.items.filter((n) => n.cat !== "mundo").slice(0, 5))}</div><button class="btn ghost" data-go="#/noticias">${ic("news", "sm")} Ver todas as notícias</button>`;
  h += `<p class="warn">Material de estudo gerado por regras automáticas e por IA. Não é recomendação personalizada. Confira preço e taxas na sua corretora antes de qualquer compra.</p>`;
  return h;
}

// ------------------------------------------------------------------ MERCADO (altas/quedas + filtros e ordem, como nos apps de corretora)
let mkTab = "altas", mkType = store.get("mkType", "todos"), mkSort = store.get("mkSort", "dia"), mkAll = false;
const SORTS = { dia: ["Variação do dia", (a, b) => b.d1 - a.d1], nota: ["Nota do Alfred", (a, b) => b.score - a.score], queda: ["Maior queda da máxima", (a, b) => a.dd - b.dd], dy: ["Dividend yield 12m", (a, b) => (b.dy || 0) - (a.dy || 0)], pvp: ["P/VP mais baixo (FIIs)", (a, b) => (a.pvp ?? 99) - (b.pvp ?? 99)], rsi: ["RSI mais baixo", (a, b) => a.rsi - b.rsi] };
const typeOk = (a) => mkType === "todos" || (mkType === "fav" ? favs().has(a.sym) : a.type === mkType);
function vMercado() {
  const s = D.summary, c = s.context, pool = D.assets.filter(typeOk);
  const byD = [...pool].sort((a, b) => b.d1 - a.d1), list = mkTab === "altas" ? byD.slice(0, 6) : byD.slice(-6).reverse();
  let h = secTitle(mkTab === "ofertas" ? "Boas ofertas" : "Maiores movimentos do dia") + `<div class="seg"><button data-mk="altas" class="${mkTab === "altas" ? "on" : ""}">${ic("down", "sm")} Maiores altas</button><button data-mk="baixas" class="${mkTab === "baixas" ? "on" : ""}">Maiores quedas</button><button data-mk="ofertas" class="${mkTab === "ofertas" ? "on" : ""}">Boas ofertas</button></div>`;
  h += `<div class="fchips">${[["todos", "Todos"], ["acao", "Ações"], ["fii", "FIIs"], ["etf", "ETFs"], ["fav", "Favoritos"]].map(([k, t]) => `<button data-mt="${k}" class="${mkType === k ? "on" : ""}">${t}</button>`).join("")}</div>`;
  h += mkTab === "ofertas" ? boasOfertas(pool) : `<div class="card">${list.length ? list.map((a) => row(a)).join("") : '<div class="empty">Nada por aqui. Toque na estrela de um ativo para favoritar.</div>'}</div>`;
  h += secTitle("Contexto") + `<div class="strip">${["ibov", "usd", "sp500", "ust10", "brent", "gold"].filter((k) => c[k]).map((k) => kpi(c[k].name, fN(c[k].p, k === "ibov" ? 0 : 2), c[k].d1, k)).join("")}</div>`;
  if (s.avoid.length) h += secTitle("Evitar por enquanto") + `<div class="card">${s.avoid.map((a) => row(a, true)).join("")}</div>`;
  const all = [...pool].sort(SORTS[mkSort][1]);
  h += secTitle("Todos os ativos vigiados", `<label class="sel">${ic("filter", "sm")}<select id="mk-sort">${Object.entries(SORTS).map(([k, [t]]) => `<option value="${k}" ${mkSort === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>`) + `<div class="card">${(mkAll ? all : all.slice(0, 12)).map((a) => row(a)).join("")}${all.length > 12 && !mkAll ? `<button class="btn ghost" id="mk-more" style="margin:8px 0 2px">Mostrar todos (${all.length})</button>` : ""}</div>`;
  return h;
}

// ------------------------------------------------------------------ NOTÍCIAS
function newsList(items) {
  if (!items.length) return '<div class="empty">Sem notícias por enquanto.</div>';
  return items.map((n) => `<a href="${esc(n.link)}" target="_blank" rel="noopener"><div class="t"><span class="dot ${n.tone}"></span>${esc(n.title)}</div><div class="m">${esc(n.source)} · ${ago(n.date)}${n.cat === "mundo" ? " · mundo" : ""}${(n.syms || []).slice(0, 3).map((s) => ` <span class="chip" data-go="#/ativo/${s}" style="padding:1px 7px;cursor:pointer">${s}</span>`).join("")}</div></a>`).join("");
}
let nwTab = "todas";
function vNoticias() {
  const mine = new Set([...posLive().map((p) => p.sym).filter(Boolean), ...favs(), ...D.summary.offers.map((o) => o.sym), ...D.summary.waiting.map((o) => o.sym)]);
  const f = { todas: () => true, br: (n) => n.cat !== "mundo", mundo: (n) => n.cat === "mundo", minhas: (n) => (n.syms || []).some((s) => mine.has(s)), importantes: (n) => n.key };
  const items = D.news.items.filter(f[nwTab]), m = D.news.mood, mood = m > 0.15 ? "positivo" : m < -0.15 ? "negativo" : "neutro";
  return secTitle(`Notícias · clima ${mood}`) + `<div class="fchips">${[["todas", "Todas"], ["br", "Brasil"], ["importantes", "Importantes"], ["minhas", "Meus ativos"], ["mundo", "Mundo"]].map(([k, t]) => `<button data-nw="${k}" class="${nwTab === k ? "on" : ""}">${t}</button>`).join("")}</div>
  <div class="card news">${newsList(items.slice(0, 60))}</div><p class="warn">O VW Wallet lê as principais fontes brasileiras (InfoMoney, Money Times, Exame, G1, Folha, Estadão, Agência Brasil e outras) e o noticiário internacional, várias vezes ao dia, mesmo com o app fechado.</p>`;
}
const assetNews = (it) => { return it?.length ? secTitle("Notícias desta empresa") + `<div class="card news">${newsList(it.slice(0, 5).map((x) => ({ ...x, cat: "br", syms: [] })))}</div>` : ""; };

// ------------------------------------------------------------------ DETALHE + GRÁFICO (24 h, 2 dias, 1 semana, 1 mês, 1 ano, 5 anos)
let range = store.get("range", "1m");
const RANGES = [["24h", "24 h"], ["2d", "2 dias"], ["1w", "1 sem"], ["1m", "1 mês"], ["1y", "1 ano"], ["5y", "5 anos"]];
async function vAtivo(sym) {
  const a = asset(sym);
  if (!a) return `<button class="back" data-go="#/hoje">${ic("back", "sm")} Voltar</button><div class="empty">Ativo não encontrado.</div>`;
  const R = REGIME[D.summary.regime.level], isFav = favs().has(sym), al = alerts().filter((x) => x.sym === sym);
  const lbl = { oferta: "Oferta: preço atraente para o seu perfil.", aguardar: "Boa, mas em espera: o mercado está agitado. Espere estabilizar.", observar: "Em observação: ainda não é uma oferta.", esticada: "Preço esticado: se você tem, considere realizar parte.", evitar: "Evitar por enquanto: tendência ruim e qualidade menor.", neutro: "Neutro: nada de especial agora." }[a.label];
  const held = posLive().filter((p) => p.sym === a.sym);
  return `<button class="back" data-go="#/hoje">${ic("back", "sm")} Voltar</button>
  <div class="card"><div class="cv"><div style="display:flex;align-items:center;gap:12px">${logo(a.sym, true)}<div><div class="tk" style="font-size:24px;font-weight:800">${a.sym}${BADGE[a.label] || ""}</div><div class="mut" style="font-size:13px">${esc(a.name)} · ${esc(a.sector)}</div></div></div>
  <div class="acts"><button class="icbtn ${isFav ? "on" : ""}" id="fav-btn" aria-label="Favoritar">${isFav ? icFill("star") : ic("star")}</button><button class="icbtn ${al.some((x) => !x.done) ? "on" : ""}" id="al-btn" aria-label="Alerta de preço">${ic("bell")}</button></div></div>
  <div class="cv" style="margin-top:14px"><div class="big num" id="cv-price">R$ ${fN(a.p)}</div><div class="num ${cl(a.d1)}" id="cv-chg" style="font-weight:700">${pct(a.d1)} hoje</div></div>
  <div class="mut num" id="cv-date" style="font-size:12px;height:16px"></div>
  <svg class="chart" id="chart" viewBox="0 0 360 230" preserveAspectRatio="none"></svg>
  <div class="seg" style="margin-top:10px">${RANGES.map(([n, t]) => `<button data-range="${n}" class="${range === n ? "on" : ""}" style="padding:8px 2px;font-size:12.5px">${t}</button>`).join("")}</div>
  <div id="al-panel" style="display:none"><div class="grid2"><div><label>Avisar quando o preço ficar</label><select id="al-dir"><option value="abaixo">abaixo de</option><option value="acima">acima de</option></select></div><div><label>Preço (R$)</label><input id="al-price" inputmode="decimal" placeholder="${fN(a.p)}"></div></div><button class="btn" id="al-save">Criar alerta</button>${al.length ? `<div style="margin-top:12px">${al.map((x) => `<div class="cv" style="padding:6px 0"><span class="${x.done ? "mut" : ""}">${x.dir} de R$ ${fN(x.price)}${x.done ? " (disparado)" : ""}</span><button class="btn sm ghost" data-delal="${x.id}">${ic("trash", "sm")}</button></div>`).join("")}</div>` : ""}<div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">O alerta confere o preço sempre que o app atualiza. Para avisos com o app fechado, assine as ofertas no ntfy (aba Mais).</div></div></div>
  ${secTitle("Leitura do Alfred")}<div class="card"><div style="font-weight:700;margin-bottom:6px">${lbl}</div>${a.why?.length ? `<div class="chips">${a.why.map((w) => `<span class="chip">${esc(w)}</span>`).join("")}</div>` : ""}${a.label === "aguardar" ? `<div class="empty" style="margin-top:10px">${R.d}</div>` : ""}</div>
  ${secTitle("Números")}<div class="grid2">
    ${[["Dividend yield 12m", a.dy ? fN(a.dy * 100, 1) + "%" : "—", ""], ["Queda da máxima (12m)", pct(a.dd), cl(a.dd)], ["RSI (14 dias)", fN(a.rsi, 0), ""], ["Volatilidade", fN((a.vol || 0) * 100, 0) + "% a.a.", ""], ["5 dias", pct(a.d5), cl(a.d5)], ["21 dias", pct(a.d21), cl(a.d21)], ["Máxima 12m", "R$ " + fN(a.hi), ""], ["Mínima 12m", "R$ " + fN(a.lo), ""], ["Média 200 dias", "R$ " + fN(a.s200), ""], ["Nota do Alfred", a.score + "/100", ""], ...(a.pvp != null ? [["P/VP (oficial, CVM)", fN(a.pvp, 2), a.pvp <= 1 ? "up" : ""], ["Valor patrimonial por cota", "R$ " + fN(a.vp), ""], ["DY do último mês", fN(a.dyMes, 2) + "%", ""], ["Cotistas", (a.cotistas || 0).toLocaleString("pt-BR"), ""]] : [])].map(([k, v, c]) => `<div class="stat"><small>${k}</small><b class="num ${c}">${v}</b></div>`).join("")}</div>
  ${a.divs?.length ? secTitle("Últimos proventos") + `<div class="card">${a.divs.slice().reverse().map((d) => `<div class="cv" style="padding:7px 0;border-bottom:1px solid var(--line)"><span class="mut">${d.d.split("-").reverse().join("/")}</span><b class="num">R$ ${fN(d.a, 4)}</b></div>`).join("")}</div>` : ""}
  ${held.length ? secTitle("Na sua carteira") + `<div class="card">Você tem ${fBRL(held.reduce((s, p) => s + p.value, 0))} em ${a.sym}.</div>` : ""}
  ${assetNews(await assetNewsOf(a.sym))}
  <button class="btn ghost" id="addpos">${ic("plus", "sm")} Adicionar à minha carteira</button>
  <p class="warn">RSI mede se o preço caiu rápido demais (abaixo de 30–35 costuma indicar exagero). A média de 200 dias mostra a tendência de fundo. São regras objetivas, não previsões. Dividend yield = proventos dos últimos 12 meses ÷ preço atual.</p>`;
}
async function chartPoints(sym) {
  const dayLbl = (iso) => { const d = iso.split("-"); return `${d[2]}/${d[1]}/${d[0]}`; };
  if (["24h", "2d", "1w"].includes(range)) {
    const it = await intraOf(sym);
    if (!it?.t?.length) return null;
    const keyOf = (u) => brt(u).toISOString().slice(0, 10), sessions = [...new Set(it.t.map(keyOf))];
    const keep = new Set(range === "24h" ? sessions.slice(-1) : range === "2d" ? sessions.slice(-2) : sessions), pts = [];
    it.t.forEach((u, i) => { if (keep.has(keyOf(u))) { const d = brt(u); pts.push({ v: it.c[i], l: `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`, x: range === "24h" ? `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}` : `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}` }); } });
    return { pts, intra: true };
  }
  const daily = await series(sym); if (!daily) return null;
  const n = range === "1m" ? 22 : range === "1y" ? (IDX[sym]?.monthly ? 12 : 252) : daily.c.length, from = Math.max(0, daily.c.length - n), pts = [];
  for (let i = from; i < daily.c.length; i++) pts.push({ v: daily.c[i], l: dayLbl(daily.t[i]), x: range === "5y" ? daily.t[i].slice(5, 7) + "/" + daily.t[i].slice(2, 4) : daily.t[i].slice(8) + "/" + daily.t[i].slice(5, 7), i });
  const sm = pts.map((p) => (p.i >= 199 ? daily.c.slice(p.i - 199, p.i + 1).reduce((x, y) => x + y, 0) / 200 : null));
  return { pts, sm, hi: Math.max(...daily.c.slice(-252)), intra: false };
}
async function drawChart(sym, meta) {
  const el = $("#chart"), a = meta ? null : asset(sym); if (!el) return;
  const R = await chartPoints(sym);
  if (!R || R.pts.length < 2) { el.innerHTML = `<text x="180" y="115" text-anchor="middle" fill="var(--mut)" font-size="12">Sem dados para esta faixa</text>`; return; }
  if (meta) R.sm = null;
  const c = R.pts.map((p) => p.v), smv = (R.sm || []).filter((x) => x != null), showRef = !meta && (R.intra || range !== "5y");
  let mn = Math.min(...c, ...smv), mx = Math.max(...c, ...smv, !R.intra && showRef ? R.hi : 0); const W = 360, H = 230, pl = 6, pr = 6, pt = 14, pb = 22;
  if (mx - mn < Math.abs(mx) * 0.002) { const pad = Math.max(Math.abs(mx) * 0.01, 0.1); mn -= pad; mx += pad; } // série sem variação: linha no meio
  const X = (i) => pl + (i / (c.length - 1)) * (W - pl - pr), Y = (v) => pt + (1 - (v - mn) / (mx - mn || 1)) * (H - pt - pb);
  const up = c[c.length - 1] >= c[0], col = up ? "var(--up)" : "var(--down)";
  const line = c.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(""), area = `${line}L${X(c.length - 1).toFixed(1)},${H - pb}L${X(0).toFixed(1)},${H - pb}Z`;
  let sma = "", st = false; (R.sm || []).forEach((v, i) => { if (v == null) return; sma += `${st ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; st = true; });
  const ref = R.intra ? c[0] : R.hi, refTxt = R.intra ? "abertura" : "máx. 12m";
  el.innerHTML = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
  ${showRef && ref >= mn && ref <= mx ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="var(--mut)" stroke-dasharray="2 4" stroke-width="1" vector-effect="non-scaling-stroke"/><text x="${pl + 2}" y="${Y(ref) - 4}" fill="var(--mut)" font-size="9">${refTxt}</text>` : ""}
  ${sma ? `<path d="${sma}" fill="none" stroke="var(--gold)" stroke-width="1.6" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>` : ""}
  <path d="${area}" fill="url(#g)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  <text x="${pl + 2}" y="${H - 6}" fill="var(--mut)" font-size="9">${R.pts[0].x}</text><text x="${W - pr - 2}" y="${H - 6}" text-anchor="end" fill="var(--mut)" font-size="9">${R.pts[R.pts.length - 1].x}</text>
  <g id="xh" style="display:none"><line id="xl" y1="${pt}" y2="${H - pb}" stroke="var(--mut)" stroke-width="1" vector-effect="non-scaling-stroke"/><circle id="xc" r="4.5" fill="${col}" stroke="var(--card)" stroke-width="2"/></g>`;
  const total = c[c.length - 1] / c[0] - 1;
  const fv = meta ? meta.fmt : (v) => "R$ " + fN(v), cur = meta ? c[c.length - 1] : a.p;
  const base = () => { $("#cv-price").textContent = fv(cur); $("#cv-date").textContent = ""; $("#cv-chg").textContent = pct(total) + " no período"; $("#cv-chg").className = "num " + cl(total); };
  base();
  const move = (ev) => {
    const r = el.getBoundingClientRect(), x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), i = Math.round(x * (c.length - 1));
    $("#xh").style.display = ""; $("#xl").setAttribute("x1", X(i)); $("#xl").setAttribute("x2", X(i)); $("#xc").setAttribute("cx", X(i)); $("#xc").setAttribute("cy", Y(c[i]));
    $("#cv-price").textContent = fv(c[i]); $("#cv-date").textContent = R.pts[i].l;
    const ch = c[i] / c[0] - 1; $("#cv-chg").textContent = pct(ch) + " no período"; $("#cv-chg").className = "num " + cl(ch);
  };
  const end = () => { $("#xh").style.display = "none"; base(); };
  el.onpointermove = move; el.onpointerdown = move; el.onpointerleave = end; el.onpointerup = end;
}

// ------------------------------------------------------------------ INDICADORES DO PANORAMA (toque para ver o gráfico)
const R_DAY = ["24h", "2d", "1w", "1m", "1y", "5y"], R_MAC = ["1m", "1y", "5y"];
const IDX = {
  selic: { n: "Selic", sub: "Taxa básica de juros, % ao ano", fmt: (v) => fN(v) + "%", ranges: R_MAC, def: "1y", note: "Definida pelo Copom a cada cerca de 45 dias. Fonte: Banco Central. Selic alta faz a renda fixa render mais." },
  cdi: { n: "CDI", sub: "Taxa dos bancos entre si, % ao ano", fmt: (v) => fN(v) + "%", ranges: R_MAC, def: "1y", note: "Anda quase igual à Selic. É a régua do CDB: “100% do CDI” rende como ela. Fonte: Banco Central." },
  ipca12: { n: "IPCA em 12 meses", sub: "Inflação acumulada, % (um ponto por mês)", fmt: (v) => fN(v) + "%", monthly: true, ranges: ["1y", "5y"], def: "1y", note: "Inflação oficial do Brasil. Para render de verdade, o investimento precisa passar dela. Fonte: IBGE, via Banco Central." },
  usd: { n: "Dólar", sub: "Cotação em reais", fmt: (v) => "R$ " + fN(v), ranges: R_DAY, def: "1m", note: "O dólar sobe quando o mercado teme o Brasil ou os juros nos EUA. Pode ter atraso de alguns minutos." },
  ibov: { n: "Ibovespa", sub: "Índice da bolsa brasileira, pontos", fmt: (v) => fN(v, 0), ranges: R_DAY, def: "1m", note: "Média das principais ações da B3. Dados com atraso." },
  sp500: { n: "S&P 500", sub: "Índice da bolsa dos EUA, pontos", fmt: (v) => fN(v, 0), ranges: R_DAY, def: "1m", note: "As 500 maiores empresas dos EUA. Dados com atraso." },
  ust10: { n: "Juros dos EUA (10 anos)", sub: "% ao ano", fmt: (v) => fN(v) + "%", ranges: R_DAY, def: "1m", note: "Quando sobe, o dinheiro tende a sair de países como o Brasil." },
  brent: { n: "Petróleo Brent", sub: "US$ por barril", fmt: (v) => "US$ " + fN(v), ranges: R_DAY, def: "1m", note: "Referência mundial do petróleo. Influencia a Petrobras e a inflação." },
  gold: { n: "Ouro", sub: "US$ por onça", fmt: (v) => "US$ " + fN(v, 0), ranges: R_DAY, def: "1m", note: "Costuma subir quando o mundo está inseguro." },
};
function vIndice(key) {
  const m = IDX[key], back = `<button class="back" id="idx-back">${ic("back", "sm")} Voltar</button>`;
  if (!m) return back + '<div class="empty">Indicador não encontrado.</div>';
  if (!m.ranges.includes(range)) range = m.def;
  return `${back}<div class="card"><div class="tk" style="font-size:22px;font-weight:800">${esc(D.summary.context?.[key]?.name || m.n)}</div><div class="mut" style="font-size:13px">${esc(m.sub)}</div>
  <div class="cv" style="margin-top:14px"><div class="big num" id="cv-price">—</div><div class="num" id="cv-chg" style="font-weight:700"></div></div>
  <div class="mut num" id="cv-date" style="font-size:12px;height:16px"></div>
  <svg class="chart" id="chart" viewBox="0 0 360 230" preserveAspectRatio="none"></svg>
  <div class="seg" style="margin-top:10px">${RANGES.filter(([n]) => m.ranges.includes(n)).map(([n, t]) => `<button data-range="${n}" class="${range === n ? "on" : ""}" style="padding:8px 2px;font-size:12.5px">${t}</button>`).join("")}</div></div>
  <p class="warn">${esc(m.note)} Toque no gráfico e arraste para ver cada dia.</p>`;
}

// ------------------------------------------------------------------ BOAS OFERTAS (aba do Mercado)
function boasOfertas(pool) {
  const qa = store.get("quiz", {}), done = QUIZ.every((q) => qa[q.k]), T = done ? profileOf(qa).alloc : null, regime = D.summary.regime.level;
  const cls = (a) => (a.type === "acao" ? "acao" : a.type === "fii" ? "fii" : "ext");
  const good = pool.filter((a) => a.core && (!T || T[cls(a)] > 0) && (["oferta", "aguardar"].includes(a.label) || (a.label === "observar" && a.score >= 60))).sort((a, b) => b.score - a.score);
  const now = good.filter((a) => a.label === "oferta"), wait = good.filter((a) => a.label === "aguardar"), obs = good.filter((a) => a.label === "observar");
  const meta = (a) => [a.pvp != null ? `P/VP ${fN(a.pvp, 2)}` : null, a.dy ? `DY ${fN(a.dy * 100, 1)}%` : null, `${fN(Math.abs(a.dd) * 100, 0)}% abaixo da máxima`, `RSI ${fN(a.rsi, 0)}`].filter(Boolean).join(" · ");
  const line = (a) => `<div class="row" data-go="#/ativo/${a.sym}">${logo(a.sym)}<div class="grow"><div class="tk">${a.sym}${BADGE[a.label] || ""}</div><div class="nm">${esc(a.name)}</div><div class="mut" style="font-size:12px;margin-top:3px">${esc(meta(a))}</div></div><div class="px num"><b>${fN(a.p)}</b><i class="${cl(a.d1)}">${pct(a.d1)}</i></div><span class="score">${a.score}</span></div>`;
  let h = `<div class="card" style="font-size:13.5px;line-height:1.5">Empresas e fundos de qualidade que caíram o bastante para o preço ficar atraente. ${T ? "Filtrado pelas classes do seu perfil." : "Responda o perfil de investidor para filtrar pelo seu perfil."} O número à direita é a nota do Alfred (0 a 100).</div>`;
  h += secTitle("Boa hora de comprar") + `<div class="card">${now.length ? now.map(line).join("") : `<div class="empty">${regime === "estresse" ? "Nenhuma agora: o mercado está em estresse e o Alfred prefere esperar. Veja as que estão em espera abaixo." : "Nenhuma agora. O Alfred avisa no celular quando surgir."}</div>`}</div>`;
  if (wait.length) h += secTitle("Boas, mas em espera") + `<div class="card"><div class="mut" style="font-size:13px;line-height:1.5;margin-bottom:4px">Passam nos critérios, mas o mercado está agitado. Entram na lista de compra quando acalmar.</div>${wait.map(line).join("")}</div>`;
  if (obs.length) h += secTitle("Para ficar de olho") + `<div class="card">${obs.slice(0, 6).map(line).join("")}</div>`;
  return h + `<p class="warn">Regras objetivas (queda da máxima, RSI, média de 200 dias, qualidade, P/VP dos FIIs). Material de estudo, não recomendação personalizada: confira preço e taxas na sua corretora.</p>`;
}

// ------------------------------------------------------------------ CARTEIRA
// ------------------------------------------------------------------ GRÁFICO DE PIZZA (rosca): onde está o dinheiro
let pieMode = store.get("pieMode", "classe"), pieView = "atual";
const CLS_COLOR = { selic: "#09533B", ipca: "#2E9E6E", cdb: "#0B6F6F", fii: "#1F4FD8", acao: "#F26B21", ext: "#F5C400" };
const PAL = ["#1F4FD8", "#F26B21", "#2E9E6E", "#F5C400", "#8E5BD6", "#D12F3A", "#0B6F6F", "#6B7280", "#E58BB4", "#09533B"];
function pieItems(pos, T) {
  const tsum = Object.values(T).reduce((a, b) => a + b, 0) || 1;
  if (pieView === "meta") return CLS.map(([k, n]) => ({ k, n, v: (T[k] / tsum) * 100, c: CLS_COLOR[k], meta: true })).filter((x) => x.v > 0);
  const m = new Map();
  pos.forEach((p) => {
    const cn = CLS.find((c) => c[0] === p.cls)[1];
    const key = pieMode === "classe" ? p.cls : pieMode === "ativo" ? (p.sym || cn) : (p.plat || "Sem plataforma");
    const name = pieMode === "classe" ? cn : key;
    const cur = m.get(key) || { k: key, n: name, v: 0, c: pieMode === "classe" ? CLS_COLOR[p.cls] : null }; cur.v += p.value; m.set(key, cur);
  });
  const arr = [...m.values()].sort((a, b) => b.v - a.v); let i = 0;
  arr.forEach((x) => { if (!x.c) x.c = PAL[i++ % PAL.length]; });
  return arr;
}
function donut(items, centerTop, centerSub) {
  const tot = items.reduce((s, x) => s + x.v, 0), R = 74, C = 2 * Math.PI * R;
  if (!tot) return `<svg class="donut" viewBox="0 0 200 200"><circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--chip)" stroke-width="30"/><text x="100" y="98" text-anchor="middle" class="dt">—</text><text x="100" y="120" text-anchor="middle" class="ds">sem posições</text></svg>`;
  let off = 0;
  const segs = items.map((x, i) => { const len = (x.v / tot) * C, gap = items.length > 1 ? 2.2 : 0; const s = `<circle class="seg" data-i="${i}" cx="100" cy="100" r="${R}" fill="none" stroke="${x.c}" stroke-width="30" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C - Math.max(0, len - gap)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(x.n)}</title></circle>`; off += len; return s; }).join("");
  return `<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="Gráfico de pizza da carteira">${segs}<text x="100" y="97" text-anchor="middle" class="dt">${centerTop}</text><text x="100" y="117" text-anchor="middle" class="ds">${centerSub}</text></svg>`;
}
function pieCard(pos, T, total) {
  const items = pieItems(pos, T), tot = items.reduce((s, x) => s + x.v, 0);
  const meta = pieView === "meta";
  const legend = items.map((x) => `<div class="lg"><span class="sw" style="background:${x.c}"></span><span class="ln">${esc(x.n)}</span><span class="lv num">${meta ? "" : fBRL(x.v)}</span><b class="lp num">${fN((x.v / (tot || 1)) * 100, 1)}%</b></div>`).join("");
  return secTitle("Onde está o seu dinheiro") +
    `<div class="card"><div class="seg" style="margin:0 0 6px">${[["atual", "Atual"], ["meta", "Meta"]].map(([k, t]) => `<button data-pv="${k}" class="${pieView === k ? "on" : ""}">${t}</button>`).join("")}</div>
    ${meta ? "" : `<div class="fchips" style="padding-bottom:4px">${[["classe", "Por classe"], ["ativo", "Por ativo"], ["plataforma", "Por plataforma"]].map(([k, t]) => `<button data-pm="${k}" class="${pieMode === k ? "on" : ""}">${t}</button>`).join("")}</div>`}
    <div class="pie">${donut(items, meta ? "Meta" : fBRL(total), meta ? "da carteira" : "patrimônio")}</div>
    <div class="legend">${legend || '<div class="empty">Cadastre suas posições abaixo e o gráfico aparece aqui.</div>'}</div></div>`;
}

let platFilter = "todas";
function totals(pos) { const by = Object.fromEntries(CLS.map(([k]) => [k, 0])); pos.forEach((p) => (by[p.cls] += p.value)); return { by, total: pos.reduce((s, p) => s + p.value, 0) }; }
function suggest(pos, aporte, T, ipcaRate, regimeOv) {
  const { by, total } = totals(pos), tot = total + aporte, regime = regimeOv || D.summary.regime.level, tsum = Object.values(T).reduce((a, b) => a + b, 0) || 1;
  const gap = {}; let gs = 0;
  CLS.forEach(([k]) => { gap[k] = Math.max(0, (tot * (T[k] || 0)) / tsum - by[k]); gs += gap[k]; });
  const out = {}; CLS.forEach(([k]) => (out[k] = gs > 0 ? (aporte * gap[k]) / gs : (aporte * (T[k] || 0)) / tsum));
  const notes = {}; let waiting = 0; const mult = regime === "estresse" ? 1 : regime === "tensao" ? 0.5 : 0;
  RISK.forEach((k) => { const w = out[k] * mult; if (w > 0) { out[k] -= w; waiting += w; } });
  if (out.ipca > 0 && (ipcaRate == null || ipcaRate < 7.2)) { waiting += out.ipca; notes.ipca = ipcaRate == null ? "Informe a taxa que vê no Tesouro (abaixo)." : `Taxa ${fN(ipcaRate)}% < 7,2%: espere.`; out.ipca = 0; }
  out.selic += waiting;
  if (waiting > 0) notes.selic = `Inclui ${fBRL(waiting)} aguardando (mercado ${REGIME[regime].p.toLowerCase()} ou taxa baixa).`;
  const picks = (type, extra) => D.assets.filter((a) => a.core && (type ? a.type === type : true) && (extra ? extra(a) : true) && ["oferta", "observar", "aguardar", "neutro"].includes(a.label)).sort((a, b) => b.score - a.score).slice(0, 3).map((a) => a.sym);
  const sel = { fii: picks("fii"), acao: picks("acao"), ext: picks("etf", (a) => ["IVVB11", "GOLD11"].includes(a.sym)) };
  return { out, notes, sel, by, total };
}
const whereBuy = (k) => {
  const m = myPlats(), known = PLATS.filter((p) => m.includes(p.n)), ok = known.filter((p) => p.caps.includes(k)).map((p) => p.n), unk = m.filter((n) => !PLATS.some((p) => p.n === n));
  const parts = []; if (ok.length) parts.push(`Onde: ${ok.join(", ")}`); if (unk.length) parts.push(`confirme também em ${unk.join(", ")}`);
  return parts.join(" · ") || "Nenhuma das suas plataformas oferece isso: veja Mais › Minhas plataformas.";
};
function vCarteira() {
  const all = posLive(), T = { ...DEF_T, ...store.get("metas", {}) }, ap = aporteMes(), ipcaRate = store.get("ipca", null) ?? D.summary.macro.tesouro?.ipca2032 ?? null;
  const usedPlats = [...new Set(all.map((p) => p.plat).filter(Boolean))];
  const pos = platFilter === "todas" ? all : all.filter((p) => p.plat === platFilter);
  const { by, total } = totals(pos), tsum = Object.values(T).reduce((a, b) => a + b, 0) || 1;
  let h = secTitle("Meu patrimônio") + `<div class="card"><div class="big num">${fBRL(total)}</div><div class="mut" style="font-size:13px">${pos.length} posições${platFilter !== "todas" ? ` em ${esc(platFilter)}` : ""} · guardado só neste aparelho</div></div>`;
  if (usedPlats.length) h += `<div class="fchips"><button data-pf="todas" class="${platFilter === "todas" ? "on" : ""}">Todas as plataformas</button>${usedPlats.map((p) => `<button data-pf="${esc(p)}" class="${platFilter === p ? "on" : ""}">${esc(p)}</button>`).join("")}</div>`;
  h += sinaisCard(all);
  h += pieCard(pos, T, total);
  h += X.healthCard(pos) + X.incomeCard(pos);
  const qa = store.get("quiz", {}), qd = QUIZ.every((q) => qa[q.k]), pr = qd ? profileOf(qa) : null;
  h += `<div class="card cta" data-go="#/perfil"><div class="cta-i">${ic("user")}</div><div style="flex:1"><div style="font-weight:800;font-size:15px">${pr ? `Perfil: ${pr.name}` : "Descubra o seu perfil de investidor"}</div><div class="mut" style="font-size:13px;margin-top:3px">${pr ? "Toque para ver a carteira sugerida ou refazer." : "9 perguntas rápidas e o Alfred monta a carteira ideal para você (ou para um amigo)."}</div></div><span class="badge">${pr ? "VER" : "COMEÇAR"}</span></div>`;
  h += `<div class="card cta" data-go="#/recomendar"><div class="cta-i">${ic("target")}</div><div style="flex:1"><div style="font-weight:800;font-size:15px">O que comprar hoje?</div><div class="mut" style="font-size:13px;margin-top:3px">O Alfred monta a compra do mês de acordo com o seu perfil.</div></div><span class="badge">VER</span></div>`;
  h += secTitle("Como está distribuído", `<button class="btn sm ghost" id="meta-auto2" style="text-transform:none;letter-spacing:0">${ic("user", "sm")} Metas pelo perfil</button>`) + `<div class="card">${CLS.map(([k, n]) => { const cur = total ? (by[k] / total) * 100 : 0, tg = (T[k] / tsum) * 100; return `<div class="alloc"><div class="l"><span>${n}</span><span class="num"><b>${fN(cur, 0)}%</b> <span class="mut">/ meta ${fN(tg, 0)}%</span></span></div><div class="bar"><i style="width:${Math.min(100, cur)}%"></i><b style="left:${Math.min(99, tg)}%"></b></div></div>`; }).join("")}</div>`;
  if (all.length && usedPlats.length) { const bp = usedPlats.map((p) => [p, all.filter((x) => x.plat === p).reduce((s, x) => s + x.value, 0)]), tt = totals(all).total || 1; h += secTitle("Por plataforma") + `<div class="card">${bp.map(([p, v]) => `<div class="alloc"><div class="l"><span>${esc(p)}</span><span class="num"><b>${fBRL(v)}</b> <span class="mut">${fN((v / tt) * 100, 0)}%</span></span></div><div class="bar"><i style="width:${(v / tt) * 100}%"></i></div></div>`).join("")}</div>`; }
  const al = []; pos.forEach((p) => { const a = p.sym && asset(p.sym); if (!a) return; if (a.label === "esticada") al.push(`${a.sym}: preço esticado, considere realizar parte.`); if (a.label === "evitar") al.push(`${a.sym}: sinal de evitar, reavalie.`); if (total && p.value / total > 0.25) al.push(`${a.sym}: mais de 25% do patrimônio, concentração alta.`); });
  if (al.length) h += secTitle("Atenção") + `<div class="card">${al.map((x) => `<div style="padding:6px 0">• ${esc(x)}</div>`).join("")}</div>`;
  const S = suggest(pos, ap, T, ipcaRate);
  const diffs = CLS.map(([k, n]) => [n, total ? (by[k] / total) * 100 - (T[k] / tsum) * 100 : 0]).filter(([, d]) => Math.abs(d) >= 3);
  h += secTitle("Para onde vai o próximo aporte") + `<div class="card">${total && diffs.length ? `<div class="mut" style="font-size:13.5px;line-height:1.5;margin-bottom:6px">${diffs.sort((a, b) => a[1] - b[1]).map(([n, d]) => `${n}: ${d < 0 ? `${fN(-d, 0)} pontos abaixo da meta` : `${fN(d, 0)} pontos acima`}`).join(" · ")}.</div>` : ""}<label>Quanto você vai investir neste mês (R$)</label><input id="ap" inputmode="decimal" value="${ap}"><label>Taxa do Tesouro IPCA+ que você vê hoje (% acima da inflação)</label><input id="ipca" inputmode="decimal" placeholder="ex.: 7,3" value="${ipcaRate ?? ""}">
  <table style="margin-top:12px"><tr><th>Classe</th><th class="r">Aportar</th></tr>${CLS.filter(([k]) => S.out[k] > 0.5 || T[k] > 0).map(([k, n]) => `<tr><td>${n}${S.notes[k] ? `<div class="mut" style="font-size:12px">${esc(S.notes[k])}</div>` : ""}${S.out[k] > 0.5 ? `<div class="mut" style="font-size:12px">${esc(whereBuy(k))}</div>` : ""}${S.sel[k]?.length && S.out[k] > 0.5 ? `<div class="chips">${S.sel[k].map((x) => `<span class="chip" data-go="#/ativo/${x}" style="cursor:pointer">${x}</span>`).join("")}</div>` : ""}</td><td class="r num"><b>${fBRL(S.out[k])}</b></td></tr>`).join("")}</table>
  <div class="mut" style="font-size:12px;margin-top:10px;line-height:1.5">Os códigos sugeridos vêm dos ativos de qualidade com melhor nota hoje. Quem compra é você, pelo seu banco ou corretora.</div></div>`;
  h += secTitle("Minhas posições") + `<div class="card">${pos.length ? pos.map((p) => `<div class="row" style="cursor:default">${p.sym === "USD" ? '<span class="logo ic-only"><b style="font-size:18px">$</b></span>' : p.sym ? logo(p.sym) : `<span class="logo ic-only">${ic("wallet", "sm")}</span>`}<div class="grow"><div class="tk" style="font-size:15px">${esc(p.sym === "USD" ? "Dólar" : p.sym || CLS.find((c) => c[0] === p.cls)[1])}</div><div class="nm">${CLS.find((c) => c[0] === p.cls)[1]}${p.sym === "USD" && p.q ? " · US$ " + fN(p.q) : ""}${p.plat ? " · " + esc(p.plat) : ""}</div></div><div class="px num"><b>${fBRL(p.value)}</b>${p.q && p.bp ? (() => { const g = (p.value - p.inv) / p.inv; return `<i class="${cl(g)}">${pct(g)}</i>`; })() : ""}</div><button class="btn sm ghost" data-edit="${p.id}" aria-label="Editar" style="margin-right:6px">${ic("edit", "sm")}</button><button class="btn sm ghost" data-del="${p.id}" aria-label="Excluir">${ic("trash", "sm")}</button></div>`).join("") : '<div class="empty">Nada cadastrado ainda. Adicione abaixo o que você já tem investido.</div>'}</div>`;
  const pre = store.get("prefill", null); store.set("prefill", null);
  const ed = editId ? all.find((p) => String(p.id) === String(editId)) : null; if (editId && !ed) editId = null;
  h += `<div class="card" id="f-card"${ed ? ' style="outline:2px solid var(--gold)"' : ""}><b>${ed ? "Editar posição" : "Adicionar posição"}</b><label>Classe</label><select id="f-cls">${CLS.map(([k, n]) => `<option value="${k}" ${ed ? (ed.cls === k && ed.sym !== "USD" ? "selected" : "") : pre && ((pre.type === "fii" && k === "fii") || (pre.type === "acao" && k === "acao") || (pre.type === "etf" && k === "ext")) ? "selected" : ""}>${n}</option>`).join("")}<option value="usd" ${ed?.sym === "USD" ? "selected" : ""}>Dólar (moeda)</option></select>
  <label id="f-sym-l">Código do ativo (opcional, para ações e FIIs)</label><input id="f-sym" list="syms" placeholder="ex.: KNCR11" value="${esc(ed ? ed.sym : pre?.sym || "")}"><datalist id="syms">${D.assets.map((a) => `<option value="${a.sym}">${esc(a.name)}</option>`).join("")}</datalist>
  <label>Plataforma (digite as primeiras letras)</label><div><input id="f-plat" placeholder="ex.: XP, nu, revolut…" autocomplete="off" value="${esc(ed ? ed.plat : myPlats()[0] || "")}"></div>
  <label>Valor investido (R$)</label><input id="f-val" inputmode="decimal" placeholder="ex.: 300" value="${ed ? String(+ed.inv.toFixed(2)).replace(".", ",") : ""}">
  <label id="f-bp-l">Preço pago por cota ou ação (R$, só para ações, FIIs e ETFs; vazio = preço de agora)</label><input id="f-bp" inputmode="decimal" placeholder="ex.: 9,85" value="${ed?.bp ? String(+ed.bp.toFixed(4)).replace(".", ",") : ""}"><div class="mut" style="font-size:12px;margin-top:6px;line-height:1.45">Com o preço pago, o app acompanha o seu lucro e avisa a boa hora de vender.</div><button class="btn" id="f-add">${ed ? "Salvar alterações" : "Salvar posição"}</button>${ed ? '<button class="btn ghost" id="f-cancel">Cancelar edição</button>' : ""}</div>`;
  return h;
}
let editId = null;
function bindCarteira() {
  const re = () => render();
  $("#f-cancel")?.addEventListener("click", () => { editId = null; re(); });
  const usdMode = () => { const u = $("#f-cls")?.value === "usd"; if (!$("#f-cls")) return; $("#f-sym").readOnly = u; if (u) $("#f-sym").value = "USD"; else if ($("#f-sym").value === "USD") $("#f-sym").value = ""; $("#f-sym-l").textContent = u ? "Moeda" : "Código do ativo (opcional, para ações e FIIs)"; $("#f-bp-l").textContent = u ? `Cotação que você pagou (R$ por dólar, com o spread do câmbio; vazio = cotação de agora${D.summary?.context?.usd ? ": R$ " + fN(D.summary.context.usd.p) : ""})` : "Preço pago por cota ou ação (R$, só para ações, FIIs e ETFs; vazio = preço de agora)"; $("#f-val").previousElementSibling.textContent = u ? "Valor em reais que você gastou no dólar (R$)" : "Valor investido (R$)"; };
  $("#f-cls")?.addEventListener("change", usdMode); usdMode();
  document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => { editId = b.dataset.edit; re(); setTimeout(() => $("#f-card")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60); }));
  $("#ap")?.addEventListener("change", (e) => { const v = num(e.target.value); if (v != null) setAporteMes(v); re(); });
  $("#ipca")?.addEventListener("change", (e) => { store.set("ipca", num(e.target.value)); re(); });
  if ($("#f-plat")) suggestBox($("#f-plat"));
  $("#f-add")?.addEventListener("click", () => {
    const v = num($("#f-val").value); if (!v || v <= 0) return toast("Digite um valor em R$.");
    const sym = $("#f-sym").value.trim().toUpperCase(), plat = $("#f-plat").value.trim();
    const pos = store.get("posicoes", []), cur = editId ? pos.find((x) => String(x.id) === String(editId)) : null;
    const isUsd = $("#f-cls").value === "usd", symX = isUsd ? "USD" : sym, px = symX ? priceOf(symX) : null, bp = px ? num($("#f-bp").value) || cur?.bp || px : null, clsX = isUsd ? "ext" : $("#f-cls").value;
    if (cur) { Object.assign(cur, { cls: clsX, sym: symX || "", plat, value: v }); if (px) { cur.bp = bp; cur.q = v / bp; } else { delete cur.bp; delete cur.q; } store.set("posicoes", pos); editId = null; toast("Posição atualizada."); return re(); }
    pos.push({ id: Date.now(), cls: clsX, sym: symX || "", plat, value: v, ...(px ? { bp, q: v / bp } : {}) }); store.set("posicoes", pos); toast("Posição salva."); re();
  });
  const auto = () => { const qa = store.get("quiz", {}); if (!QUIZ.every((q) => qa[q.k])) { toast("Responda as 9 perguntas e eu gero as metas."); location.hash = "#/perfil"; return; } store.set("metas", profileOf(qa).alloc); toast("Metas geradas pelo seu perfil."); re(); };
  $("#meta-auto2")?.addEventListener("click", auto);
}

// ------------------------------------------------------------------ SINAIS DA CARTEIRA (hora de comprar e de vender, de acordo com o perfil)
const PROF_TP = [10, 15, 20, 30, 40]; // % de lucro a partir do qual vale realizar parte (ações e ETFs), por perfil
const profIdx = () => { const q = store.get("quiz", {}); return QUIZ.every((x) => q[x.k]) ? profileOf(q).idx : 1; };
function sinais(pos) {
  const idx = profIdx(), tp = PROF_TP[idx], tpF = Math.round(tp * 0.6), cut = idx >= 3 ? 20 : 15, T = { ...DEF_T, ...store.get("metas", {}) }, tsum = Object.values(T).reduce((a, b) => a + b, 0) || 1;
  const { by, total } = totals(pos), regime = D.summary.regime.level, out = [];
  pos.forEach((p) => {
    const a = p.sym === "USD" ? { sym: "USD", p: priceOf("USD"), type: "usd", label: "neutro" } : p.sym && asset(p.sym); if (!a || !a.p) return;
    const gain = p.bp ? a.p / p.bp - 1 : null, lim = a.type === "fii" ? tpF : tp, w = total ? p.value / total : 0;
    if (gain != null && gain * 100 >= lim) out.push({ k: "vender", sym: a.sym, s: `Lucro ${pct(gain)}. Realize uma parte.`, t: `Boa hora de realizar parte: lucro de ${pct(gain)} (para o seu perfil, a partir de +${lim}%).${a.label === "esticada" ? " O preço também está esticado." : ""}` });
    else if (a.label === "esticada" && (gain == null || gain > 0)) out.push({ k: "vender", sym: a.sym, s: "Preço esticado. Realize uma parte.", t: `Preço esticado${gain != null ? ` e lucro de ${pct(gain)}` : ""}: considere realizar uma parte.` });
    if (a.type === "fii" && a.pvp > 1.15) out.push({ k: "vender", sym: a.sym, s: `Cota cara (P/VP ${fN(a.pvp)}). Realize uma parte.`, t: `Cota ${fN((a.pvp - 1) * 100, 0)}% acima do valor patrimonial (P/VP ${fN(a.pvp)}): ágio alto, considere realizar parte.` });
    if (gain != null && gain * 100 <= -cut) out.push({ k: "atencao", sym: a.sym, t: `Queda de ${fN(-gain * 100, 1)}% sobre o que você pagou. Releia por que comprou: se a tese segue valendo, não venda por pânico.` });
    if (a.label === "evitar") out.push({ k: "atencao", sym: a.sym, t: "Está no sinal de evitar: tendência ruim e qualidade menor. Reavalie." });
    if (w > 0.25) out.push({ k: "atencao", sym: a.sym, t: `${fN(w * 100, 0)}% do patrimônio num só ativo: concentração alta, não aporte mais aqui.` });
  });
  CLS.forEach(([k, n]) => { const cur = total ? (by[k] / total) * 100 : 0, tg = (T[k] / tsum) * 100; if (total > 0 && cur > tg + 5) out.push({ k: "atencao", sym: "", t: `${n}: ${fN(cur - tg, 0)} pontos acima da meta. Direcione o próximo aporte para outras classes.` }); });
  if (total > 0 && regime !== "estresse") {
    const done = new Set(); D.assets.filter((a) => a.core && a.label === "oferta").forEach((a) => { const k = a.type === "fii" ? "fii" : a.type === "acao" ? "acao" : "ext", cur = (by[k] / total) * 100, tg = (T[k] / tsum) * 100; if (cur < tg && done.size < 3) { done.add(a.sym); out.push({ k: "comprar", sym: a.sym, s: `R$ ${fN(a.p)} · ${fN(Math.abs(a.dd) * 100, 0)}% abaixo da máxima.`, t: `Oferta: ${a.why.slice(0, 2).join("; ")}. A classe está abaixo da meta (${fN(cur, 0)}% de ${fN(tg, 0)}%).` }); } });
  } else if (total > 0) { const n = D.summary.waiting.length; if (n) out.push({ k: "espera", sym: "", t: `${n} ativos de qualidade estão em espera: o mercado está em estresse. O Alfred avisa quando acalmar.` }); }
  return out;
}
function sinaisCard(pos, compact) {
  if (!pos.length) return compact ? "" : secTitle("Sinais da sua carteira") + `<div class="card"><div class="empty">Cadastre suas posições (com o preço pago) e o Alfred avisa a boa hora de comprar e de vender, de acordo com o seu perfil.</div></div>`;
  const s = sinais(pos), tp = PROF_TP[profIdx()];
  if (!s.length) return compact ? "" : secTitle("Sinais da sua carteira") + `<div class="card"><div style="font-weight:700">Nenhum sinal agora.</div><div class="mut" style="font-size:13px;margin-top:4px;line-height:1.5">Sem lucro para realizar nem oferta nas classes abaixo da meta. Siga o plano e o aporte do mês.</div></div>`;
  const G = [["vender", "Hora de vender (parte)", "down"], ["comprar", "Hora de comprar", "up"], ["atencao", "Atenção", ""], ["espera", "Em espera", ""]];
  return secTitle(`${ic("bell", "sm")} Sinais da sua carteira`) + `<div class="card">${G.map(([k, ti, c]) => { const l = s.filter((x) => x.k === k); return l.length ? `<div style="font-weight:800;margin:6px 0 4px" class="${c}">${ti}</div>${l.map((x) => `<div style="padding:6px 0;line-height:1.45;font-size:14px" ${x.sym && x.sym !== "USD" ? `data-go="#/ativo/${x.sym}" role="link"` : ""}>${x.sym ? `<b>${x.sym}</b> · ` : ""}${esc(x.t)}</div>`).join("")}` : ""; }).join("")}
    <div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Regra do seu perfil: realizar parte (um quarto a um terço) quando uma ação ou ETF ganha +${tp}% sobre o preço pago (FIIs, +${Math.round(tp * 0.6)}%), ou quando o preço está esticado. São regras objetivas, não previsões: quem decide é você.</div></div>`;
}
async function notifySinais() {
  if (!("Notification" in window) || Notification.permission !== "granted" || !D.summary) return;
  const pos = posLive(); if (!pos.length) return;
  const seen = store.get("sinaisVistos", {}), day = todayBRT(), fresh = sinais(pos).filter((x) => ["vender", "comprar"].includes(x.k) && x.sym && seen[x.k + x.sym] !== day);
  if (!fresh.length) return; fresh.forEach((x) => (seen[x.k + x.sym] = day)); store.set("sinaisVistos", seen);
  const reg = await navigator.serviceWorker?.getRegistration();
  fresh.slice(0, 2).forEach((x) => reg?.showNotification(x.k === "vender" ? `Vender parte: ${x.sym}` : `Oferta: ${x.sym}`, { body: x.s || x.t, icon: "icons/icon-192.png", tag: "sinal-" + x.k + x.sym }));
}

// ------------------------------------------------------------------ RECOMENDAÇÃO DO DIA (carteira automática pelo perfil)
const TIT_RF = { selic: "Tesouro Selic", ipca: "Tesouro IPCA+ (vencimento 2032 ou próximo)", cdb: "CDB, LCI ou LCA com liquidez e FGC" };
function planoHoje() {
  const qa = store.get("quiz", {}), pr = profileOf(qa), T = pr.alloc, ap = aporteMes(), pos = posLive();
  const ipcaRate = store.get("ipca", null) ?? D.summary.macro.tesouro?.ipca2032 ?? null;
  const S = suggest(pos, ap, T, ipcaRate), I = suggest(pos, ap, T, ipcaRate, "calmo");
  const split = (sel, amt) => { if (!sel?.length || amt < 1) return []; const ws = sel.map((s) => Math.max(1, asset(s)?.score || 1)), sw = ws.reduce((a, b) => a + b, 0); return sel.map((s, i) => { const a = asset(s), v = (amt * ws[i]) / sw; return { sym: s, a, v, q: Math.floor(v / a.p) }; }); };
  const lines = (O) => CLS.flatMap(([k, n]) => { const v = O.out[k]; if (!(v >= 1)) return []; return RISK.includes(k) ? (O.sel[k]?.length ? split(O.sel[k], v).map((x) => ({ ...x, k })) : [{ k, n, v }]) : [{ k, n: TIT_RF[k], v, note: O.notes[k] }]; });
  const now = lines(S);
  const wait = CLS.flatMap(([k]) => { if (!RISK.includes(k) && k !== "ipca") return []; const w = I.out[k] - S.out[k]; if (!(w >= 1)) return []; return RISK.includes(k) ? (I.sel[k]?.length ? split(I.sel[k], w).map((x) => ({ ...x, k })) : [{ k, n: CLS.find((c) => c[0] === k)[1], v: w }]) : [{ k, n: TIT_RF[k], v: w, note: S.notes[k] }]; });
  return { pr, ap, now, wait, S, ipcaRate };
}
function recLine(x, waiting) {
  const a = x.a, name = x.sym ? `<b>${x.sym}</b> <span class="mut">${esc(a.name)}</span>` : `<b>${esc(x.n)}</b>`;
  const extra = x.sym ? `<div class="mut" style="font-size:12px">${x.q >= 1 ? `≈ ${x.q} ${x.q === 1 ? "cota" : "cotas"} a R$ ${fN(a.p)}` : `1 cota custa R$ ${fN(a.p)}: junte com o próximo aporte`} · nota ${a.score}/100${a.why?.length ? " · " + esc(a.why.slice(0, 2).join("; ")) : ""}</div>` : (x.k && x.k !== "ext" ? `<div class="mut" style="font-size:12px">${esc(whereBuy(x.k))}${x.note ? " · " + esc(x.note) : ""}</div>` : "");
  return `<tr><td style="${x.sym ? "cursor:pointer" : ""}" ${x.sym ? `data-go="#/ativo/${x.sym}"` : ""}>${name}${extra}</td><td class="r num"><b>${fBRL(x.v)}</b></td></tr>`;
}
function vRecomendar() {
  const qa = store.get("quiz", {}), back = `<button class="back" data-go="#/carteira">${ic("back", "sm")} Carteira</button>`;
  if (!QUIZ.every((q) => qa[q.k])) return back + secTitle("O que comprar hoje") + `<div class="card"><div style="line-height:1.5">Para recomendar de acordo com o seu perfil, preciso das suas 9 respostas rápidas.</div><button class="btn" data-go="#/perfil">${ic("user", "sm")} Responder as 9 perguntas</button></div>`;
  const P = planoHoje(), R = REGIME[D.summary.regime.level], tot = P.now.reduce((s, x) => s + x.v, 0);
  return back + secTitle("O que comprar hoje") + `<div class="card"><div style="font-weight:800;font-size:17px">Perfil ${esc(P.pr.name)}</div><div class="mut" style="font-size:13.5px;line-height:1.5;margin-top:4px">${esc(P.pr.desc)}</div><label>Quanto você vai investir neste mês (R$)</label><input id="rec-ap" inputmode="decimal" value="${P.ap}"></div>
  <div class="banner ${D.summary.regime.level}"><b>${R.t}</b><span>${esc(D.summary.regime.why)}. ${R.d}</span></div>
  ${secTitle("Comprar agora")}<div class="card">${P.now.length ? `<table><tr><th>Onde colocar</th><th class="r">Valor</th></tr>${P.now.map((x) => recLine(x)).join("")}<tr><td><b>Total</b></td><td class="r num"><b>${fBRL(tot)}</b></td></tr></table>` : '<div class="empty">Nada a comprar com este valor.</div>'}</div>
  ${P.wait.length ? secTitle("Para comprar quando o mercado acalmar") + `<div class="card"><div class="mut" style="font-size:13px;line-height:1.5;margin-bottom:6px">Estes valores ficam no Tesouro Selic por enquanto. Quando a condição abaixo melhorar, o Alfred avisa e o dinheiro vai para:</div><table>${P.wait.map((x) => recLine(x, true)).join("")}</table></div>` : ""}
  <button class="btn" id="rec-reg">${ic("check", "sm")} Já comprei: registrar na minha carteira</button>
  <p class="warn">Os códigos são os ativos de qualidade com melhor nota do Alfred hoje, nas classes do seu perfil. É material de estudo gerado por regras objetivas, não recomendação personalizada de investimento. Confira preço, taxas e prazos na sua corretora e só registre aqui o que você realmente comprou.</p>`;
}
function bindRecomendar() {
  $("#rec-ap")?.addEventListener("change", (e) => { const v = num(e.target.value); if (v > 0) { setAporteMes(v); render(); } });
  $("#rec-reg")?.addEventListener("click", () => {
    const P = planoHoje(); if (!P.now.length) return;
    if (!confirm(`Registrar ${P.now.length} compras (${fBRL(P.now.reduce((s, x) => s + x.v, 0))}) na sua carteira? Faça isso só depois de comprar de verdade.`)) return;
    const mine = myPlats(), platOf = (k) => mine.find((n) => PLATS.find((p) => p.n === n)?.caps.includes(k)) || mine[0] || "";
    const pos = store.get("posicoes", []);
    P.now.forEach((x) => { const base = { id: Date.now() + Math.floor(Math.random() * 1e6), cls: x.k, sym: x.sym || "", plat: platOf(x.k) }; if (x.sym && x.a) { const q = Math.max(x.q, 0); if (q >= 1) pos.push({ ...base, value: q * x.a.p, bp: x.a.p, q }); } else pos.push({ ...base, value: x.v }); });
    store.set("posicoes", pos); toast("Compras registradas."); location.hash = "#/carteira";
  });
}

// ------------------------------------------------------------------ PERFIL DE INVESTIDOR (questionário)
const QUIZ = [
  { k: "obj", q: "Qual é o seu objetivo principal?", o: [["seg", "Proteger o dinheiro e ficar tranquilo", 0], ["renda", "Receber uma renda todo mês", 1], ["cresc", "Fazer o patrimônio crescer no longo prazo", 2], ["rapido", "Ganhar mais rápido, aceitando oscilar", 3]] },
  { k: "prazo", q: "Daqui a quanto tempo você deve precisar desse dinheiro?", o: [["<1", "Em menos de 1 ano", 0], ["1-3", "Entre 1 e 3 anos", 1], ["3-10", "Entre 3 e 10 anos", 2], [">10", "Mais de 10 anos", 3]] },
  { k: "queda", q: "Seu investimento cai 15% em um mês. O que você faz?", o: [["vende", "Vendo tudo para não perder mais", 0], ["parte", "Vendo uma parte", 1], ["mantem", "Mantenho e espero", 2], ["compra", "Compro mais, está barato", 3]] },
  { k: "perda", q: "Qual a maior perda que você aguenta ver em um ano?", o: [["2", "Até 2%", 0], ["5", "Até 5%", 1], ["10", "Até 10%", 2], ["20", "20% ou mais", 3]] },
  { k: "exp", q: "Qual é a sua experiência com investimentos?", o: [["nenhuma", "Estou começando agora", 0], ["renda", "Já uso poupança, Tesouro ou CDB", 1], ["bolsa", "Já invisto em FIIs ou ações", 2], ["avancado", "Tenho bastante experiência", 3]] },
  { k: "reserva", q: "Você já tem reserva de emergência?", o: [["nao", "Não tenho", 0], ["<3", "Menos de 3 meses de gastos", 1], ["3-6", "De 3 a 6 meses", 2], [">6", "Mais de 6 meses", 3]] },
  { k: "renda", q: "O que você prefere receber?", o: [["mensal", "Renda todo mês (aluguéis de FIIs, dividendos)", 0], ["ambos", "Um pouco dos dois", 0], ["cresc", "Ver o patrimônio crescer, sem renda mensal", 0]] },
  { k: "dep", q: "Você pode precisar desse dinheiro antes do planejado?", o: [["sim", "Sim, é provável", -3], ["talvez", "Talvez", -1], ["nao", "Não", 0]] },
  { k: "ext", q: "E investir fora do Brasil (dólar)?", o: [["nao", "Prefiro só o Brasil", 0], ["pouco", "Um pouco, para me proteger", 0], ["sim", "Sim, gosto de diversificar", 0]] },
];
const PROFILES = [
  { n: "Conservador", d: "Prioriza segurança e liquidez. Aceita render perto do Tesouro Selic.", a: { selic: 55, ipca: 25, cdb: 10, fii: 5, acao: 0, ext: 5 } },
  { n: "Moderado-conservador", d: "Base em renda fixa, com uma parte pequena em FIIs, ações e dólar. É a carteira do estudo de 26/10.", a: { selic: 45, ipca: 26, cdb: 0, fii: 12, acao: 7, ext: 10 } },
  { n: "Moderado", d: "Equilibra renda fixa e renda variável, buscando crescer sem sustos grandes.", a: { selic: 30, ipca: 22, cdb: 5, fii: 18, acao: 15, ext: 10 } },
  { n: "Arrojado", d: "Aceita oscilações fortes em troca de crescimento no longo prazo.", a: { selic: 15, ipca: 18, cdb: 0, fii: 22, acao: 30, ext: 15 } },
  { n: "Agressivo", d: "Foco em crescimento e aceita perdas grandes e temporárias.", a: { selic: 10, ipca: 10, cdb: 0, fii: 25, acao: 40, ext: 15 } },
];
const qList = (v) => (v == null ? [] : [].concat(v));
let quizDraft = { k: "", v: [] }; // opções marcadas na pergunta atual (até 2)
// Cada pergunta aceita até 2 respostas. A pontuação usa a média das duas; os limites de segurança (prazo curto, pouca tolerância, sem reserva, pode precisar do dinheiro) valem se QUALQUER uma delas for marcada.
function profileOf(ans) {
  const L = (k) => qList(ans[k]);
  const sc = (k) => { const q = QUIZ.find((x) => x.k === k), v = L(k).map((o) => q.o.find((x) => x[0] === o)?.[2] ?? 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
  const raw = sc("obj") * 2 + sc("prazo") * 3 + sc("queda") * 2 + sc("perda") * 3 + sc("exp") + sc("reserva") + sc("dep");
  const score = Math.max(0, Math.min(100, Math.round((raw / 36) * 100)));
  let idx = score < 20 ? 0 : score < 40 ? 1 : score < 60 ? 2 : score < 80 ? 3 : 4; const why = [];
  const cap = (max, msg) => { if (idx > max) { idx = max; why.push(msg); } };
  if (L("prazo").includes("<1")) cap(0, "Você precisa do dinheiro em menos de 1 ano: o certo é segurança e liquidez.");
  if (L("perda").includes("2")) cap(0, "Você só tolera perder até 2% no ano.");
  else if (L("perda").includes("5")) cap(1, "Você tolera perder até 5% no ano: limitei a renda variável.");
  else if (L("perda").includes("10")) cap(1, "Você tolera perder até 10% no ano: limitei a renda variável.");
  const semReserva = L("reserva").includes("nao") || L("reserva").includes("<3");
  if (semReserva) cap(2, "Sua reserva de emergência ainda não está completa: complete antes de assumir mais risco.");
  if (L("dep").includes("sim")) cap(1, "Você pode precisar do dinheiro antes: prefira liquidez.");
  const P = PROFILES[idx], al = { ...P.a }, mv = (from, to, n) => { const x = Math.min(n, al[from]); al[from] -= x; al[to] += x; };
  const mensal = L("renda").includes("mensal"), cresc = L("renda").includes("cresc");
  if (mensal && !cresc) mv("acao", "fii", 3); if (cresc && !mensal) mv("fii", "acao", 3);
  const eN = L("ext").includes("nao"), eP = L("ext").includes("pouco"), eS = L("ext").includes("sim");
  if (eN && !eP && !eS) mv("ext", idx <= 1 ? "selic" : "acao", al.ext); else if (eS && !eN) mv("selic", "ext", 3);
  if (L("prazo").includes(">10") && idx >= 2) why.push("Seu prazo é longo: ações e FIIs têm tempo de se recuperar de quedas.");
  if (L("obj").includes("rapido")) why.push("Querer ganhar mais rápido significa aceitar mais oscilação. Não existe retorno alto sem risco e o Alfred não promete isso.");
  if (semReserva) why.push("Primeiro passo: formar a reserva de emergência no Tesouro Selic ou em CDB de liquidez diária.");
  if (L("exp").includes("nenhuma")) why.push("Como você está começando, comece pela renda fixa e entre aos poucos nas demais classes.");
  if (Object.values(ans).some((v) => qList(v).length > 1)) why.push("Você marcou duas opções em algumas perguntas: o perfil considera a média delas e respeita o limite mais cauteloso.");
  return { score, idx, name: P.n, desc: P.d, alloc: al, why };
}
function vPerfil() {
  const ans = store.get("quiz", {}), done = store.get("perfil", null), step = QUIZ.findIndex((q) => !ans[q.k]);
  if (done && step === -1) {
    const r = profileOf(ans);
    return `<button class="back" data-go="#/carteira">${ic("back", "sm")} Carteira</button>${secTitle("Seu perfil de investidor")}
    <div class="card"><div class="big">${r.name}</div><div class="mut" style="font-size:14px;line-height:1.5;margin-top:4px">${esc(r.desc)}</div>
    <div class="bar" style="height:12px;margin-top:14px"><i style="width:${r.score}%;background:linear-gradient(90deg,var(--up),var(--gold),var(--down))"></i></div><div class="cv mut" style="font-size:11px"><span>Segurança</span><span>Pontuação ${r.score}/100</span><span>Crescimento</span></div></div>
    ${secTitle("Carteira sugerida para você")}<div class="card">${CLS.map(([k, n]) => `<div class="alloc"><div class="l"><span>${n}</span><b class="num">${r.alloc[k]}%</b></div><div class="bar"><i style="width:${r.alloc[k]}%"></i></div></div>`).join("")}
    <div class="mut" style="font-size:12.5px;line-height:1.5">Exemplo com R$ 1.000: ${CLS.filter(([k]) => r.alloc[k] > 0).map(([k, n]) => `${n} ${fBRL(r.alloc[k] * 10)}`).join(" · ")}.</div></div>
    ${r.why.length ? secTitle("Por que assim") + `<div class="card">${r.why.map((w) => `<div style="padding:6px 0;line-height:1.45">• ${esc(w)}</div>`).join("")}</div>` : ""}
    <div class="card" style="margin-top:10px"><div class="cv"><div style="font-weight:700">${ic("check", "sm")} Metas da carteira geradas por este perfil</div></div><div class="mut" style="font-size:12.5px;margin-top:4px">Já aplicadas na aba Carteira. Se mudar, toque em “Gerar metas pelo meu perfil” na aba Mais.</div></div>
    <div class="card cta" data-go="#/recomendar" style="margin-top:10px"><div class="cta-i">${ic("target")}</div><div style="flex:1"><div style="font-weight:800;font-size:15px">Quer que eu recomende o que comprar agora?</div><div class="mut" style="font-size:13px;margin-top:3px">O Alfred monta a compra do mês, com os ativos que valem a pena hoje para o seu perfil.</div></div><span class="badge">SIM</span></div>
    <button class="btn ghost" id="q-share">${ic("share", "sm")} Compartilhar com um amigo</button><button class="btn ghost" id="q-redo">Refazer o questionário</button>
    <p class="warn">Questionário de perfil (suitability) simplificado, parecido com o das corretoras. É um ponto de partida para estudo e não substitui orientação de um profissional credenciado. As respostas ficam só neste aparelho.</p>`;
  }
  const i = step === -1 ? 0 : step, q = QUIZ[i];
  if (quizDraft.k !== q.k) quizDraft = { k: q.k, v: [] };
  const sel = quizDraft.v;
  return `<button class="back" data-go="#/carteira">${ic("back", "sm")} Carteira</button>${secTitle(`Pergunta ${i + 1} de ${QUIZ.length}`)}<div class="bar" style="height:6px"><i style="width:${(i / QUIZ.length) * 100}%;background:var(--gold)"></i></div>
  <div class="card" style="margin-top:12px"><div style="font-size:19px;font-weight:800;line-height:1.3;letter-spacing:-.01em;margin-bottom:4px">${q.q}</div><div class="mut" style="font-size:13px;margin-bottom:6px">Marque até 2 opções.</div>${q.o.map((o) => `<button class="btn ghost opt${sel.includes(o[0]) ? " sel" : ""}" data-opt="${q.k}|${o[0]}" style="text-align:left;margin-top:8px;font-weight:700"><span class="ck">${sel.includes(o[0]) ? "✓" : ""}</span><span style="flex:1">${esc(o[1])}</span></button>`).join("")}<button class="btn" id="q-next" ${sel.length ? "" : "disabled"}>${i === QUIZ.length - 1 ? "Ver meu perfil" : "Continuar"}</button></div>${i > 0 ? `<button class="back" id="q-prev">${ic("back", "sm")} Pergunta anterior</button>` : ""}`;
}
function bindPerfil() {
  document.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => {
    const [k, v] = b.dataset.opt.split("|"); if (quizDraft.k !== k) quizDraft = { k, v: [] };
    const d = quizDraft.v, ix = d.indexOf(v);
    if (ix >= 0) d.splice(ix, 1); else if (d.length >= 2) return toast("No máximo 2 opções."); else d.push(v);
    document.querySelectorAll("[data-opt]").forEach((x) => { const on = d.includes(x.dataset.opt.split("|")[1]); x.classList.toggle("sel", on); x.querySelector(".ck").textContent = on ? "✓" : ""; });
    const nx = $("#q-next"); if (nx) nx.disabled = !d.length;
  }));
  $("#q-next")?.addEventListener("click", () => {
    const d = quizDraft.v; if (!d.length) return;
    const a = store.get("quiz", {}); a[quizDraft.k] = [...d]; store.set("quiz", a); quizDraft = { k: "", v: [] };
    if (QUIZ.every((q) => a[q.k])) { store.set("perfil", { at: Date.now() }); store.set("metas", profileOf(a).alloc); toast("Perfil pronto: metas da carteira geradas."); }
    render();
  });
  $("#q-prev")?.addEventListener("click", () => { const a = store.get("quiz", {}), last = [...QUIZ].reverse().find((q) => a[q.k]); if (last) delete a[last.k]; store.set("quiz", a); store.set("perfil", null); render(); });
  $("#q-redo")?.addEventListener("click", () => { store.set("quiz", {}); store.set("perfil", null); render(); });
  $("#q-share")?.addEventListener("click", async () => {
    const r = profileOf(store.get("quiz", {})), text = `Meu perfil de investidor: ${r.name} (${r.score}/100).\nCarteira sugerida: ${CLS.filter(([k]) => r.alloc[k] > 0).map(([k, n]) => `${n} ${r.alloc[k]}%`).join(", ")}.\nFeito no VW Wallet Investments (material de estudo, não é recomendação).`;
    try { if (navigator.share) await navigator.share({ title: "Meu perfil de investidor", text, url: location.origin + location.pathname }); else { await navigator.clipboard.writeText(text + "\n" + location.origin + location.pathname); toast("Texto copiado."); } } catch {}
  });
}

// ------------------------------------------------------------------ MAIS
function vMais() {
  const T = { ...DEF_T, ...store.get("metas", {}) }, b = D.backtest, topic = store.get("ntfy", ""), pl = myPlats();
  let h = secTitle(`${ic("bell", "sm")} Notificações no celular`) + `<div class="card" style="line-height:1.55;font-size:14.5px">Para o VW Wallet avisar com o app fechado:<br>1. Instale o app <b>ntfy</b> (Play Store ou F-Droid).<br>2. Toque em <b>+</b> e assine o tópico secreto abaixo.<br>3. Nos Ajustes do Oppo, deixe o ntfy sem restrição de bateria e com início automático.<label>Seu tópico secreto</label><input id="ntfy" value="${esc(topic)}" placeholder="cole o tópico que o Alfred gerou"><button class="btn ghost" id="ntf-perm">Permitir avisos também aqui no app</button></div>`;
  h += secTitle(`${ic("wallet", "sm")} Minhas plataformas`) + `<div class="card"><div class="chips" id="pl-chips" style="margin:0 0 10px">${pl.map((p) => `<span class="chip on">${esc(p)} <button data-rmpl="${esc(p)}" aria-label="Remover" style="border:0;background:none;color:inherit;font-weight:800;cursor:pointer">×</button></span>`).join("") || '<span class="mut">Nenhuma ainda.</span>'}</div><label>Adicionar plataforma (digite as primeiras letras)</label><div><input id="pl-in" placeholder="ex.: xp, nu, rico, revolut…" autocomplete="off"></div><div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">O app mostra, para cada classe, em quais das suas plataformas dá para comprar. Confirme no app de cada uma: as ofertas mudam.</div></div>`;
  h += secTitle(`${ic("target", "sm")} Metas da carteira (%)`) + `<div class="card"><button class="btn" id="meta-auto" style="margin-top:0">${ic("user", "sm")} Gerar metas pelo meu perfil</button><div class="mut" style="font-size:12px;margin-top:6px">Ou ajuste à mão (a soma vira 100%):</div><div class="grid2">${CLS.map(([k, n]) => `<div><label>${n}</label><input data-meta="${k}" inputmode="decimal" value="${T[k]}"></div>`).join("")}</div><button class="btn ghost" id="meta-save">Salvar metas</button></div>`;
  h += secTitle(`${ic("book", "sm")} O que o histórico mostra`) + `<div class="card" style="font-size:14.5px;line-height:1.55">`;
  if (b) { const p1 = (x) => (x == null ? "—" : fN(x * 100, 1) + "%"); h += `Regra: <i>${esc(b.rule)}</i>.<table style="margin-top:10px"><tr><th></th><th class="r">Com sinal</th><th class="r">Qualquer dia</th></tr><tr><td>6 meses depois (média)</td><td class="r num"><b>${p1(b.h6.avg)}</b></td><td class="r num">${p1(b.h6.base_avg)}</td></tr><tr><td>12 meses depois (média)</td><td class="r num"><b>${p1(b.h12.avg)}</b></td><td class="r num">${p1(b.h12.base_avg)}</td></tr><tr><td>Acerto em 12 meses</td><td class="r num"><b>${p1(b.h12.hit)}</b></td><td class="r"></td></tr></table><div class="mut" style="font-size:12.5px;margin-top:10px">${b.tickers} ativos de qualidade, 10 anos, preços ajustados por dividendos. A vantagem é pequena (2 a 3 pontos) e há viés: só entram ativos que sobreviveram, e sinais próximos se sobrepõem. O CDI não foi descontado. É um estudo, não uma promessa.</div>`; } else h += `<span class="mut">Estudo ainda não gerado.</span>`;
  h += `</div>` + secTitle(`${ic("shield", "sm")} Como o Alfred decide`) + `<div class="card" style="font-size:14.5px;line-height:1.6"><b>Oferta</b>: ativo de qualidade, 15% ou mais abaixo da máxima de 12 meses (FIIs, 8%), RSI baixo e sem tendência desastrosa.<br><b>Em espera</b>: boa oferta, mas o Ibovespa caiu forte: ele espera o mercado acalmar.<br><b>Esticada</b>: RSI alto e muito acima da média de 200 dias: pense em realizar parte.<br><b>Evitar</b>: queda enorme em ativo fora da lista de qualidade.<br>Ele só avisa no celular de ofertas fortes, no máximo 3 por vez, e não à noite.</div>`;
  h += X.maisExtras();
  h += secTitle(`${ic("book", "sm")} Dicionário do investidor`) + `<div class="card"><input id="dic-q" placeholder="Buscar: CDB, Selic, FII, RSI…" autocomplete="off"><div id="dic-list" style="margin-top:8px">${vDicionario()}</div></div>`;
  h += secTitle(`${ic("shield", "sm")} Meus dados e backup`) + dados.dadosCard();
  h += `<div class="about"><img src="icons/logo.svg" alt="" width="44" height="44"><div><b>VW Wallet Investments</b><div class="mut" style="font-size:12px">Versão 1.2 · feito para o Senhor Wayne</div></div></div><p class="warn">O Alfred é uma ferramenta de estudo. Não é recomendação personalizada nem substitui um profissional credenciado. Preços e dividendos vêm de fontes públicas com atraso e podem ter erros. Regras de imposto podem mudar. A decisão é sempre sua.</p>`;
  return h;
}
function bindMais() {
  X.bindMaisExtras(render);
  $("#ntfy")?.addEventListener("change", (e) => store.set("ntfy", e.target.value.trim()));
  $("#dic-q")?.addEventListener("input", (e) => { $("#dic-list").innerHTML = vDicionario(e.target.value); });
  $("#dic-list")?.addEventListener("click", (e) => { if (e.target.id === "dic-more") $("#dic-list").innerHTML = vDicionario("", true); });
  if ($("#pl-in")) suggestBox($("#pl-in"), (n) => { const pl = myPlats(); if (!pl.includes(n)) { pl.push(n); store.set("plats", pl); } render(); toast(n + " adicionada."); });
  document.querySelectorAll("[data-rmpl]").forEach((b) => b.addEventListener("click", () => { store.set("plats", myPlats().filter((p) => p !== b.dataset.rmpl)); render(); }));
  $("#meta-save")?.addEventListener("click", () => { const m = {}; document.querySelectorAll("[data-meta]").forEach((i) => (m[i.dataset.meta] = num(i.value) ?? 0)); store.set("metas", m); toast("Metas salvas."); });
  $("#ntf-perm")?.addEventListener("click", async () => { if (!("Notification" in window)) return toast("Este navegador não suporta avisos."); const r = await Notification.requestPermission(); toast(r === "granted" ? "Avisos liberados." : "Avisos não liberados."); });
  dados.bindDados(render);
  $("#meta-auto")?.addEventListener("click", () => { const qa = store.get("quiz", {}); if (!QUIZ.every((q) => qa[q.k])) { toast("Responda as 9 perguntas e eu gero as metas."); location.hash = "#/perfil"; return; } store.set("metas", profileOf(qa).alloc); toast("Metas geradas pelo seu perfil."); render(); });
}

// ------------------------------------------------------------------ BUSCA GLOBAL (como nos apps de corretora)
let sType = "todos";
function openSearch() { const o = $("#search"); o.classList.add("on"); document.body.classList.add("noscroll"); $("#sq").value = ""; renderSearch(); setTimeout(() => $("#sq").focus(), 60); }
function closeSearch() { $("#search").classList.remove("on"); document.body.classList.remove("noscroll"); $("#sq").blur(); }
function renderSearch() {
  const q = nrm($("#sq").value), fav = favs();
  document.querySelectorAll("#s-chips button").forEach((b) => b.classList.toggle("on", b.dataset.st === sType));
  let list = D.assets.filter((a) => (sType === "todos" || (sType === "fav" ? fav.has(a.sym) : a.type === sType)) && (!q || nrm(a.sym).includes(q) || nrm(a.name).includes(q) || nrm(a.sector).includes(q)));
  list.sort((a, b) => { const sa = nrm(a.sym).startsWith(q) ? 0 : nrm(a.name).startsWith(q) ? 1 : 2, sb = nrm(b.sym).startsWith(q) ? 0 : nrm(b.name).startsWith(q) ? 1 : 2; return sa - sb || b.score - a.score; });
  const recent = store.get("recent", []).map(asset).filter(Boolean);
  $("#s-res").innerHTML = (!q && sType === "todos" && recent.length ? `<h2 style="margin-top:6px"><span>Buscados recentemente</span></h2><div class="card">${recent.slice(0, 4).map((a) => row(a)).join("")}</div><h2><span>Todos</span></h2>` : "") + `<div class="card">${list.slice(0, 40).map((a) => row(a)).join("") || '<div class="empty">Nenhum ativo encontrado. O Alfred vigia ações, FIIs e ETFs de qualidade da B3.</div>'}</div>`;
  hydrate($("#s-res"));
}

// ------------------------------------------------------------------ roteador
async function render() {
  const view = $("#view"), hash = location.hash || "#/hoje", [, route, arg] = hash.split("/");
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === (route === "ativo" || route === "indice" ? "hoje" : route === "perfil" || route === "recomendar" ? "carteira" : route === "ferramentas" || route === "aprender" ? "mais" : route)));
  if (!D.summary) { view.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; return; }
  const s = D.summary; $("#upd").textContent = `Investments · ${ago(s.updated)}`;
  const rg = $("#regime"); rg.className = "pill " + s.regime.level; rg.textContent = REGIME[s.regime.level].p;
  if (route === "ativo") {
    view.innerHTML = await vAtivo(arg); hydrate(view); drawChart(arg);
    view.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { range = b.dataset.range; store.set("range", range); view.querySelectorAll("[data-range]").forEach((x) => x.classList.toggle("on", x === b)); drawChart(arg); }));
    $("#fav-btn")?.addEventListener("click", () => { toggleFav(arg); render(); toast(favs().has(arg) ? "Adicionado aos favoritos." : "Removido dos favoritos."); });
    $("#al-btn")?.addEventListener("click", () => { const p = $("#al-panel"); p.style.display = p.style.display === "none" ? "block" : "none"; });
    $("#al-save")?.addEventListener("click", () => { const v = num($("#al-price").value); if (!v) return toast("Digite o preço do alerta."); const al = alerts(); al.push({ id: Date.now(), sym: arg, dir: $("#al-dir").value, price: v, done: false }); store.set("alertas", al); toast("Alerta criado."); render(); });
    document.querySelectorAll("[data-delal]").forEach((b) => b.addEventListener("click", () => { store.set("alertas", alerts().filter((x) => String(x.id) !== b.dataset.delal)); render(); }));
    $("#addpos")?.addEventListener("click", () => { const a = asset(arg); store.set("prefill", { sym: a.sym, type: a.type }); location.hash = "#/carteira"; });
    const rc = store.get("recent", []).filter((x) => x !== arg); rc.unshift(arg); store.set("recent", rc.slice(0, 8));
  } else if (route === "perfil") { view.innerHTML = vPerfil(); bindPerfil(); }
  else if (route === "indice") {
    view.innerHTML = vIndice(arg); drawChart(arg, IDX[arg]);
    $("#idx-back")?.addEventListener("click", () => history.back());
    view.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { range = b.dataset.range; view.querySelectorAll("[data-range]").forEach((x) => x.classList.toggle("on", x === b)); drawChart(arg, IDX[arg]); }));
  }
  else if (route === "recomendar") { view.innerHTML = vRecomendar(); bindRecomendar(); }
  else if (route === "mercado") { view.innerHTML = vMercado(); hydrate(view);
    view.querySelectorAll("[data-mk]").forEach((b) => b.addEventListener("click", () => { mkTab = b.dataset.mk; render(); }));
    view.querySelectorAll("[data-mt]").forEach((b) => b.addEventListener("click", () => { mkType = b.dataset.mt; store.set("mkType", mkType); render(); }));
    $("#mk-sort")?.addEventListener("change", (e) => { mkSort = e.target.value; store.set("mkSort", mkSort); render(); });
    $("#mk-more")?.addEventListener("click", () => { mkAll = true; render(); }); }
  else if (route === "noticias") { await ensureNews(); view.innerHTML = vNoticias(); view.querySelectorAll("[data-nw]").forEach((b) => b.addEventListener("click", () => { nwTab = b.dataset.nw; render(); })); }
  else if (route === "carteira") { view.innerHTML = vCarteira(); hydrate(view); bindCarteira();
    view.querySelectorAll("[data-pv]").forEach((b) => b.addEventListener("click", () => { pieView = b.dataset.pv; render(); }));
    view.querySelectorAll("[data-pm]").forEach((b) => b.addEventListener("click", () => { pieMode = b.dataset.pm; store.set("pieMode", pieMode); render(); }));
    view.querySelectorAll("[data-pf]").forEach((b) => b.addEventListener("click", () => { platFilter = b.dataset.pf; render(); }));
    view.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { if (confirm("Excluir esta posição?")) { store.set("posicoes", store.get("posicoes", []).filter((p) => String(p.id) !== b.dataset.del)); render(); } })); }
  else if (route === "ferramentas") { view.innerHTML = X.vFerramentas(); X.bindFerramentas(); }
  else if (route === "aprender") { view.innerHTML = X.vAprender(); X.bindAprender(render); }
  else if (route === "mais") { view.innerHTML = vMais(); bindMais(); }
  else { view.innerHTML = vHoje(); hydrate(view); X.bindHoje(render); dados.bindBanner(); }
  annotate(view);
  view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter");
  window.scrollTo(0, 0);
}

const X = makeExtras({ getD: () => D, aporteMes, store, esc, fN, fBRL, secTitle, ic, num, toast, CLS, CLS_COLOR, totals, todayBRT });
const dados = makeDados({ store, toast, ic });
let timer = null, lastRefresh = 0;
const startTimer = () => { clearInterval(timer); timer = setInterval(refresh, 15 * 60 * 1000); };
function boot() {
  X.initLock(); dados.persist();
  // logos que não existem somem sem precisar de código dentro do HTML (permite política de segurança estrita)
  document.addEventListener("error", (e) => { if (e.target?.tagName === "IMG" && e.target.closest?.(".logo")) e.target.remove(); }, true);
  $("#tabs").innerHTML = [["hoje", "home", "Hoje"], ["mercado", "chart", "Mercado"], ["noticias", "news", "Notícias"], ["carteira", "wallet", "Carteira"], ["mais", "grid", "Mais"]].map(([k, i, t], n) => `<button data-tab="${k}" class="${n === 0 ? "on" : ""}">${ic(i)}<span>${t}</span><span class="pip"></span></button>`).join("");
  $("#btn-search").innerHTML = ic("search");
  $("#s-back").innerHTML = ic("back");
  $("#sh-close").addEventListener("click", closeTerm); $("#sheet .bk").addEventListener("click", closeTerm);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeTerm(); closeSearch(); } if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".q")) { e.preventDefault(); openTerm(e.target.dataset.term); } });
  document.addEventListener("click", (e) => {
    const q = e.target.closest(".q"); if (q) { e.preventDefault(); e.stopPropagation(); openTerm(q.dataset.term); return; }
    const ot = e.target.closest("[data-opent]"); if (ot) { openTerm(ot.dataset.opent); return; }
    const g = e.target.closest("[data-go]");
    if (g) { e.preventDefault(); if (g.dataset.go !== location.hash) { closeSearch(); location.hash = g.dataset.go; } else render(); return; }
    const t = e.target.closest("#tabs button"); if (t) location.hash = "#/" + t.dataset.tab;
  });
  $("#btn-search").addEventListener("click", openSearch); $("#s-back").addEventListener("click", closeSearch);
  $("#sq").addEventListener("input", renderSearch);
  document.querySelectorAll("#s-chips button").forEach((b) => b.addEventListener("click", () => { sType = b.dataset.st; renderSearch(); }));
  $("#brand").addEventListener("click", () => (location.hash = "#/hoje"));
  window.addEventListener("hashchange", () => { closeSearch(); closeTerm(); render(); });
  $("#upd").addEventListener("click", () => refresh(true));
  if (navigator.serviceWorker) navigator.serviceWorker.register("sw.js").catch(() => {});
  restoreSnap(); render(); refresh(); startTimer();
  // economia de bateria: com o app em segundo plano não há consulta nenhuma; ao voltar, atualiza se os dados têm mais de 5 minutos
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInterval(timer); else { if (Date.now() - lastRefresh > 5 * 60 * 1000) refresh(); startTimer(); } });
}
async function notifyNew() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const seen = store.get("vistas", []), now = D.summary.offers.map((o) => o.sym), fresh = now.filter((x) => !seen.includes(x)); store.set("vistas", now);
  const reg = await navigator.serviceWorker?.getRegistration();
  fresh.slice(0, 2).forEach((sym) => { const a = asset(sym); reg?.showNotification(`Oferta: ${sym}`, { body: `R$ ${fN(a.p)} · ${fN(Math.abs(a.dd) * 100, 0)}% abaixo da máxima · nota ${a.score}/100`, icon: "icons/icon-192.png", tag: "oferta-" + sym }); });
}
async function refresh(manual) {
  try {
    const changed = await load(manual); lastRefresh = Date.now(); await checkAlerts();
    const busy = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if ((changed || manual || !$("#view").children.length) && !busy) await render();
    notifyNew(); notifySinais(); if (manual) toast("Atualizado.");
  } catch { $("#upd").textContent = "Sem conexão · último dado salvo"; }
}
boot();
