// Extras do VW Wallet: saúde da carteira, teste de estresse, renda estimada, Focus, Tesouro, ferramentas, trilha de aprendizado, PIN e lembrete de aporte.
export function makeExtras(c) {
  const { getD, aporteMes, store, esc, fN, fBRL, secTitle, ic, num, toast, CLS, CLS_COLOR, totals, todayBRT } = c;
  const D = () => getD();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const P1 = (x) => (x == null || isNaN(x) ? "—" : fN(x, 2) + "%");
  const KEYS = CLS.map(([k]) => k);

  // ------------------------------------------------------------ Focus e Tesouro (dados oficiais)
  function focusCard() {
    const f = D().summary?.macro?.focus;
    if (!f?.selic) return "";
    const row = (l, k) => `<tr><td>${l}</td><td class="r num">${P1(f[k]?.["2026"])}</td><td class="r num">${P1(f[k]?.["2027"])}</td></tr>`;
    const cam = (y) => (f.cambio?.[y] != null ? "R$ " + fN(f.cambio[y]) : "—");
    const d = f.data ? f.data.split("-").reverse().join("/") : "";
    return secTitle("O que o mercado espera (Focus)") + `<div class="card"><table><tr><th></th><th class="r">2026</th><th class="r">2027</th></tr>${row("Selic no fim do ano", "selic")}${row("Inflação (IPCA)", "ipca")}${row("Crescimento do PIB", "pib")}<tr><td>Dólar no fim do ano</td><td class="r num">${cam("2026")}</td><td class="r num">${cam("2027")}</td></tr></table><div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Mediana das previsões de economistas, pesquisa Focus do Banco Central de ${d}. É o que os analistas esperam, não uma promessa.</div></div>`;
  }
  function tesouroCard() {
    const t = D().tesouro, ref = D().summary?.macro?.tesouro;
    if (!t?.itens?.length) return "";
    const d = t.data.split("-").reverse().join("/");
    const sel = t.itens.find((i) => i.tipo === "Tesouro Selic");
    const ipca = t.itens.filter((i) => i.tipo === "Tesouro IPCA+").sort((a, b) => (a.venc < b.venc ? -1 : 1));
    const pre = t.itens.filter((i) => i.tipo === "Tesouro Prefixado").sort((a, b) => (a.venc < b.venc ? -1 : 1));
    const y = (v) => v.slice(0, 4);
    const r2032 = ref?.ipca2032;
    const ver = r2032 == null ? "" : r2032 >= 7.2 ? `<b class="up">Na sua faixa de compra (IPCA + ${fN(r2032)}%):</b> pode entrar em parcelas.` : `<b>Ainda abaixo da sua regra (IPCA + ${fN(r2032)}% contra 7,2%):</b> espere ou compre pouco.`;
    return secTitle("Tesouro Direto: taxas oficiais") + `<div class="card"><table><tr><th>Título</th><th class="r">Taxa (compra)</th></tr>
      ${sel ? `<tr><td>Tesouro Selic ${y(sel.venc)}</td><td class="r num">Selic + ${fN(sel.compra)}%</td></tr>` : ""}
      ${ipca.filter((_, i) => [0, 2, 3, 5].includes(i) || ipca.length < 5).map((i) => `<tr><td>Tesouro IPCA+ ${y(i.venc)}</td><td class="r num">IPCA + ${fN(i.compra)}%</td></tr>`).join("")}
      ${pre.slice(0, 3).map((i) => `<tr><td>Tesouro Prefixado ${y(i.venc)}</td><td class="r num">${fN(i.compra)}%</td></tr>`).join("")}</table>
      <div style="margin-top:10px;font-size:14px;line-height:1.5">${ver}</div>
      <div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Taxas do Tesouro Transparente de ${d}. Saem com um dia útil de atraso: em dias de forte oscilação (como 26/10) a taxa de agora pode ser bem diferente. Confira no app antes de comprar.</div></div>`;
  }

  // ------------------------------------------------------------ saúde da carteira (5 pilares, nota de 0 a 1000) e teste de estresse
  const SHOCKS = { hoje: ["Hoje (26/10) se repetisse", [0, -0.05, 0, -0.08, -0.16, 0.10]], seg: ["Uma segunda queda (mais 15% a 20%)", [0, -0.08, 0, -0.15, -0.30, 0.08]], mar: ["Colapso como março de 2020", [0, -0.10, -0.005, -0.30, -0.46, 0]] };
  function lossTolerance() { const q = store.get("quiz", {}); const m = { "2": 2, "5": 5, "10": 10, "20": 20 }; return m[q.perda] ?? 10; }
  function health(pos) {
    const { by, total } = totals(pos); if (!total) return null;
    const w = Object.fromEntries(KEYS.map((k) => [k, by[k] / total]));
    const mac = D().summary.macro, cdi = mac.cdi ?? 13.65, ipca = mac.ipca12 ?? 4.5, tx = mac.tesouro?.ipca2032 ?? 6.8;
    const avg = (t) => { const a = D().assets.filter((x) => x.type === t && x.dy); return a.length ? (a.reduce((s, x) => s + x.dy, 0) / a.length) * 100 : 8; };
    // 1 Diversificação
    const hhi = Object.values(w).reduce((s, x) => s + x * x, 0), maxA = Math.max(0, ...pos.map((p) => p.value / total));
    const div = 200 * (0.7 * clamp((1 - hhi) / (1 - 1 / 6), 0, 1) + 0.3 * clamp(1 - Math.max(0, maxA - 0.25) / 0.5, 0, 1));
    // 2 Retorno (carrego estimado em % ao ano)
    const carry = w.selic * cdi * 0.9 + w.cdb * cdi + w.ipca * (ipca + tx) + w.fii * avg("fii") + w.acao * avg("acao") + w.ext * 8;
    const ret = 200 * clamp((carry - 6) / 7, 0, 1);
    // 3 Liquidez (facilidade de virar dinheiro)
    const liq = 200 * (w.selic * 1 + w.cdb * 0.5 + w.ipca * 0.8 + w.fii * 0.8 + w.acao * 0.9 + w.ext * 0.8);
    // 4 Proteção (inflação, dólar e reserva imediata)
    const pro = 200 * ((clamp(w.ipca / 0.2, 0, 1) + clamp(w.ext / 0.08, 0, 1) + clamp(w.selic / 0.15, 0, 1)) / 3);
    // 5 Simplicidade e custos
    const plats = {}; pos.forEach((p) => (plats[p.plat || "?"] = (plats[p.plat || "?"] || 0) + p.value));
    const topPlat = Math.max(...Object.values(plats)) / total;
    let efi = 200 - Math.max(0, pos.length - 10) * 15 - (pos.some((p) => p.value < 30) ? 20 : 0) - (pos.length >= 2 && topPlat > 0.85 ? 30 : 0);
    efi = clamp(efi, 0, 200);
    const pil = [["Diversificação", div, "Distribua em mais classes e evite passar de 25% em um único ativo."], ["Retorno", ret, "O carrego está baixo: avalie mais Tesouro IPCA+ ou FIIs de papel."], ["Liquidez", liq, "Mantenha parte em Tesouro Selic para resgatar rápido."], ["Proteção", pro, "Falta proteção: o Tesouro IPCA+ protege da inflação e o exterior, do dólar."], ["Simplicidade e custos", efi, "Menos posições, e maiores, custam menos em taxas."]];
    const score = Math.round(pil.reduce((s, x) => s + x[1], 0));
    const weakest = [...pil].sort((a, b) => a[1] - b[1])[0];
    const stress = Object.values(SHOCKS).map(([n, sh]) => [n, KEYS.reduce((s, k, i) => s + w[k] * sh[i], 0)]);
    return { score, pil, weakest, stress, carry };
  }
  function healthCard(pos) {
    const h = health(pos); if (!h) return "";
    const lim = lossTolerance();
    const lab = h.score < 400 ? "Frágil" : h.score < 600 ? "Em construção" : h.score < 800 ? "Boa" : "Muito boa";
    return secTitle(`${ic("shield", "sm")} Saúde da carteira`) + `<div class="card"><div class="cv"><div><div class="big num">${h.score}<span class="mut" style="font-size:16px;font-weight:700"> / 1000</span></div><div style="font-weight:800">${lab}</div></div></div>
      <div style="margin-top:12px">${h.pil.map(([n, v]) => `<div class="alloc"><div class="l"><span>${n}</span><b class="num">${Math.round(v)} / 200</b></div><div class="bar"><i style="width:${(v / 200) * 100}%"></i></div></div>`).join("")}</div>
      <div style="font-size:14px;line-height:1.5;margin-top:4px"><b>Ponto mais fraco: ${h.weakest[0]}.</b> ${h.weakest[2]}</div>
      <div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Nota própria do VW Wallet, em cinco pilares (como a de apps que avaliam a saúde da carteira). Calculada só com o que você cadastrou.</div></div>
      ${secTitle("Teste de estresse (e se o mercado cair?)")}<div class="card">${h.stress.map(([n, l]) => { const ok = -l * 100 <= lim; return `<div class="alloc"><div class="l"><span>${n}</span><b class="num ${ok ? "" : "down"}">${l >= 0 ? "+" : "−"}${fN(Math.abs(l) * 100, 1)}%</b></div><div class="bar"><i style="width:${clamp((-l * 100 / Math.max(lim * 1.5, 1)) * 100, 0, 100)}%;background:${ok ? "var(--up)" : "var(--down)"}"></i><b style="left:${clamp((lim / Math.max(lim * 1.5, 1)) * 100, 0, 99)}%"></b></div><div class="mut" style="font-size:12px">${ok ? "Dentro" : "ACIMA"} do seu limite de perda de ${lim}%</div></div>`; }).join("")}<div class="mut" style="font-size:12px;line-height:1.5">Simulação simples: aplica quedas parecidas com as de hoje, de uma segunda queda e de março de 2020 sobre as classes da sua carteira. Perdas de papel só se realizam se você vender.</div></div>`;
  }
  function incomeCard(pos) {
    const { total } = totals(pos); if (!total) return "";
    const mac = D().summary.macro, cdi = mac.cdi ?? 13.65;
    const avg = (t) => { const a = D().assets.filter((x) => x.type === t && x.dy); return a.length ? a.reduce((s, x) => s + x.dy, 0) / a.length : 0.08; };
    let prov = 0, juros = 0;
    pos.forEach((p) => { const a = p.sym && D().assets.find((x) => x.sym === p.sym);
      if (p.cls === "fii") prov += p.value * (a?.dy ?? avg("fii")); else if (p.cls === "acao") prov += p.value * (a?.dy ?? avg("acao"));
      else if (p.cls === "selic" || p.cls === "cdb") juros += p.value * (cdi / 100) * 0.825; });
    return secTitle("Renda estimada") + `<div class="card"><div class="grid2"><div class="stat"><small>Proventos de FIIs e ações</small><b class="num">${fBRL(prov / 12)}</b><small>por mês (≈ ${fBRL(prov)} por ano)</small></div><div class="stat"><small>Juros da renda fixa (líquidos)</small><b class="num">${fBRL(juros / 12)}</b><small>por mês, ficam no título</small></div></div><div class="mut" style="font-size:12px;margin-top:10px;line-height:1.5">Estimativa com os proventos dos últimos 12 meses de cada ativo (ou a média da classe) e o CDI de hoje, com imposto aproximado. Não é garantia.</div></div>`;
  }

  // ------------------------------------------------------------ lembrete do dia do aporte
  function aporteBanner() {
    const dia = store.get("diaAporte", null); if (!dia) return "";
    const hoje = new Date(todayBRT() + "T12:00:00"), mes = todayBRT().slice(0, 7);
    if (store.get("aporteFeito", "") === mes) return "";
    const d = hoje.getDate(); if (d < dia || d > dia + 6) return "";
    return `<div class="card cta" data-go="#/carteira" style="border-left:4px solid var(--gold)"><div class="cta-i">${ic("wallet")}</div><div style="flex:1"><div style="font-weight:800">Dia do aporte</div><div class="mut" style="font-size:13px;margin-top:2px">Veja onde colocar os R$ ${fN(aporteMes(), 0)} deste mês.</div></div><button class="btn sm" id="ap-done">Já fiz</button></div>`;
  }

  // ------------------------------------------------------------ ferramentas
  const IRT = (m) => (m <= 6 ? 0.225 : m <= 12 ? 0.20 : m <= 24 ? 0.175 : 0.15);
  function vFerramentas() {
    const cdi = D().summary.macro.cdi ?? 13.65, tot = totals(store.get("posicoes", [])).total;
    return `<button class="back" data-go="#/mais">${ic("back", "sm")} Mais</button>
    ${secTitle(`${ic("chart", "sm")} Simulador de patrimônio`)}<div class="card"><div class="grid2"><div><label>Valor inicial (R$)</label><input id="s-pv" inputmode="decimal" value="${Math.round(tot) || 0}"></div><div><label>Aporte por mês (R$)</label><input id="s-pmt" inputmode="decimal" value="${store.get("aporte", 1000)}"></div><div><label>Prazo (anos)</label><input id="s-n" inputmode="decimal" value="10"></div><div><label>Retorno líquido (% ao ano)</label><input id="s-r" inputmode="decimal" value="9,5"></div></div>
      <div id="s-out" class="stat" style="margin-top:12px"></div>
      <label>Quero chegar a (R$) e saber quanto aportar por mês</label><input id="s-goal" inputmode="decimal" placeholder="ex.: 500000"><div id="s-goal-out" class="mut" style="font-size:14px;margin-top:8px;line-height:1.5"></div>
      <div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Juros compostos com aporte no fim de cada mês. O retorno é uma hipótese (o estudo do Alfred indica algo perto de 9 a 10% ao ano líquido para a carteira moderada-conservadora, sem garantia). A inflação reduz o poder de compra: veja o valor "de hoje".</div></div>
    ${secTitle(`${ic("filter", "sm")} CDB × LCI × Tesouro Selic (líquido de IR)`)}<div class="card"><div class="grid2"><div><label>Valor (R$)</label><input id="c-v" inputmode="decimal" value="1000"></div><div><label>Prazo (meses)</label><input id="c-m" inputmode="decimal" value="12"></div><div><label>CDB (% do CDI)</label><input id="c-cdb" inputmode="decimal" value="105"></div><div><label>LCI/LCA (% do CDI)</label><input id="c-lci" inputmode="decimal" value="92"></div></div><label>CDI (% ao ano)</label><input id="c-cdi" inputmode="decimal" value="${fN(cdi)}"><div id="c-out" style="margin-top:12px"></div>
      <div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">IR da renda fixa: 22,5% até 6 meses, 20% até 12, 17,5% até 24 e 15% depois. LCI/LCA são isentas. O Tesouro Selic é calculado a 99,8% do CDI (taxa da B3 de 0,2% ao ano incluída, de forma aproximada). Confirme as regras atuais.</div></div>
    ${secTitle(`${ic("book", "sm")} Imposto na venda de ações, FIIs e ETFs`)}<div class="card"><label>Tipo</label><select id="i-t"><option value="swing">Ação (compra e venda em dias diferentes)</option><option value="day">Ação (day trade)</option><option value="fii">FII</option><option value="etf">ETF</option></select><div class="grid2"><div><label>Total vendido no mês (R$)</label><input id="i-v" inputmode="decimal" value="10000"></div><div><label>Lucro no mês (R$)</label><input id="i-l" inputmode="decimal" value="1500"></div></div><div id="i-out" style="margin-top:12px"></div>
      <div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">Regras comuns: ações em swing trade têm isenção se o total vendido no mês for até R$ 20 mil, e acima disso pagam 15% sobre o lucro; day trade paga 20%; FIIs pagam 20% sobre o lucro, sem isenção. A DARF (código 6015) vence no último dia útil do mês seguinte. Esta conta não considera prejuízos de meses anteriores nem corretagem. Para ETFs as fontes divergem: confirme. Confirme sempre com a Receita ou um contador.</div></div>`;
  }
  function bindFerramentas() {
    const g = (id) => document.getElementById(id), v = (id) => num(g(id)?.value) ?? 0;
    const sim = () => {
      const pv = v("s-pv"), pmt = v("s-pmt"), n = v("s-n"), ra = v("s-r") / 100, rm = Math.pow(1 + ra, 1 / 12) - 1, k = Math.round(n * 12);
      const fv = pv * Math.pow(1 + rm, k) + (rm ? pmt * ((Math.pow(1 + rm, k) - 1) / rm) : pmt * k), inv = pv + pmt * k, real = fv / Math.pow(1.045, n);
      g("s-out").innerHTML = `<small>Em ${fN(n, 0)} anos você teria</small><b class="num" style="font-size:24px">${fBRL(fv)}</b><div class="mut" style="font-size:13px;margin-top:4px">Você investiu ${fBRL(inv)} e os juros renderam ${fBRL(fv - inv)}.<br>Em valores de hoje (inflação de 4,5% ao ano): <b>${fBRL(real)}</b></div>`;
      const goal = v("s-goal");
      g("s-goal-out").textContent = goal > 0 && k > 0 && rm ? `Para chegar a ${fBRL(goal)} em ${fN(n, 0)} anos, aporte cerca de ${fBRL(Math.max(0, ((goal - pv * Math.pow(1 + rm, k)) * rm) / (Math.pow(1 + rm, k) - 1)))} por mês.` : "";
    };
    const cmp = () => {
      const V = v("c-v"), m = v("c-m"), cdi = v("c-cdi") / 100, ir = IRT(m), f = (pc) => V * Math.pow(1 + cdi * (pc / 100), m / 12);
      const gross = f(v("c-cdb")), lci = f(v("c-lci")), tes = f(99.8);
      const rows = [["CDB", V + (gross - V) * (1 - ir)], ["LCI/LCA (isenta)", lci], ["Tesouro Selic", V + (tes - V) * (1 - ir)]].sort((a, b) => b[1] - a[1]);
      const eq = ((v("c-lci") / (1 - ir)) || 0);
      g("c-out").innerHTML = `<table>${rows.map(([n, x], i) => `<tr><td>${i === 0 ? "🏆 " : ""}${n}</td><td class="r num"><b>${fBRL(x)}</b><div class="mut" style="font-size:12px">+${fBRL(x - V)} líquido</div></td></tr>`).join("")}</table><div class="mut" style="font-size:13px;margin-top:8px;line-height:1.5">IR neste prazo: ${fN(ir * 100, 1)}%. Uma LCI de ${fN(v("c-lci"), 0)}% do CDI equivale a um CDB de cerca de <b>${fN(eq, 0)}%</b> do CDI.</div>`;
    };
    const imp = () => {
      const t = g("i-t").value, vend = v("i-v"), luc = v("i-l");
      let tax = 0, msg = "";
      if (luc <= 0) msg = "Sem lucro no mês: sem imposto. (Prejuízo pode ser compensado em meses seguintes: guarde o controle.)";
      else if (t === "swing") { if (vend <= 20000) msg = `Vendas de até R$ 20.000 no mês: <b>isento</b>.`; else { tax = luc * 0.15; msg = `Vendas acima de R$ 20.000: <b>15%</b> sobre o lucro.`; } }
      else if (t === "day") { tax = luc * 0.20; msg = "Day trade: <b>20%</b> sobre o lucro, sem isenção."; }
      else if (t === "fii") { tax = luc * 0.20; msg = "FII: <b>20%</b> sobre o lucro, sem isenção."; }
      else { tax = luc * 0.15; msg = "ETF: <b>15%</b> sobre o lucro, sem isenção (as fontes divergem: confirme)."; }
      g("i-out").innerHTML = `<div class="stat"><small>Imposto estimado</small><b class="num" style="font-size:22px">${fBRL(tax)}</b></div><div style="font-size:14px;line-height:1.5;margin-top:8px">${msg}${tax > 0 ? " Pague por DARF código 6015 até o último dia útil do mês seguinte." : ""}</div>`;
    };
    ["s-pv", "s-pmt", "s-n", "s-r", "s-goal"].forEach((id) => g(id)?.addEventListener("input", sim));
    ["c-v", "c-m", "c-cdb", "c-lci", "c-cdi"].forEach((id) => g(id)?.addEventListener("input", cmp));
    ["i-t", "i-v", "i-l"].forEach((id) => g(id)?.addEventListener("input", imp));
    sim(); cmp(); imp();
  }

  // ------------------------------------------------------------ trilha de aprendizado
  const LESSONS = [
    ["1. Por que investir?", "O dinheiro parado perde valor com a inflação. Investir é fazer o dinheiro render mais do que os preços sobem, com a segurança que combina com o seu prazo e o seu perfil. Comece pelo básico e aumente o risco aos poucos."],
    ["2. Reserva de emergência primeiro", "Antes de qualquer risco, guarde de 3 a 6 meses dos seus gastos em algo seguro e que resgata rápido: Tesouro Selic ou CDB com liquidez diária. É o que impede que um imprevisto force você a vender investimentos na hora errada."],
    ["3. Renda fixa: o ponto de partida", "Na renda fixa você já sabe como o ganho é calculado. Tesouro Direto (do governo), CDB, LCI e LCA (de bancos). Oscila pouco e, com a Selic alta, rende bem. Tem proteção do FGC até R$ 250 mil por banco (CDB, LCI, LCA)."],
    ["4. Tesouro Selic × IPCA+", "O Tesouro Selic acompanha a taxa básica: simples e seguro, ótimo para guardar dinheiro. O Tesouro IPCA+ paga a inflação mais uma taxa fixa: protege o poder de compra, mas o preço oscila se você vender antes do vencimento. Segure até o fim e receba o combinado."],
    ["5. O que é CDI e '100% do CDI'", "O CDI é a taxa que os bancos usam entre si e anda quase igual à Selic. Um CDB que paga 100% do CDI rende como ela; 110% rende 10% a mais. Compare sempre depois do imposto: LCI e LCA não pagam IR."],
    ["6. Fundos imobiliários (FIIs)", "Você compra cotas de um fundo com imóveis ou títulos imobiliários e recebe renda mensal. FIIs de papel acompanham os juros; os de tijolo (shoppings, galpões) sofrem quando os juros longos sobem. O P/VP mostra se a cota está com desconto sobre o patrimônio do fundo."],
    ["7. Ações: ser sócio de empresas", "Ao comprar uma ação você vira sócio. O preço oscila bastante no curto prazo, mas empresas boas e que pagam dividendos tendem a premiar quem espera anos. Só invista em ações dinheiro que você não vai precisar tão cedo."],
    ["8. Diversificar e conhecer o seu limite", "Não coloque tudo em um só ativo. Misture classes que reagem de formas diferentes (renda fixa, FIIs, ações, dólar). E defina quanto aceita perder: a carteira certa é aquela que deixa você dormir em dia de queda, sem vender por pânico."],
    ["9. Aportes mensais e paciência", "Investir um valor todo mês (em parcelas) reduz o risco de comprar tudo no pior dia. Os juros compostos fazem a maior parte do trabalho com o tempo: use o Simulador do app para ver o efeito de 5, 10 e 20 anos."],
    ["10. Erros comuns de iniciante", "Comprar o que está 'subindo' sem entender; vender tudo no pânico; entrar com todo o dinheiro de uma vez; esquecer o imposto e as taxas; investir o dinheiro da reserva. Se uma promessa de ganho parece fácil demais, desconfie."],
  ];
  function vAprender() {
    const done = store.get("licoes", []);
    return `<button class="back" data-go="#/mais">${ic("back", "sm")} Mais</button>${secTitle(`${ic("book", "sm")} Trilha para iniciantes`)}<div class="mut" style="font-size:13.5px;margin:-2px 4px 10px">Toque numa lição para ler. Toque em "Entendi" para marcar. ${done.length} de ${LESSONS.length} concluídas.</div>
    ${LESSONS.map(([t, x], i) => `<details class="card lesson"><summary><span>${esc(t)}</span>${done.includes(i) ? '<span class="badge">OK</span>' : ""}</summary><p>${esc(x)}</p><button class="btn sm ghost" data-lesson="${i}">${done.includes(i) ? "Marcar como não lida" : "Entendi"}</button></details>`).join("")}
    <p class="warn">Conteúdo educativo geral, sem recomendação personalizada. A CVM mantém cursos e a Calculadora do Investidor gratuitos em gov.br/cvm e no Portal do Investidor.</p>`;
  }
  function bindAprender(render) { document.querySelectorAll("[data-lesson]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); const i = +b.dataset.lesson, d = store.get("licoes", []); store.set("licoes", d.includes(i) ? d.filter((x) => x !== i) : [...d, i]); render(); })); }

  // ------------------------------------------------------------ bloqueio por PIN (privacidade do patrimônio)
  async function hashPin(pin, salt) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
  function lockScreen() {
    const cfg = store.get("pin", null); if (!cfg || document.getElementById("lock")) return;
    const el = document.createElement("div"); el.id = "lock"; let buf = "";
    el.innerHTML = `<div class="lk"><img src="icons/logo.svg" width="64" height="64" alt=""><h3>VW Wallet</h3><div class="mut">Digite o seu PIN</div><div class="dots">${Array.from({ length: cfg.n }, () => "<i></i>").join("")}</div><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k) => `<button data-k="${k}" ${k === "" ? "disabled" : ""}>${k}</button>`).join("")}</div><button class="back" id="lk-forgot">Esqueci o PIN</button></div>`;
    document.body.appendChild(el);
    const dots = () => el.querySelectorAll(".dots i").forEach((d, i) => d.classList.toggle("on", i < buf.length));
    el.addEventListener("click", async (e) => {
      if (e.target.id === "lk-forgot") { if (confirm("Para entrar sem o PIN é preciso apagar os dados deste aparelho (posições, metas e favoritos). Continuar?")) { Object.keys(localStorage).filter((k) => k.startsWith("vw:")).forEach((k) => localStorage.removeItem(k)); location.reload(); } return; }
      const b = e.target.closest("button[data-k]"); if (!b) return; const k = b.dataset.k;
      if (k === "⌫") buf = buf.slice(0, -1); else if (buf.length < cfg.n) buf += k; dots();
      if (buf.length === cfg.n) { if ((await hashPin(buf, cfg.s)) === cfg.h) el.remove(); else { el.classList.add("shake"); setTimeout(() => el.classList.remove("shake"), 400); buf = ""; dots(); } }
    });
  }
  function initLock() {
    lockScreen();
    document.addEventListener("visibilitychange", () => { if (document.hidden) store.set("hiddenAt", Date.now()); else if (store.get("pin", null) && Date.now() - store.get("hiddenAt", 0) > 30000) lockScreen(); });
  }

  // ------------------------------------------------------------ cartões da aba "Mais"
  function maisExtras() {
    const hasPin = !!store.get("pin", null), dia = store.get("diaAporte", "");
    return secTitle("Ferramentas e aprendizado") + `<div class="card"><div class="row" data-go="#/ferramentas"><span class="cta-i">${ic("chart")}</span><div class="grow"><div class="tk" style="font-size:15px">Simuladores e calculadoras</div><div class="nm">Patrimônio e meta · CDB × LCI × Tesouro · imposto na venda</div></div></div><div class="row" data-go="#/aprender"><span class="cta-i">${ic("book")}</span><div class="grow"><div class="tk" style="font-size:15px">Trilha para iniciantes</div><div class="nm">10 lições curtas, em linguagem simples</div></div></div></div>`
      + secTitle(`${ic("bell", "sm")} Avisos por categoria`) + `<div class="card" style="font-size:14.5px;line-height:1.55">O Alfred usa dois canais no ntfy, e você escolhe quais assinar:<br>• <b>seu tópico</b>: <b>ofertas</b> de compra (só as fortes, no máximo 3 por vez);<br>• <b>seu tópico com “-mercado” no fim</b>: mudança do clima do mercado e notícias importantes.<br>Avisos de mercado em estresse furam o silêncio; o resto não toca das 22h às 7h.</div>`
      + secTitle("Privacidade e lembretes") + `<div class="card"><label>Dia do mês para o aporte (lembrete no app)</label><input id="x-dia" inputmode="numeric" placeholder="ex.: 5" value="${esc(dia)}"><label>${hasPin ? "PIN ativo. Para trocar, digite um novo" : "Bloquear o app com PIN (4 a 6 números)"}</label><input id="x-pin" inputmode="numeric" type="password" maxlength="6" placeholder="••••"><button class="btn" id="x-pin-save">${hasPin ? "Trocar PIN" : "Ativar PIN"}</button>${hasPin ? `<button class="btn ghost" id="x-pin-off">Remover PIN</button>` : ""}<div class="mut" style="font-size:12px;margin-top:8px;line-height:1.5">O PIN protege o app neste aparelho (o app pede de novo depois de 30 segundos fora da tela). Ele não substitui a trava de tela do celular.</div></div>`;
  }
  function bindMaisExtras(render) {
    document.getElementById("x-dia")?.addEventListener("change", (e) => { const d = Math.round(num(e.target.value) ?? 0); store.set("diaAporte", d >= 1 && d <= 28 ? d : null); toast(d >= 1 && d <= 28 ? `Lembrete no dia ${d}.` : "Lembrete desligado."); });
    document.getElementById("x-pin-save")?.addEventListener("click", async () => { const p = document.getElementById("x-pin").value.trim(); if (!/^\d{4,6}$/.test(p)) return toast("Use de 4 a 6 números."); const s = crypto.getRandomValues(new Uint32Array(2)).join("-"); store.set("pin", { n: p.length, s, h: await hashPin(p, s) }); toast("PIN ativado."); render(); });
    document.getElementById("x-pin-off")?.addEventListener("click", () => { if (confirm("Remover o PIN?")) { store.set("pin", null); render(); } });
  }
  function bindHoje(render) { document.getElementById("ap-done")?.addEventListener("click", (e) => { e.stopPropagation(); store.set("aporteFeito", todayBRT().slice(0, 7)); toast("Aporte do mês marcado."); render(); }); }

  return { focusCard, tesouroCard, healthCard, incomeCard, aporteBanner, vFerramentas, bindFerramentas, vAprender, bindAprender, initLock, maisExtras, bindMaisExtras, bindHoje, health };
}
