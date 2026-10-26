// Estudo histórico das regras de "oferta" (10 anos, preços ajustados por dividendos, só ativos core).
// Mostra o que as regras teriam feito. NÃO é promessa: passado não garante futuro e há viés (só quem sobreviveu).
import fs from "node:fs/promises";
import path from "node:path";
import { UNIVERSE, toYahoo } from "./universe.mjs";

const OUT = path.join(path.resolve(import.meta.dirname, ".."), "docs", "data");
const UA = "Mozilla/5.0 (compatible; AlfredCarteira/1.0)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function adj(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1d&events=div`, { headers: { "User-Agent": UA } });
  const j = await r.json();
  const x = j.chart.result[0];
  const ts = x.timestamp, cl = x.indicators.quote[0].close, ad = x.indicators.adjclose?.[0]?.adjclose || cl;
  const out = [];
  for (let i = 0; i < ts.length; i++) if (cl[i] != null && ad[i] != null) out.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c: cl[i], a: ad[i] });
  return out;
}
function rsiSeries(c, n = 14) {
  const out = new Array(c.length).fill(null);
  if (c.length < n + 2) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; d > 0 ? (g += d) : (l -= d); }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

const stats = (arr, base) => ({ n: arr.length, avg: avg(arr), median: med(arr), hit: arr.length ? arr.filter((x) => x > 0).length / arr.length : null, base_avg: avg(base) });
const res = { updated: new Date().toISOString().slice(0, 10), rule: "preço ≥15% abaixo da máxima de 12 meses (FII: ≥8%), RSI14 ≤ 35 e preço no máximo 30% abaixo da média de 200 dias; sinais espaçados em pelo menos 21 pregões", tickers: 0, bytype: {}, h6: null, h12: null };
const sig = { acao: { h6: [], h12: [] }, fii: { h6: [], h12: [] }, etf: { h6: [], h12: [] } };
const base = { acao: { h6: [], h12: [] }, fii: { h6: [], h12: [] }, etf: { h6: [], h12: [] } };

for (const u of UNIVERSE.filter((x) => x.core)) {
  try {
    const d = await adj(toYahoo(u));
    if (d.length < 600) continue;
    res.tickers++;
    const c = d.map((x) => x.c), a = d.map((x) => x.a), r = rsiSeries(c);
    let last = -100;
    for (let i = 252; i < d.length; i++) {
      for (const [h, key] of [[126, "h6"], [252, "h12"]]) if (i + h < d.length && i % 5 === 0) base[u.type][key].push(a[i + h] / a[i] - 1);
      const hi = Math.max(...c.slice(i - 251, i + 1));
      const dd = c[i] / hi - 1;
      let s200 = 0; if (i >= 200) { for (let k = i - 199; k <= i; k++) s200 += c[k]; s200 /= 200; }
      const ok = dd <= (u.type === "fii" ? -0.08 : -0.15) && r[i] != null && r[i] <= 35 && s200 && c[i] / s200 - 1 >= -0.3;
      if (ok && i - last >= 21) {
        last = i;
        if (i + 126 < d.length) sig[u.type].h6.push(a[i + 126] / a[i] - 1);
        if (i + 252 < d.length) sig[u.type].h12.push(a[i + 252] / a[i] - 1);
      }
    }
  } catch (e) { console.log("falhou", u.sym, e.message); }
  await sleep(300);
}
for (const t of Object.keys(sig)) res.bytype[t] = { h6: stats(sig[t].h6, base[t].h6), h12: stats(sig[t].h12, base[t].h12) };
const all = (k, o) => Object.values(o).flatMap((x) => x[k]);
res.h6 = stats(all("h6", sig), all("h6", base));
res.h12 = stats(all("h12", sig), all("h12", base));
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, "backtest.json"), JSON.stringify(res, null, 1));
const pc = (x) => (x == null ? "-" : (x * 100).toFixed(1) + "%");
console.log("tickers:", res.tickers);
for (const k of ["h6", "h12"]) console.log(k, "sinais:", res[k].n, "| média", pc(res[k].avg), "| mediana", pc(res[k].median), "| acerto", pc(res[k].hit), "| base (qualquer dia)", pc(res[k].base_avg));
for (const t of Object.keys(res.bytype)) console.log(" ", t, "h6", res.bytype[t].h6.n, pc(res.bytype[t].h6.avg), "base", pc(res.bytype[t].h6.base_avg), "| h12", res.bytype[t].h12.n, pc(res.bytype[t].h12.avg), "base", pc(res.bytype[t].h12.base_avg));
