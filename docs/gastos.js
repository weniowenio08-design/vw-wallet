// Aba "Gastos": anotar (frase livre ou campos), resumo do mês, relatório em PDF, planilha CSV e o assessor no WhatsApp.
// Tudo fica no aparelho (localStorage). Se a nuvem estiver ligada (config.json), os gastos que o bot anota no WhatsApp chegam aqui.
import { CATS, CATS_REC, catOf, parseMessage, summarize, toCsv, newId, hojeBRT, ymAdd, ymLabel, dBR, fBRL, num as numCore } from "./gastos-core.js";
import { relatorioPdf } from "./relatorio.js";
import { makeNuvem } from "./nuvem.js";

export function makeGastos(c) {
  const { store, esc, ic, secTitle, toast } = c;
  const N = makeNuvem({ store, toast });
  const st = { ym: hojeBRT().slice(0, 7), tp: "gasto", editId: null, cloud: null, status: null, code: null, all: false, loading: false };
  const list = () => store.get("gastos", []);
  const save = (l) => store.set("gastos", l);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const cfg = () => ({ on: false, day: 30, hour: 8, ...store.get("gastos_cfg", {}) });
  let syncT = null, rerender = () => {};
  const queueSync = () => { clearTimeout(syncT); syncT = setTimeout(async () => { try { if (!(await N.ativa())) return; save(await N.sync(list())); if (location.hash === "#/gastos" && document.activeElement?.tagName !== "INPUT") rerender(); } catch {} }, 1200); };
  const touch = (id) => { N.markPend(id); queueSync(); };

  // ------------------------------------------------------------ entrega de arquivos (compartilhar no celular ou baixar)
  async function entrega(blob, nome) {
    const file = new File([blob], nome, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: nome }); return; } catch (e) { if (e.name === "AbortError") return; } }
    const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  // ------------------------------------------------------------ telas
  function formCard() {
    const e = st.editId ? list().find((x) => x.id === st.editId) : null;
    const tp = e ? e.tp : st.tp, cats = tp === "receita" ? CATS_REC : CATS;
    return `<details id="g-det" ${e ? "open" : ""}><summary>${e ? "Editando um lançamento" : "Preencher os campos"}</summary>
      <div class="seg" style="margin-top:10px"><button data-gtp="gasto" class="${tp === "gasto" ? "on" : ""}">Gasto</button><button data-gtp="receita" class="${tp === "receita" ? "on" : ""}">Receita</button></div>
      <div class="grid2"><div><label>Valor (R$)</label><input id="g-v" inputmode="decimal" placeholder="0,00" value="${e ? String(e.v).replace(".", ",") : ""}"></div><div><label>Data</label><input id="g-dt" type="date" value="${e ? e.ts : hojeBRT()}"></div></div>
      <label>Descrição</label><input id="g-d" placeholder="ex.: mercado do bairro" value="${e ? esc(e.d) : ""}">
      <label>Categoria</label><select id="g-c">${cats.map((x) => `<option value="${x.k}" ${e && e.c === x.k ? "selected" : ""}>${x.n}</option>`).join("")}</select>
      <button class="btn" id="g-save">${e ? "Salvar alterações" : "Salvar lançamento"}</button>${e ? '<button class="btn ghost" id="g-cancel">Cancelar edição</button>' : ""}</details>`;
  }

  function assessorCard() {
    const s = st.status, k = cfg();
    if (st.cloud === false) return `<div class="card" style="font-size:14.5px;line-height:1.55">O robô do WhatsApp ainda não está ligado neste app. Quando estiver, esta área mostra o botão <b>Conectar ao WhatsApp</b>, e o que você mandar por texto, áudio ou foto da nota cai aqui.<div class="mut" style="font-size:12.5px;margin-top:8px">Enquanto isso, o app funciona normalmente: anote pelos campos acima.</div></div>`;
    if (st.cloud === null || !s) return `<div class="card"><span class="mut">Verificando a conexão…</span></div>`;
    let h = `<div class="card" style="font-size:14.5px;line-height:1.55">`;
    if (!s.linked) {
      h += `Conecte seu WhatsApp ao Uiraçu. Depois é só mandar ao bot: <i>"gastei 45 no mercado"</i>, um <b>áudio</b> ou a <b>foto da nota fiscal</b>.`;
      if (st.code) h += `<div class="stat" style="margin:12px 0"><small>Seu código (vale 15 minutos)</small><b class="num" style="font-size:24px;letter-spacing:.12em">${esc(st.code.code)}</b></div><a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(st.code.bot)}?text=${encodeURIComponent("vincular " + st.code.code)}">Abrir o WhatsApp e enviar o código</a><div class="mut" style="font-size:12.5px;margin-top:8px">O texto já vem escrito. Só enviar.</div>`;
      else h += `<button class="btn" id="g-link">Conectar ao WhatsApp</button>`;
    } else {
      h += `<div class="stat"><small>WhatsApp conectado</small><b class="num">${esc(s.wa || "")}</b></div>
        <div class="mut" style="font-size:12.5px;margin:8px 0 2px">Mande ao bot: texto, áudio ou foto da nota. Comandos: <b>relatório</b>, <b>planilha</b>, <b>resumo</b>, <b>últimos</b>, <b>desfazer</b>, <b>ajuda</b>.</div>
        ${secTitle("Relatório automático")}<button class="btn opt ${k.on ? "sel" : ""}" id="gr-on"><span class="ck">${k.on ? "✓" : ""}</span>Enviar o relatório todo mês</button>
        <div class="grid2"><div><label>No dia</label><select id="gr-day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${k.day === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></div><div><label>Às</label><select id="gr-hour">${Array.from({ length: 17 }, (_, i) => `<option value="${i + 6}" ${k.hour === i + 6 ? "selected" : ""}>${String(i + 6).padStart(2, "0")}h</option>`).join("")}</select></div></div>
        <div class="mut" style="font-size:12.5px;margin-top:8px">Em meses mais curtos, vai no último dia. O WhatsApp só deixa o robô escrever primeiro com um modelo aprovado pela Meta; se ele ainda não estiver aprovado, você recebe um aviso aqui no celular e o PDF chega assim que você responder ao bot.</div>`;
    }
    h += `${secTitle("Avisos deste aplicativo")}<div style="font-size:14px;line-height:1.5">Avisos com o ícone do Uiraçu, sem instalar outro app.</div><button class="btn ghost" id="g-push">${N.pushOn() ? "Avisos ligados neste aparelho ✓" : "Ligar avisos neste aparelho"}</button>${N.pushOn() ? '<button class="btn ghost" id="g-push-test">Enviar um aviso de teste</button>' : ""}</div>`;
    return h;
  }

  function vGastos() {
    const L = list(), S = summarize(L, st.ym), hoje = hojeBRT().slice(0, 7);
    const kp = (t, v, cls = "") => `<div class="stat"><small>${t}</small><b class="num ${cls}">${fBRL(v)}</b></div>`;
    let h = `<div class="gtop"><button class="icbtn" data-go="#/hoje" aria-label="Voltar">${ic("back")}</button><div class="gtit">Gastos</div></div><div class="mnav"><button class="icbtn" data-gm="-1" aria-label="Mês anterior">${ic("back")}</button><div class="mlabel">${cap(ymLabel(st.ym))}</div><button class="icbtn flip" data-gm="1" aria-label="Próximo mês" ${st.ym >= hoje ? "disabled" : ""}>${ic("back")}</button></div>`;
    h += `<div class="grid2" style="margin-bottom:10px">${kp("Receitas", S.receitas, "up")}${kp("Gastos", S.gastos)}${kp("Investido", S.investido)}${kp("Saldo", S.saldo, S.saldo >= 0 ? "up" : "down")}</div>`;
    h += `<div class="mut" style="font-size:12.5px;line-height:1.5;margin:0 4px 6px">Escreva na barra de baixo, como falaria: "uber 23,50 ontem", "+1500 salário", "dia 12 farmácia 37".</div>` + secTitle(`${ic("plus", "sm")} Anotar com os campos`) + `<div class="card">${formCard()}</div>`;
    h += secTitle(`${ic("chart", "sm")} Para onde foi o dinheiro`) + `<div class="card">` + (S.porCat.length ? S.porCat.map((x) => `<div class="gcat"><div class="gc-h"><span><i class="gdot" style="background:${x.cor}"></i>${esc(x.n)}</span><b class="num">${fBRL(x.v)} <small class="mut">${Math.round(x.pct * 100)}%</small></b></div><div class="bar"><i style="width:${Math.max(2, x.pct * 100)}%;background:${x.cor}"></i></div></div>`).join("") : `<div class="empty">Nada anotado em ${esc(ymLabel(st.ym))}.</div>`) + `</div>`;
    h += secTitle(`${ic("calendar", "sm")} Lançamentos (${S.itens.length})`) + `<div class="card">` + (S.itens.length ? (st.all ? S.itens : S.itens.slice(0, 30)).map((x) => `<div class="gl"><div class="gl-m"><div class="gl-d">${esc(x.d || catOf(x.c, x.tp).n)}</div><div class="mut gl-s">${dBR(x.ts).slice(0, 5)} · ${esc(catOf(x.c, x.tp).n)}${x.src === "wa" ? " · WhatsApp" : ""}</div></div><div class="num gl-v ${x.tp === "receita" ? "up" : ""}">${x.tp === "receita" ? "+ " : ""}${fBRL(x.v)}</div><button class="icbtn" data-gedit="${x.id}" aria-label="Editar">${ic("edit", "sm")}</button><button class="icbtn" data-gdel="${x.id}" aria-label="Excluir">${ic("trash", "sm")}</button></div>`).join("") + (S.itens.length > 30 && !st.all ? `<button class="btn ghost" id="g-all">Ver todos (${S.itens.length})</button>` : "") : `<div class="empty">Sem lançamentos neste mês.</div>`) + `</div>`;
    h += secTitle(`${ic("down", "sm")} Relatório e planilha`) + `<div class="card"><button class="btn" id="g-pdf" style="margin-top:0">Relatório de ${esc(ymLabel(st.ym))} (PDF)</button><button class="btn ghost" id="g-csv">Planilha do mês (CSV, abre no Excel)</button><button class="btn ghost" id="g-csv-all">Planilha com tudo</button>${st.status?.linked ? '<button class="btn ghost" id="g-send">Enviar o relatório para o meu WhatsApp</button>' : ""}</div>`;
    h += secTitle(`${ic("user", "sm")} Assessor no WhatsApp`) + assessorCard();
    return h;
  }

  // ------------------------------------------------------------ ações
  function addFromParsed(p) {
    const it = { id: newId(), ts: p.date, v: p.v, c: p.c, d: p.d, tp: p.tp, src: "app", deleted: 0 };
    save([...list(), it]); touch(it.id);
    st.ym = p.date.slice(0, 7);
    toast(`${p.tp === "receita" ? "Receita" : "Gasto"} anotado: ${fBRL(p.v)} · ${catOf(p.c, p.tp).n}`);
  }

  function bindGastos(render) {
    rerender = render;
    // barra de digitação fixa embaixo (como num chat): escreva o gasto e envie
    document.getElementById("gbar")?.remove();
    const bar = document.createElement("div"); bar.id = "gbar"; bar.className = "gbar";
    bar.innerHTML = '<input id="gq" placeholder="gastei 45 no mercado" autocomplete="off" enterkeyhint="send" aria-label="Anotar gasto"><button class="btn sm" id="gq-ok">Anotar</button>';
    document.body.appendChild(bar);
    const $ = (s) => document.querySelector(s);
    if (st.cloud === null && !st.loading) {
      st.loading = true;
      N.ativa().then(async (on) => {
        st.cloud = on;
        if (on) { try { st.status = await N.status(); save(await N.sync(list())); const k = st.status.settings; if (k) store.set("gastos_cfg", { on: !!k.report_on, day: k.report_day, hour: k.report_hour }); } catch { st.status = { linked: false, erro: true }; } }
      }).finally(() => { st.loading = false; if (location.hash === "#/gastos") render(); });
    }
    document.querySelectorAll("[data-gm]").forEach((b) => b.addEventListener("click", () => { st.ym = ymAdd(st.ym, +b.dataset.gm); st.all = false; render(); }));
    document.querySelectorAll("[data-gtp]").forEach((b) => b.addEventListener("click", () => { st.tp = b.dataset.gtp; if (st.editId) { const l = list(), e = l.find((x) => x.id === st.editId); if (e) e.tp = st.tp; } const dv = { v: $("#g-v")?.value, d: $("#g-d")?.value, dt: $("#g-dt")?.value }; render(); const set = (id, v) => { const el = $(id); if (el && v) el.value = v; }; set("#g-v", dv.v); set("#g-d", dv.d); set("#g-dt", dv.dt); $("#g-det").open = true; }));
    const quick = () => { const p = parseMessage($("#gq").value, hojeBRT()); if (!p.ok) return toast("Não achei o valor. Ex.: gastei 45 no mercado"); addFromParsed(p); render(); };
    $("#gq-ok")?.addEventListener("click", quick); $("#gq")?.addEventListener("keydown", (e) => { if (e.key === "Enter") quick(); });
    $("#g-save")?.addEventListener("click", () => {
      const v = numCore($("#g-v").value), ts = $("#g-dt").value || hojeBRT(); if (!v || v <= 0) return toast("Digite o valor.");
      const tp = st.editId ? list().find((x) => x.id === st.editId)?.tp || st.tp : st.tp;
      if (st.editId) { const l = list(), e = l.find((x) => x.id === st.editId); Object.assign(e, { v, ts, d: $("#g-d").value.trim(), c: $("#g-c").value, tp }); save(l); touch(e.id); st.editId = null; toast("Lançamento atualizado."); }
      else { const it = { id: newId(), ts, v, c: $("#g-c").value, d: $("#g-d").value.trim(), tp, src: "app", deleted: 0 }; save([...list(), it]); touch(it.id); toast("Lançamento salvo."); }
      st.ym = ts.slice(0, 7); render();
    });
    $("#g-cancel")?.addEventListener("click", () => { st.editId = null; render(); });
    document.querySelectorAll("[data-gedit]").forEach((b) => b.addEventListener("click", () => { st.editId = b.dataset.gedit; render(); $("#g-det")?.scrollIntoView({ behavior: "smooth", block: "center" }); }));
    document.querySelectorAll("[data-gdel]").forEach((b) => b.addEventListener("click", () => { if (!confirm("Excluir este lançamento?")) return; const l = list(), e = l.find((x) => x.id === b.dataset.gdel); if (e) { e.deleted = 1; save(l); touch(e.id); } render(); }));
    $("#g-all")?.addEventListener("click", () => { st.all = true; render(); });
    $("#g-pdf")?.addEventListener("click", () => entrega(new Blob([relatorioPdf(list(), st.ym)], { type: "application/pdf" }), `Uiracu-gastos-${st.ym}.pdf`));
    $("#g-csv")?.addEventListener("click", () => entrega(new Blob([toCsv(list().filter((x) => x.ts.startsWith(st.ym)))], { type: "text/csv;charset=utf-8" }), `Uiracu-gastos-${st.ym}.csv`));
    $("#g-csv-all")?.addEventListener("click", () => entrega(new Blob([toCsv(list())], { type: "text/csv;charset=utf-8" }), "Uiracu-gastos-tudo.csv"));
    $("#g-send")?.addEventListener("click", async () => { try { const r = await N.enviarRelatorio(st.ym); toast(r.modo === "direto" ? "Enviei o PDF e a planilha no seu WhatsApp." : "Mande um “oi” ao bot no WhatsApp e o PDF chega na hora."); } catch (e) { toast("Não consegui pedir: " + e.message); } });
    $("#g-link")?.addEventListener("click", async () => { try { st.code = await N.registrar(); render(); } catch (e) { toast("Não consegui gerar o código: " + e.message); } });
    $("#gr-on")?.addEventListener("click", async () => { const k = cfg(); k.on = !k.on; store.set("gastos_cfg", k); try { await N.ajustes({ report_on: k.on ? 1 : 0, report_day: k.day, report_hour: k.hour }); } catch (e) { toast("Não salvou na nuvem: " + e.message); } render(); });
    const saveWhen = async () => { const k = { ...cfg(), day: +$("#gr-day").value, hour: +$("#gr-hour").value }; store.set("gastos_cfg", k); try { await N.ajustes({ report_on: k.on ? 1 : 0, report_day: k.day, report_hour: k.hour }); toast("Combinado: dia " + k.day + ", " + String(k.hour).padStart(2, "0") + "h."); } catch (e) { toast("Não salvou na nuvem: " + e.message); } };
    $("#gr-day")?.addEventListener("change", saveWhen); $("#gr-hour")?.addEventListener("change", saveWhen);
    $("#g-push")?.addEventListener("click", async () => { try { await N.ligarPush(); toast("Avisos ligados neste aparelho."); render(); } catch (e) { toast(e.message === "sem_api" ? "A nuvem ainda não está ligada." : e.message); } });
    $("#g-push-test")?.addEventListener("click", async () => { try { await N.testePush(); toast("Aviso enviado. Deve chegar em segundos."); } catch (e) { toast("Falhou: " + e.message); } });
  }

  // cartão "Avisos do Uiraçu" na aba Mais: liga o push do próprio app (ícone e selo do app, sem outro aplicativo)
  async function pushBox(el, render) {
    if (!el) return;
    if (!(await N.ativa())) { el.innerHTML = 'Os avisos com o <b>ícone do Uiraçu</b>, sem instalar outro app, ligam assim que a nuvem do app estiver ativa. Até lá, use o plano B abaixo.'; return; }
    const on = N.pushOn();
    el.innerHTML = `Receba os avisos de oferta, venda e notícia importante <b>com o ícone do Uiraçu</b>, sem instalar outro app.<button class="btn ${on ? "ghost" : ""}" id="pb-on">${on ? "Avisos ligados neste aparelho ✓" : "Ligar avisos do Uiraçu"}</button>${on ? '<button class="btn ghost" id="pb-test">Enviar um aviso de teste</button>' : ""}<div class="mut" style="font-size:12.5px;margin-top:8px">No Oppo, deixe o Uiraçu sem restrição de bateria (Ajustes > Bateria) para os avisos chegarem com o app fechado.</div>`;
    el.querySelector("#pb-on").addEventListener("click", async () => { try { await N.ligarPush(); toast("Avisos ligados neste aparelho."); pushBox(el, render); } catch (e) { toast(e.message === "sem_api" ? "A nuvem ainda não está ligada." : e.message); } });
    el.querySelector("#pb-test")?.addEventListener("click", async () => { try { await N.testePush(); toast("Aviso enviado. Deve chegar em segundos."); } catch (e) { toast("Falhou: " + e.message); } });
  }

  // chamado ao abrir o app e ao voltar para ele: puxa o que o bot anotou
  async function syncAgora() { try { if (!(await N.ativa())) return false; save(await N.sync(list())); return true; } catch { return false; } }
  return { vGastos, bindGastos, syncAgora, pushBox, nuvem: N };
}
