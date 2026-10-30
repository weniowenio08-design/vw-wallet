// Tela "Patrimônio": painel único com evolução mês a mês, preço médio, rentabilidade, proventos, vencimentos, rebalanceamento,
// meta com prazo, independência financeira, cenários de estresse, exposição ao dólar, diário de decisões, lista de desejos,
// comparador de corretoras e relatório anual. Os cálculos ficam em invest.js (testado); aqui só há tela e estado.
// Chaves novas no store: pat_aba, pat_snap, pat_bens, pat_meta, pat_fi, pat_diario, pat_corr, pat_avisado, pat_cen.
import { saldoConta, sobraDoMes } from "./gastos-plus.js";
import { summarize, ymAdd, fBRL, ymLabel, dBR, num as numCore } from "./gastos-core.js";
import { precoMedio, aportesPorMes, rentabilidade, proventos, vencimentos, rebalancear, estresse, CENARIOS, independencia, metaComPrazo, exposicaoDolar, revisoesDevidas, resultadoDecisao, registraSnapshot, evolucaoMensal, patrimonioTotal } from "./invest.js";
import { relatorioCarteiraPdf } from "./relatorio-carteira.js";

const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ABAS = [["visao", "Visão"], ["retorno", "Retorno"], ["planejar", "Planejar"], ["riscos", "Riscos"], ["diario", "Diário"]];

export function makePatrimonio(c) {
  const { store, esc, ic, secTitle, toast, fN } = c;
  const st = { aba: store.get("pat_aba", "visao"), ibov: undefined, carregando: false };
  let rerender = () => {};
  const hoje = () => c.todayBRT();
  const pct = (x, d = 1) => (x == null ? "—" : (x >= 0 ? "+" : "") + fN(x * 100, d) + "%");
  const cor = (x) => (x >= 0 ? "up" : "down");
  const pos = () => c.posLive();
  const nomePos = (p) => (p.sym === "USD" ? "Dólar" : p.sym || c.CLS.find((k) => k[0] === p.cls)?.[1] || "Posição");
  const gastosL = () => store.get("gastos", []);
  const caixa = () => { const sd = store.get("gastos_saldos", {}), L = gastosL(); return ["p", "e"].reduce((s, k) => s + (sd[k] ? saldoConta(L, k, sd[k]) || 0 : 0), 0); };
  const bensL = () => store.get("pat_bens", []);
  const partes = () => { const b = bensL(); return { invest: c.totals(pos()).total, caixa: caixa(), bens: b.filter((x) => x.tp !== "divida").reduce((s, x) => s + x.valor, 0), dividas: b.filter((x) => x.tp === "divida").reduce((s, x) => s + x.valor, 0) }; };
  const macro = () => c.getD().summary?.macro || {};

  // ------------------------------------------------------------ registro diário e avisos
  function registra() {
    const p = partes(); if (!(p.invest || p.caixa || p.bens || p.dividas)) return;
    const snaps = store.get("pat_snap", []), ult = snaps.at(-1);
    if (ult && ult.dt === hoje() && ult.total === patrimonioTotal(p)) return;
    store.set("pat_snap", registraSnapshot(snaps, hoje(), p));
  }
  function avisos() {
    const out = [];
    vencimentos(pos(), hoje()).filter((x) => x.nivel === "vencido" || x.nivel === "urgente").forEach((x) => out.push(x.nivel === "vencido" ? `${nomePos(x)} venceu em ${dBR(x.venc)}` : `${nomePos(x)} vence ${x.dias === 0 ? "hoje" : "em " + x.dias + " dia" + (x.dias === 1 ? "" : "s")}`));
    revisoesDevidas(store.get("pat_diario", []), hoje()).slice(0, 3).forEach((r) => out.push(`Revise sua decisão de ${r.marco} meses atrás: ${r.sym || "decisão"} (${dBR(r.dt)})`));
    return out;
  }
  /** Cartão para a tela Hoje: só aparece se houver algo vencendo ou uma revisão a fazer. */
  function avisosHoje() {
    const a = avisos(); if (!a.length) return "";
    return `<div class="card cta" data-go="#/patrimonio" style="border-left:4px solid var(--gold)"><div class="cta-i">${ic("wallet")}</div><div style="flex:1"><div style="font-weight:800">Atenção no patrimônio</div><div class="mut" style="font-size:13px;margin-top:2px;line-height:1.45">${a.slice(0, 3).map(esc).join("<br>")}</div></div><span class="badge">VER</span></div>`;
  }
  async function notifica() {
    const a = avisos(); if (!a.length || store.get("pat_avisado", "") === hoje()) return; store.set("pat_avisado", hoje());
    try { if (typeof Notification !== "undefined" && Notification.permission === "granted") (await navigator.serviceWorker.getRegistration())?.showNotification("Patrimônio: atenção", { body: a.slice(0, 3).join(" · "), icon: "icons/icon-192.png", tag: "patrimonio" }); } catch {}
  }

  // ------------------------------------------------------------ VISÃO
  function grafico(ev) {
    if (ev.length < 2) return `<div class="mut" style="font-size:13px;margin-top:10px;line-height:1.45">A evolução começa a ser registrada hoje. Abra o app de vez em quando: o gráfico aparece quando houver dois meses.</div>`;
    const L = ev.slice(-12), mx = Math.max(1, ...L.map((x) => Math.max(0, x.total))), W = 340, passo = (W - 16) / L.length, bw = Math.min(24, passo - 6);
    const barras = L.map((x, i) => { const h = (Math.max(0, x.total) / mx) * 88, px = 8 + i * passo + (passo - bw) / 2; return `<rect x="${px.toFixed(1)}" y="${(104 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="3" style="fill:var(--gold)"/><text x="${(px + bw / 2).toFixed(1)}" y="121" text-anchor="middle" font-size="9" style="fill:var(--mut)">${MES3[+x.ym.slice(5) - 1]}</text>`; }).join("");
    return `<svg viewBox="0 0 ${W} 128" width="100%" role="img" aria-label="Patrimônio mês a mês" style="margin-top:10px">${barras}</svg>` + ev.slice(-6).reverse().map((x) => `<div class="gc-h"><span>${esc(MES3[+x.ym.slice(5) - 1])}/${x.ym.slice(2, 4)}</span><b class="num">${fBRL(x.total)} ${x.delta == null ? "" : `<small class="${cor(x.delta)}">${x.delta >= 0 ? "+" : "−"}${fBRL(Math.abs(x.delta))}</small>`}</b></div>`).join("");
  }
  function bensCard() {
    const B = bensL();
    return secTitle(`${ic("grid", "sm")} Outros bens e dívidas`) + `<div class="card">${B.length ? B.map((b) => `<div class="gl"><div class="gl-m"><div class="gl-d">${esc(b.nome)}</div><div class="mut gl-s">${b.tp === "divida" ? "Dívida" : "Bem"}</div></div><div class="num gl-v ${b.tp === "divida" ? "down" : ""}">${b.tp === "divida" ? "−" : ""}${fBRL(b.valor)}</div><button class="icbtn" data-pbrm="${esc(String(b.id))}" aria-label="Remover">${ic("trash", "sm")}</button></div>`).join("") : `<div class="mut" style="font-size:13px;margin-bottom:6px">Opcional: a granja, um terreno, um veículo, um financiamento. Entram no patrimônio total.</div>`}<details style="margin-top:6px"><summary>Adicionar um bem ou dívida</summary><div class="grid2"><div><label>Nome</label><input id="pb-n" placeholder="ex.: Galpão 2"></div><div><label>Valor (R$)</label><input id="pb-v" inputmode="decimal" placeholder="ex.: 250 mil"></div></div><label>Tipo</label><select id="pb-t"><option value="bem">Bem (soma)</option><option value="divida">Dívida (subtrai)</option></select><button class="btn" id="pb-add">Adicionar</button></details></div>`;
  }
  function precoMedioCard() {
    const pm = precoMedio(pos(), (s) => c.priceOf(s)), ap = aportesPorMes(pos());
    let h = secTitle(`${ic("chart", "sm")} Preço médio por ativo`) + `<div class="card">`;
    h += pm.length ? `<table><tr><th>Ativo</th><th class="r">Qtd</th><th class="r">Médio</th><th class="r">Hoje</th><th class="r">Resultado</th></tr>${pm.map((x) => `<tr><td><b>${esc(x.sym === "USD" ? "Dólar" : x.sym)}</b>${x.lotes > 1 ? `<div class="mut" style="font-size:11.5px">${x.lotes} compras${x.desde ? " desde " + dBR(x.desde) : ""}</div>` : ""}</td><td class="r num">${fN(x.q, x.q % 1 ? 2 : 0)}</td><td class="r num">${x.pm != null ? fBRL(x.pm) : "—"}</td><td class="r num">${x.px != null ? fBRL(x.px) : "—"}</td><td class="r num ${x.pct != null ? cor(x.pct) : ""}">${x.pct != null ? pct(x.pct) : "—"}</td></tr>`).join("")}</table>` : `<div class="mut" style="font-size:13px">Cadastre posições de ações, FIIs ou ETFs na aba Carteira, com o preço pago, e o preço médio aparece aqui.</div>`;
    if (ap.meses.length) h += `<div class="mut" style="font-size:12.5px;margin:12px 0 4px;font-weight:700">Aportes por mês</div>` + ap.meses.slice(-6).reverse().map((m) => `<div class="gc-h"><span>${esc(MES3[+m.ym.slice(5) - 1])}/${m.ym.slice(2, 4)}</span><b class="num">${fBRL(m.v)}</b></div>`).join("");
    if (ap.semData) h += `<div class="mut" style="font-size:12px;margin-top:6px">${fBRL(ap.semData)} em posições sem data de compra (edite na Carteira para entrar no histórico).</div>`;
    return h + "</div>";
  }
  function vencCard() {
    const v = vencimentos(pos(), hoje());
    return secTitle(`${ic("calendar", "sm")} Vencimentos de Tesouro e CDB`) + `<div class="card">${v.length ? v.map((x) => `<div class="gl"><div class="gl-m"><div class="gl-d">${esc(nomePos(x))}${x.plat ? ` <small class="mut">${esc(x.plat)}</small>` : ""}</div><div class="mut gl-s"><span class="${x.nivel === "vencido" || x.nivel === "urgente" ? "down" : ""}">${x.nivel === "vencido" ? "venceu em " + dBR(x.venc) : x.dias === 0 ? "vence hoje" : "vence em " + x.dias + " dia" + (x.dias === 1 ? "" : "s") + " (" + dBR(x.venc) + ")"}</span></div></div><div class="num gl-v">${fBRL(x.valor)}</div></div>`).join("") : `<div class="mut" style="font-size:13px;line-height:1.5">Nenhum vencimento cadastrado. Ao adicionar ou editar uma posição de Tesouro ou CDB, informe a data de vencimento: o app avisa quando estiver perto.</div>`}</div>`;
  }
  function visao() {
    const p = partes(), ev = evolucaoMensal(store.get("pat_snap", []));
    return secTitle(`${ic("wallet", "sm")} Patrimônio total`) + `<div class="card"><div class="big num">${fBRL(patrimonioTotal(p))}</div><div class="mut" style="font-size:13px;margin-top:4px;line-height:1.5">Investimentos ${fBRL(p.invest)}${p.caixa ? " · Em conta " + fBRL(p.caixa) : ""}${p.bens ? " · Bens " + fBRL(p.bens) : ""}${p.dividas ? " · Dívidas −" + fBRL(p.dividas) : ""}</div>${grafico(ev)}</div>` + bensCard() + precoMedioCard() + vencCard();
  }

  // ------------------------------------------------------------ RETORNO
  function rentCard() {
    const m = macro();
    if (st.ibov === undefined && !st.carregando) { st.carregando = true; fetch("data/series/ibov.json").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => { st.ibov = j; st.carregando = false; if (location.hash === "#/patrimonio") rerender(); }); }
    const r = rentabilidade(pos(), { hoje: hoje(), cdi: m.cdi, ipca12: m.ipca12, ibov: st.ibov || undefined });
    let h = secTitle(`${ic("chart", "sm")} Rentabilidade contra os índices`) + `<div class="card">`;
    if (!r.geral) return h + `<div class="mut" style="font-size:13.5px;line-height:1.55">Para comparar com CDI, IPCA e Ibovespa o app precisa da <b>data de compra</b> de cada posição. Edite as posições na aba Carteira e preencha a data${r.semBase ? ` (${r.semBase} sem data ou sem base)` : ""}. Em CDB e Tesouro, informe também a taxa.</div></div>`;
    const g = r.geral, linha = (nome, v, ref) => `<div class="gc-h"><span>${nome}</span><b class="num">${pct(v)}${v != null && ref != null && nome !== "Sua carteira" ? ` <small class="${cor(ref - v)}">(${g.ret - v >= 0 ? "você +" : "você −"}${fN(Math.abs(g.ret - v) * 100, 1)} p.p.)</small>` : ""}</b></div>`;
    h += `<div class="big num ${cor(g.ret)}">${pct(g.ret)}</div><div class="mut" style="font-size:12.5px;margin-bottom:8px">média ponderada de ${g.n} ${g.n > 1 ? "posições" : "posição"} (${fBRL(g.inv)} investidos), do dia da compra até hoje</div>${linha("CDI no mesmo período (estimado)", g.cdi, g.ret)}${linha("IPCA no mesmo período (estimado)", g.ipca, g.ret)}${linha("Ibovespa no mesmo período", g.ibov, g.ret)}`;
    h += `<table style="margin-top:10px"><tr><th>Posição</th><th class="r">Desde</th><th class="r">Retorno</th><th class="r">vs CDI</th></tr>${r.lotes.map((l) => `<tr><td><b>${esc(l.sym || c.CLS.find((k) => k[0] === l.cls)?.[1] || "")}</b>${l.estimado ? '<div class="mut" style="font-size:11.5px">estimado pela taxa</div>' : ""}</td><td class="r num">${dBR(l.dt).slice(0, 5)}/${l.dt.slice(2, 4)}</td><td class="r num ${cor(l.ret)}">${pct(l.ret)}</td><td class="r num ${l.cdi != null ? cor(l.ret - l.cdi) : ""}">${l.cdi != null ? pct(l.ret - l.cdi) : "—"}</td></tr>`).join("")}</table>`;
    return h + `<div class="mut" style="font-size:12px;margin-top:10px;line-height:1.5">O app não guarda o histórico do CDI nem do IPCA: os dois são calculados com a taxa de hoje, como estimativa. O Ibovespa usa a série real. Ações e FIIs não incluem dividendos recebidos. Passado não garante futuro.${r.semBase ? ` ${r.semBase} posição(ões) ficaram de fora por falta de data ou de taxa.` : ""}</div></div>`;
  }
  function provCard() {
    const pv = proventos(pos(), c.getD().assets, hoje());
    let h = secTitle(`${ic("down", "sm")} Proventos (dividendos e rendimentos)`) + `<div class="card">`;
    if (!pv.recebidos && !pv.semData && !pv.proximos.length) return h + `<div class="mut" style="font-size:13.5px;line-height:1.55">Sem proventos para mostrar. Cadastre ações e FIIs com data de compra e quantidade: o app soma o que foi pago depois da compra e projeta os próximos meses pelo que cada ativo pagou no ano passado.</div></div>`;
    h += `<div class="grid2"><div class="stat"><small>Recebidos (estimado)</small><b class="num up">${fBRL(pv.recebidos)}</b></div><div class="stat"><small>Média por mês</small><b class="num">${fBRL(pv.mediaMensal)}</b></div></div>`;
    if (pv.meses.length) { const L = pv.meses.slice(-6), mx = Math.max(1, ...L.map((m) => m.v)); h += `<div style="margin-top:10px">${L.map((m) => `<div class="gc-h"><span>${esc(MES3[+m.ym.slice(5) - 1])}/${m.ym.slice(2, 4)}</span><b class="num">${fBRL(m.v)}</b></div><div class="bar"><i style="width:${Math.max(3, (m.v / mx) * 100)}%;background:var(--up)"></i></div>`).join("")}</div>`; }
    if (pv.proximos.length) h += `<div class="mut" style="font-size:12.5px;margin:12px 0 4px;font-weight:700">Próximos 3 meses (projeção pelo ano passado)</div>` + pv.proximos.slice(0, 8).map((x) => `<div class="gc-h"><span>${dBR(x.d).slice(0, 5)} · ${esc(x.sym)}</span><b class="num">${fBRL(x.v)}</b></div>`).join("");
    if (pv.semData) h += `<div class="mut" style="font-size:12px;margin-top:8px">${fBRL(pv.semData)} pagos no último ano por posições sem data de compra: não contei como recebidos.</div>`;
    return h + `<div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Estimativa pelas datas e valores publicados, sobre a quantidade cadastrada. Confira no extrato da corretora; os valores futuros são apenas uma projeção.</div></div>`;
  }
  const retorno = () => rentCard() + provCard();

  // ------------------------------------------------------------ PLANEJAR
  const metas = () => ({ ...c.DEF_T, ...store.get("metas", {}) });
  function sobraCard() {
    const ym = hoje().slice(0, 7), S = summarize(gastosL(), ym, "p"), sobra = sobraDoMes(S), ap = c.aporteMes();
    let h = secTitle(`${ic("target", "sm")} Aporte automático da sobra`) + `<div class="card">`;
    h += sobra > 0 ? `<div class="gc-h"><span>Sobrou em ${esc(ymLabel(ym))}</span><b class="num up">${fBRL(sobra)}</b></div><div class="mut" style="font-size:12.5px;margin-top:2px">Receitas − gastos − o que já foi investido neste mês (conta pessoal).</div><button class="btn" id="ps-usar">Usar ${fBRL(sobra)} como aporte do mês</button>` : `<div class="mut" style="font-size:13.5px;line-height:1.5">Ainda não sobrou nada em ${esc(ymLabel(ym))} (ou não há receitas lançadas). Quando sobrar, o app sugere o aporte aqui.</div>`;
    const base = sobra > 0 ? sobra : ap, S2 = base > 0 ? c.suggest(pos(), base, metas(), c.ipcaRate()) : null;
    if (S2) h += `<div class="mut" style="font-size:12.5px;margin:12px 0 4px;font-weight:700">Onde colocar ${fBRL(base)} pelo seu perfil</div>` + c.CLS.filter(([k]) => S2.out[k] > 0.5).map(([k, n]) => `<div class="gc-h"><span>${esc(n)}${S2.sel[k]?.length ? ` <small class="mut">${S2.sel[k].slice(0, 3).map((x) => esc(x.sym)).join(", ")}</small>` : ""}</span><b class="num">${fBRL(S2.out[k])}</b></div>`).join("") + (S2.notes.selic ? `<div class="mut" style="font-size:12px;margin-top:6px">${esc(S2.notes.selic)}</div>` : "");
    return h + `<div class="mut" style="font-size:12px;margin-top:8px">Quem compra é você, pelo seu banco ou corretora. Sugestão de estudo, não recomendação personalizada.</div></div>`;
  }
  function rebalCard() {
    const T = metas(), { by, total } = c.totals(pos()), ap = +store.get("pat_rb", c.aporteMes()) || 0, r = rebalancear({ by, total, T, aporte: ap });
    const nome = (k) => c.CLS.find((x) => x[0] === k)?.[1] || k;
    let h = secTitle(`${ic("filter", "sm")} Rebalanceamento guiado`) + `<div class="card"><label>Quanto você vai aportar agora (R$)</label><input id="pr-ap" inputmode="decimal" value="${String(ap).replace(".", ",")}">`;
    if (r.semDados) return h + `<div class="mut" style="font-size:13.5px;margin-top:8px">Cadastre suas posições para ver o plano.</div></div>`;
    h += `<div class="mut" style="font-size:12.5px;margin:10px 0 6px">Regra: primeiro o aporte corrige o desvio, sem vender nada e sem imposto. Só se passar de 5 pontos o app sugere reduzir.</div>`;
    h += r.passos.length ? r.passos.map((p, i) => `<div class="gl"><div class="gl-m"><div class="gl-d">${i + 1}. ${p.tipo === "aportar" ? "Aporte" : p.tipo === "reduzir" ? "Considere reduzir" : "Direcione os próximos aportes"}: ${esc(nome(p.cls))}</div><div class="mut gl-s">${p.tipo === "aportar" ? "Aproxima a carteira da meta, sem vender." : p.tipo === "reduzir" ? `${fN(p.pontos, 1)} pontos acima da meta. Confira o imposto antes de vender.` : `${fN(p.pontos, 1)} pontos abaixo da meta.`}</div></div><div class="num gl-v ${p.tipo === "reduzir" ? "down" : ""}">${fBRL(p.valor)}</div></div>`).join("") : `<div style="margin-top:6px">Sua carteira já está dentro da meta (desvio máximo ${fN(r.desvioMax, 1)} ponto). Mantenha o plano.</div>`;
    return h + `<div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Vendas podem ter imposto: ações têm isenção até R$ 20 mil vendidos no mês, FIIs pagam 20% sobre o lucro. As metas vêm do seu perfil (Mais &gt; Metas da carteira).</div></div>`;
  }
  function metaCard() {
    const M = store.get("pat_meta", null), p = partes();
    let h = secTitle(`${ic("target", "sm")} Meta com prazo`) + `<div class="card">`;
    if (M) {
      const r = metaComPrazo({ alvo: M.alvo, prazoYm: M.prazo, hoje: hoje(), patrimonio: p.invest, aporteAtual: c.aporteBase(), taxaAnual: M.taxa });
      h += `<div class="gc-h"><span><b>${esc(M.nome || "Minha meta")}</b> <small class="mut">${fBRL(M.alvo)} até ${esc(ymLabel(M.prazo))}</small></span><b class="num">${Math.round(r.pct * 100)}%</b></div><div class="bar"><i style="width:${Math.max(2, r.pct * 100)}%;background:var(--up)"></i></div>`;
      h += `<div style="margin-top:8px;font-size:14.5px;line-height:1.55">Para chegar lá em ${r.meses} meses com retorno de ${fN(M.taxa, 1)}% ao ano, aporte <b>${fBRL(r.precisa)} por mês</b>.<br>No seu ritmo atual (${fBRL(c.aporteBase())} por mês) você chega a <b>${fBRL(r.projetado)}</b>: ${r.noRitmo ? `<span class="up">no ritmo, com folga de ${fBRL(r.folga)}</span>` : `<span class="down">faltam ${fBRL(-r.folga)}</span>`}.</div><button class="btn ghost" id="pm-rm">Remover a meta</button>`;
    } else {
      const cdi = macro().cdi ?? 13.65;
      h += `<div class="grid2"><div><label>Nome</label><input id="pm-n" placeholder="ex.: Entrada do terreno"></div><div><label>Quanto juntar (R$)</label><input id="pm-v" inputmode="decimal" placeholder="ex.: 50 mil"></div><div><label>Até (mês/ano)</label><input id="pm-p" type="month" value="${ymAdd(hoje().slice(0, 7), 36)}"></div><div><label>Retorno esperado (% ao ano)</label><input id="pm-t" inputmode="decimal" value="${String(Math.round(cdi * 0.85 * 10) / 10).replace(".", ",")}"></div></div><button class="btn" id="pm-ok">Criar meta</button><div class="mut" style="font-size:12px;margin-top:6px">O retorno sugerido é cerca de 85% do CDI de hoje (aproximação do líquido de imposto). É uma hipótese, não uma garantia.</div>`;
    }
    return h + "</div>";
  }
  function fiCard() {
    const F = { gasto: 0, taxa: 5, ret: 4, ...store.get("pat_fi", {}) }, L = gastosL(), ym = hoje().slice(0, 7);
    const hist = [1, 2, 3].map((i) => summarize(L, ymAdd(ym, -i), "p").gastos).filter((v) => v > 0), media = hist.length ? Math.round(hist.reduce((s, v) => s + v, 0) / hist.length) : 0, gasto = F.gasto || media;
    let h = secTitle(`${ic("target", "sm")} Independência financeira`) + `<div class="card"><div class="grid2"><div><label>Gasto mensal desejado (R$)</label><input id="pf-g" inputmode="decimal" value="${gasto ? String(gasto).replace(".", ",") : ""}" placeholder="ex.: 5000"></div><div><label>Retorno real (% ao ano)</label><input id="pf-t" inputmode="decimal" value="${String(F.taxa).replace(".", ",")}"></div><div><label>Retirada segura (% ao ano)</label><input id="pf-r" inputmode="decimal" value="${String(F.ret).replace(".", ",")}"></div></div><button class="btn" id="pf-ok">Calcular</button>`;
    if (gasto > 0) {
      const r = independencia({ gastoMensal: gasto, patrimonio: partes().invest, aporte: c.aporteBase(), taxaReal: F.taxa, retiradaPct: F.ret });
      h += `<div style="margin-top:12px;font-size:14.5px;line-height:1.6">Para viver de renda gastando <b>${fBRL(gasto)}</b> por mês, o patrimônio-alvo é <b>${fBRL(r.alvo)}</b>. Você tem <b>${Math.round(r.pctAlvo * 100)}%</b> (${fBRL(partes().invest)}), o que já rende cerca de <b>${fBRL(r.rendaAtual)}</b> por mês.<br>${r.atingiu ? (r.meses === 0 ? "Você já atingiu a meta." : `Aportando ${fBRL(c.aporteBase())} por mês, a estimativa é chegar em <b>${fN(r.anos, 1)} anos</b>.`) : `Com esse aporte não chega: aumente o aporte ou revise o gasto.`}</div><div class="bar" style="margin-top:8px"><i style="width:${Math.max(2, r.pctAlvo * 100)}%;background:var(--up)"></i></div>`;
    }
    return h + `<div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Retorno REAL é o que passa da inflação (5% é uma hipótese moderada). A retirada de 4% ao ano é a regra clássica de planejamento, uma referência e não uma promessa. Se o gasto vier vazio, uso a média dos seus últimos 3 meses de gastos.</div></div>`;
  }
  const planejar = () => sobraCard() + rebalCard() + metaCard() + fiCard();

  // ------------------------------------------------------------ RISCOS
  function estresseCard() {
    const k = store.get("pat_cen", "bolsa"), cen = CENARIOS.find((x) => x.k === k) || CENARIOS[0], { by } = c.totals(pos()), r = estresse(by, cen.choques), nome = (x) => c.CLS.find((y) => y[0] === x)?.[1] || x;
    return secTitle(`${ic("shield", "sm")} Cenários de estresse`) + `<div class="card"><div class="fchips" style="padding-bottom:6px">${CENARIOS.map((x) => `<button data-pcen="${x.k}" class="${x.k === cen.k ? "on" : ""}">${esc(x.nome)}</button>`).join("")}</div><div class="mut" style="font-size:13px;line-height:1.5">${esc(cen.desc)}</div>` + (r.total > 0 ? `<div class="big num ${cor(r.delta)}" style="margin-top:10px">${r.delta >= 0 ? "+" : "−"}${fBRL(Math.abs(r.delta))}</div><div class="mut" style="font-size:12.5px;margin-bottom:8px">${pct(r.pct)} do patrimônio investido: ${fBRL(r.total)} → ${fBRL(r.depois)}</div>${r.cls.map((x) => `<div class="gc-h"><span>${esc(nome(x.cls))} <small class="mut">${pct(x.choque, 0)}</small></span><b class="num ${cor(x.delta)}">${x.delta >= 0 ? "+" : "−"}${fBRL(Math.abs(x.delta))}</b></div>`).join("")}` : `<div class="mut" style="margin-top:8px">Cadastre posições para simular.</div>`) + `<div class="mut" style="font-size:12px;margin-top:10px;line-height:1.5">São hipóteses ilustrativas para você testar se dormiria tranquilo, não previsões. Os percentuais por classe são aproximações.</div></div>`;
  }
  function dolarCard() {
    const e = exposicaoDolar(pos());
    return secTitle(`${ic("filter", "sm")} Exposição ao dólar`) + `<div class="card">${e.total ? `<div class="gc-h"><span>Dólar e investimentos no exterior</span><b class="num">${fBRL(e.direto)} <small class="mut">${fN(e.pct * 100, 1)}%</small></b></div><div class="bar"><i style="width:${Math.max(2, e.pct * 100)}%;background:var(--gold)"></i></div><div style="margin-top:8px;font-size:14px;line-height:1.5">Se o dólar subir ou cair 10%, essa parte varia cerca de <b>${fBRL(e.efeito10)}</b> para o mesmo lado. ${e.pct < 0.05 ? "Sua carteira está bem concentrada em reais." : e.pct > 0.3 ? "Mais de 30% depende do câmbio: avalie se combina com o seu objetivo." : "É uma proteção moderada contra o câmbio."}</div><div class="mut" style="font-size:12px;margin-top:6px">Só conta o que está na classe Exterior. Empresas brasileiras que vendem em dólar (exportadoras) também sentem o câmbio, mas isso não entra na conta.</div>` : `<div class="mut" style="font-size:13.5px">Cadastre suas posições para ver a exposição.</div>`}</div>`;
  }
  const riscos = () => estresseCard() + dolarCard();

  // ------------------------------------------------------------ DIÁRIO
  function diarioCard() {
    const D = store.get("pat_diario", []), dev = revisoesDevidas(D, hoje());
    let h = secTitle(`${ic("book", "sm")} Diário de decisões`);
    if (dev.length) h += `<div class="card" style="border-left:4px solid var(--gold)"><b>Revisões pendentes</b>${dev.map((r) => { const res = resultadoDecisao(r, r.sym ? c.priceOf(r.sym) : null); return `<div class="gl"><div class="gl-m"><div class="gl-d">${esc(r.sym || "Decisão")} · ${r.tipo} em ${dBR(r.dt)}</div><div class="mut gl-s">${esc(r.motivo || "sem motivo anotado")}${r.gatilho ? ` · você anotou que venderia se: ${esc(r.gatilho)}. Isso aconteceu?` : ""}${res ? ` · ${esc(res.leitura)} (${pct(res.pct)})` : ""}</div></div><button class="btn sm" data-prev="${esc(String(r.id))}|${r.marco}" style="margin:0">Revisei</button></div>`; }).join("")}<div class="mut" style="font-size:12px;margin-top:6px">Marco de ${dev[0].marco} meses. Pergunte-se: o motivo da época continua valendo?</div></div>`;
    h += `<div class="card">${D.length ? D.slice().reverse().slice(0, 12).map((d) => { const res = resultadoDecisao(d, d.sym ? c.priceOf(d.sym) : null); return `<div class="gl"><div class="gl-m"><div class="gl-d">${esc(d.sym || "—")} · ${d.tipo}</div><div class="mut gl-s">${dBR(d.dt)}${d.preco ? " a " + fBRL(d.preco) : ""} · ${esc(d.motivo || "sem motivo")}${d.gatilho ? ` · venderia se: ${esc(d.gatilho)}` : ""}${res ? ` · hoje ${pct(res.pct)}` : ""}${d.rev6 ? " · revisado 6m" : ""}${d.rev12 ? " · revisado 12m" : ""}</div></div><button class="icbtn" data-pdrm="${esc(String(d.id))}" aria-label="Apagar">${ic("trash", "sm")}</button></div>`; }).join("") : `<div class="mut" style="font-size:13.5px;line-height:1.55">Anote por que comprou, vendeu ou decidiu manter. Em 6 e 12 meses o app te lembra de revisar e mostra como o ativo se saiu. Ajuda a aprender com as próprias decisões.</div>`}<details style="margin-top:8px"><summary>Registrar uma decisão</summary><div class="grid2"><div><label>Ativo (opcional)</label><input id="pd-s" list="syms2" placeholder="ex.: ITUB4"><datalist id="syms2">${c.getD().assets.map((a) => `<option value="${a.sym}">`).join("")}</datalist></div><div><label>Tipo</label><select id="pd-t"><option value="compra">Compra</option><option value="venda">Venda</option><option value="manter">Decidi manter</option></select></div><div><label>Preço na hora (R$)</label><input id="pd-p" inputmode="decimal" placeholder="vazio = preço de hoje"></div></div><label>Por quê?</label><input id="pd-m" placeholder="ex.: dividendos e preço baixo"><label>O que me faria vender? (opcional)</label><input id="pd-g" placeholder="ex.: cortar dividendos, dívida subir, perder a vantagem"><div class="mut" style="font-size:12px;margin:4px 0 8px;line-height:1.5">Os grandes investidores vendem quando a <b>tese</b> quebra, não quando o preço oscila. Escrever o gatilho agora evita decidir no susto depois.</div><button class="btn" id="pd-ok">Registrar</button></details></div>`;
    return h;
  }
  function desejosCard() {
    const al = store.get("alertas", []);
    return secTitle(`${ic("star", "sm")} Lista de desejos`) + `<div class="card">${al.length ? al.map((a) => { const x = c.asset(a.sym), dist = x ? (a.price - x.p) / x.p : null; return `<div class="gl"><div class="gl-m"><div class="gl-d">${esc(a.sym)} <small class="mut">avisar ${a.dir} de ${fBRL(a.price)}</small></div><div class="mut gl-s">${a.done ? "✓ alvo atingido" : x ? `hoje ${fBRL(x.p)} · falta ${pct(dist)}` : "ativo não encontrado"}</div></div><button class="icbtn" data-pdes="${esc(String(a.id))}" aria-label="Remover">${ic("trash", "sm")}</button></div>`; }).join("") : `<div class="mut" style="font-size:13.5px;line-height:1.55">Liste o que você quer comprar e o preço em que faria sentido. O app avisa no celular quando o ativo chegar lá.</div>`}<details style="margin-top:8px"><summary>Adicionar à lista</summary><div class="grid2"><div><label>Ativo</label><input id="pw-s" list="syms2" placeholder="ex.: KNCR11"></div><div><label>Avisar quando ficar</label><select id="pw-d"><option value="abaixo">abaixo de</option><option value="acima">acima de</option></select></div><div><label>Preço-alvo (R$)</label><input id="pw-p" inputmode="decimal" placeholder="ex.: 9,50"></div></div><button class="btn" id="pw-ok">Adicionar</button></details></div>`;
  }
  const CHECK = ["Cobra corretagem em ações e FIIs? (muitas zeram, confirme)", "Cobra taxa de custódia ou tem valor mínimo para operar?", "Tem Tesouro Direto, CDB de vários bancos e fundos?", "Como é o câmbio e a taxa para investir no exterior?", "Tem atendimento humano e app estável?", "A corretora é autorizada pelo Banco Central ou pela CVM?"];
  function corrCard() {
    const C = store.get("pat_corr", []);
    return secTitle(`${ic("filter", "sm")} Comparador de corretoras`) + `<div class="card"><div class="mut" style="font-size:13px;line-height:1.5;margin-bottom:8px">Taxas mudam toda hora, então este quadro é seu: preencha com o que você confirmou no site de cada corretora e compare lado a lado.</div>${C.length ? `<table><tr><th>Corretora</th><th>Ações/FIIs</th><th>Custódia</th><th>Exterior</th></tr>${C.map((x) => `<tr><td><b>${esc(x.nome)}</b>${x.nota ? `<div class="mut" style="font-size:11.5px">${esc(x.nota)}</div>` : ""}<button class="icbtn" data-pcrm="${esc(String(x.id))}" aria-label="Remover" style="width:28px;height:28px">${ic("trash", "sm")}</button></td><td>${esc(x.corr || "—")}</td><td>${esc(x.cust || "—")}</td><td>${esc(x.ext || "—")}</td></tr>`).join("")}</table>` : ""}<details style="margin-top:8px"><summary>Adicionar uma corretora</summary><div class="grid2"><div><label>Nome</label><input id="pc-n" placeholder="ex.: XP, Rico, Nu"></div><div><label>Corretagem ações/FIIs</label><input id="pc-c" placeholder="ex.: zero"></div><div><label>Custódia</label><input id="pc-u" placeholder="ex.: isenta"></div><div><label>Exterior / câmbio</label><input id="pc-e" placeholder="ex.: 1% de spread"></div></div><label>Observação</label><input id="pc-o" placeholder="ex.: bom app, atendimento lento"><button class="btn" id="pc-ok">Adicionar</button></details><details style="margin-top:6px"><summary>O que perguntar antes de escolher</summary><ul style="margin:8px 0 0;padding-left:18px;line-height:1.6;font-size:14px">${CHECK.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></details></div>`;
  }
  function relCard() {
    const ano = +hoje().slice(0, 4);
    return secTitle(`${ic("down", "sm")} Relatório anual da carteira`) + `<div class="card"><div class="mut" style="font-size:13.5px;line-height:1.55">PDF com suas posições (custo e valor atual), os proventos estimados do ano, bens e dívidas informados. Serve de apoio para organizar a declaração; confira sempre os informes oficiais.</div><button class="btn" id="pr-pdf">Gerar o relatório de ${ano} (PDF)</button></div>`;
  }
  const diario = () => diarioCard() + desejosCard() + corrCard() + relCard();

  // ------------------------------------------------------------ tela e eventos
  function vPatrimonio() {
    const aba = ABAS.some((a) => a[0] === st.aba) ? st.aba : "visao", corpo = { visao, retorno, planejar, riscos, diario }[aba]();
    return `<button class="back" data-go="#/carteira">${ic("back", "sm")} Carteira</button><div class="seg" id="pat-abas" style="margin:4px 0 12px">${ABAS.map(([k, n]) => `<button data-pabas="${k}" class="${aba === k ? "on" : ""}">${n}</button>`).join("")}</div>${corpo}<p class="warn">Material de estudo, feito no seu aparelho com o que você cadastrou. Não é recomendação personalizada de investimento.</p>`;
  }
  function bindPatrimonio(render) {
    rerender = render; registra(); notifica();
    const $ = (s) => document.querySelector(s), re = () => render();
    document.querySelectorAll("[data-pabas]").forEach((b) => b.addEventListener("click", () => { st.aba = b.dataset.pabas; store.set("pat_aba", st.aba); re(); window.scrollTo(0, 0); }));
    // bens e dívidas
    $("#pb-add")?.addEventListener("click", () => { const nome = $("#pb-n").value.trim().slice(0, 40), v = numCore(String($("#pb-v").value).replace(/\s*mil\b/i, "000")) ; const val = /mil/i.test($("#pb-v").value) ? (numCore($("#pb-v").value.replace(/\s*mil\b/i, "")) || 0) * 1000 : v; if (!nome || !(val > 0)) return toast("Preencha o nome e o valor."); store.set("pat_bens", [...bensL(), { id: Date.now(), nome, valor: Math.round(val * 100) / 100, tp: $("#pb-t").value === "divida" ? "divida" : "bem" }]); toast("Adicionado."); re(); });
    document.querySelectorAll("[data-pbrm]").forEach((b) => b.addEventListener("click", () => { store.set("pat_bens", bensL().filter((x) => String(x.id) !== b.dataset.pbrm)); re(); }));
    // planejar
    $("#ps-usar")?.addEventListener("click", () => { const S = summarize(gastosL(), hoje().slice(0, 7), "p"), v = sobraDoMes(S); if (!v) return toast("Ainda não sobrou nada."); c.setAporteMes(v); toast("Aporte do mês definido em " + fBRL(v) + "."); re(); });
    $("#pr-ap")?.addEventListener("change", (e) => { const v = numCore(e.target.value); if (v != null && v >= 0) store.set("pat_rb", v); re(); });
    const mil = (s) => (/mil/i.test(s) ? (numCore(String(s).replace(/\s*mil\b/i, "")) || 0) * 1000 : numCore(s));
    $("#pm-ok")?.addEventListener("click", () => { const alvo = mil($("#pm-v").value), prazo = $("#pm-p").value, taxa = numCore($("#pm-t").value); if (!(alvo > 0) || !/^\d{4}-\d{2}$/.test(prazo) || prazo <= hoje().slice(0, 7)) return toast("Informe o valor e um prazo futuro."); store.set("pat_meta", { nome: $("#pm-n").value.trim().slice(0, 40), alvo, prazo, taxa: taxa != null && taxa >= 0 && taxa < 100 ? taxa : 10 }); re(); });
    $("#pm-rm")?.addEventListener("click", () => { store.set("pat_meta", null); re(); });
    $("#pf-ok")?.addEventListener("click", () => { const g = mil($("#pf-g").value), t = numCore($("#pf-t").value), r = numCore($("#pf-r").value); if (!(g > 0)) return toast("Informe o gasto mensal desejado."); store.set("pat_fi", { gasto: g, taxa: t != null && t >= 0 && t < 30 ? t : 5, ret: r != null && r > 0 && r <= 20 ? r : 4 }); re(); });
    // riscos
    document.querySelectorAll("[data-pcen]").forEach((b) => b.addEventListener("click", () => { store.set("pat_cen", b.dataset.pcen); re(); }));
    // diário, desejos, corretoras, relatório
    $("#pd-ok")?.addEventListener("click", () => {
      const sym = $("#pd-s").value.trim().toUpperCase(), tipo = ["compra", "venda", "manter"].includes($("#pd-t").value) ? $("#pd-t").value : "compra", motivo = $("#pd-m").value.trim().slice(0, 120), gatilho = ($("#pd-g")?.value || "").trim().slice(0, 120), preco = numCore($("#pd-p").value) || (sym ? c.priceOf(sym) : null) || null;
      if (!sym && !motivo) return toast("Informe o ativo ou o motivo."); store.set("pat_diario", [...store.get("pat_diario", []), { id: Date.now(), dt: hoje(), sym, tipo, motivo, ...(gatilho ? { gatilho } : {}), ...(preco ? { preco } : {}) }]); toast("Decisão registrada."); re();
    });
    document.querySelectorAll("[data-prev]").forEach((b) => b.addEventListener("click", () => { const [id, marco] = b.dataset.prev.split("|"); store.set("pat_diario", store.get("pat_diario", []).map((d) => (String(d.id) === id ? { ...d, [`rev${marco}`]: hoje() } : d))); re(); }));
    document.querySelectorAll("[data-pdrm]").forEach((b) => b.addEventListener("click", () => { store.set("pat_diario", store.get("pat_diario", []).filter((d) => String(d.id) !== b.dataset.pdrm)); re(); }));
    $("#pw-ok")?.addEventListener("click", () => { const sym = $("#pw-s").value.trim().toUpperCase(), price = numCore($("#pw-p").value); if (!c.asset(sym)) return toast("Não conheço esse ativo. Use o código, ex.: KNCR11."); if (!(price > 0)) return toast("Informe o preço-alvo."); store.set("alertas", [...store.get("alertas", []), { id: Date.now(), sym, dir: $("#pw-d").value === "acima" ? "acima" : "abaixo", price, done: false }]); toast("Adicionado. Eu aviso quando chegar."); re(); });
    document.querySelectorAll("[data-pdes]").forEach((b) => b.addEventListener("click", () => { store.set("alertas", store.get("alertas", []).filter((a) => String(a.id) !== b.dataset.pdes)); re(); }));
    $("#pc-ok")?.addEventListener("click", () => { const nome = $("#pc-n").value.trim().slice(0, 30); if (!nome) return toast("Informe o nome da corretora."); store.set("pat_corr", [...store.get("pat_corr", []), { id: Date.now(), nome, corr: $("#pc-c").value.trim().slice(0, 40), cust: $("#pc-u").value.trim().slice(0, 40), ext: $("#pc-e").value.trim().slice(0, 40), nota: $("#pc-o").value.trim().slice(0, 60) }]); re(); });
    document.querySelectorAll("[data-pcrm]").forEach((b) => b.addEventListener("click", () => { store.set("pat_corr", store.get("pat_corr", []).filter((x) => String(x.id) !== b.dataset.pcrm)); re(); }));
    $("#pr-pdf")?.addEventListener("click", () => {
      const ano = hoje().slice(0, 4), pv = proventos(pos(), c.getD().assets, hoje()), p = partes();
      const bytes = relatorioCarteiraPdf({ ano, posicoes: pos().map((x) => ({ cls: x.cls, sym: x.sym, plat: x.plat, dt: x.dt, inv: x.inv, value: x.value })), total: p.invest, caixa: p.caixa, bens: bensL(), proventos: { recebidos: pv.recebidos, meses: pv.meses.filter((m) => m.ym.startsWith(ano)) } });
      const blob = new Blob([bytes], { type: "application/pdf" }), u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = `Uiracu-carteira-${ano}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    });
  }
  return { vPatrimonio, bindPatrimonio, registra, avisosHoje, notifica };
}
