// Aba "Gastos": anotar (frase livre ou campos), resumo do mês, relatório em PDF, planilha CSV e o assessor no WhatsApp.
// Tudo fica no aparelho (localStorage). Se a nuvem estiver ligada (config.json), os gastos que o bot anota no WhatsApp chegam aqui.
import { CATS, CATS_REC, catOf, parseMessage, summarize, toCsv, newId, hojeBRT, ymAdd, ymLabel, dBR, fBRL, num as numCore } from "./gastos-core.js";
import { relatorioPdf } from "./relatorio.js";
import { serie, comparaCategorias, statusLimite, alertasNovos, fixosPendentes, progressoMeta, sobraDoMes, filtrar } from "./gastos-plus.js";
import { makeNuvem } from "./nuvem.js";

export function makeGastos(c) {
  const { store, esc, ic, secTitle, toast } = c;
  const N = makeNuvem({ store, toast });
  const st = { ym: hojeBRT().slice(0, 7), tp: "gasto", editId: null, cloud: null, status: null, code: null, all: false, loading: false, q: "", cat: "", todo: false, fotosOk: false };
  const fotos = new Set();
  const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const list = () => store.get("gastos", []);
  const save = (l) => store.set("gastos", l);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const cfg = () => ({ on: false, day: 30, hour: 8, ...store.get("gastos_cfg", {}) });
  let syncT = null, rerender = () => {};
  const queueSync = () => { clearTimeout(syncT); syncT = setTimeout(async () => { try { if (!(await N.ativa())) return; save(await N.sync(list())); if (location.hash === "#/gastos" && document.activeElement?.tagName !== "INPUT") rerender(); } catch {} }, 1200); };
  const touch = (id) => { N.markPend(id); queueSync(); };

  // ------------------------------------------------------------ configurações locais dos recursos extras
  const orc = () => store.get("gastos_orc", {}), lim = () => +store.get("gastos_lim", 0) || 0, fixos = () => store.get("gastos_fixos", []), meta = () => store.get("gastos_meta", null);

  // ------------------------------------------------------------ fotos das notas (ficam só neste aparelho, em IndexedDB)
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open("uiracu-fotos", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function fotoPut(id, blob) { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction("f", "readwrite"); t.objectStore("f").put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); fotos.add(id); }
  async function fotoGet(id) { const db = await idb(); return new Promise((res) => { const q = db.transaction("f").objectStore("f").get(id); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); }
  async function fotoDel(id) { try { const db = await idb(); await new Promise((res) => { const t = db.transaction("f", "readwrite"); t.objectStore("f").delete(id); t.oncomplete = res; t.onerror = res; }); } catch {} fotos.delete(id); }
  async function fotosCarrega() { try { const db = await idb(); const k = await new Promise((res) => { const q = db.transaction("f").objectStore("f").getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); }); k.forEach((x) => fotos.add(x)); return k.length; } catch { return 0; } }
  async function comprime(file) { const bm = await createImageBitmap(file), s = Math.min(1, 1280 / Math.max(bm.width, bm.height)), cv = document.createElement("canvas"); cv.width = Math.round(bm.width * s); cv.height = Math.round(bm.height * s); cv.getContext("2d").drawImage(bm, 0, 0, cv.width, cv.height); return new Promise((res) => cv.toBlob(res, "image/jpeg", 0.72)); }
  function verFoto(id) {
    fotoGet(id).then((b) => { if (!b) return toast("Não achei a foto."); const u = URL.createObjectURL(b), ov = document.createElement("div"); ov.className = "gfoto"; ov.innerHTML = '<img alt="Foto da nota"><button class="btn">Fechar</button>'; ov.querySelector("img").src = u; ov.addEventListener("click", () => { ov.remove(); URL.revokeObjectURL(u); }); document.body.appendChild(ov); });
  }

  // ------------------------------------------------------------ gastos fixos e alertas de limite
  function gerarFixos() { const novos = fixosPendentes(fixos(), list(), hojeBRT()); if (!novos.length) return false; save([...list(), ...novos]); novos.forEach((x) => N.markPend(x.id)); queueSync(); return true; }
  async function avisa(titulo, corpo) {
    toast(titulo + ". " + corpo);
    try { if (typeof Notification !== "undefined" && Notification.permission === "granted") (await navigator.serviceWorker.getRegistration())?.showNotification(titulo, { body: corpo, icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "limite", data: { url: "./#/gastos" } }); } catch {}
  }
  function checaAlertas() {
    const ym = hojeBRT().slice(0, 7), S = summarize(list(), ym), done = store.get("gastos_alertas", {}), feitos = done[ym] || (done[ym] = {});
    const novos = alertasNovos({ S, limite: lim(), orcamentos: orc(), feitos, fBRL });
    if (!novos.length) return;
    for (const k of Object.keys(done)) if (k < ymAdd(ym, -2)) delete done[k];
    store.set("gastos_alertas", done); novos.slice(0, 2).forEach((a) => avisa(a.titulo, a.corpo));
  }

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
      <label>Foto da nota (opcional; fica só neste aparelho)${e && fotos.has(e.id) ? " · já tem uma foto" : ""}</label><input id="g-foto" type="file" accept="image/*">
      <button class="btn" id="g-save">${e ? "Salvar alterações" : "Salvar lançamento"}</button>${e ? '<button class="btn ghost" id="g-cancel">Cancelar edição</button>' : ""}</details>`;
  }

  function assessorCard() {
    const s = st.status, k = cfg();
    if (st.cloud === false) return `<div class="card" style="font-size:14.5px;line-height:1.55">O assessor de chat (Telegram e WhatsApp) ainda não está ligado neste app. Quando estiver, esta área mostra os botões de conectar, e o que você mandar por texto, áudio ou foto da nota cai aqui.<div class="mut" style="font-size:12.5px;margin-top:8px">Enquanto isso, o app funciona normalmente: anote pela barra de baixo.</div></div>`;
    if (st.cloud === null || !s) return `<div class="card"><span class="mut">Verificando a conexão…</span></div>`;
    const can = s.canais || {}, tgOn = s.canal === "telegram";
    let h = `<div class="card" style="font-size:14.5px;line-height:1.55">`;
    if (!s.linked || st.code) {
      if (!can.tg && !can.wa) h += `Nenhum canal de chat está ligado ainda no servidor. Assim que o Telegram ou o WhatsApp for ligado, os botões de conectar aparecem aqui.`;
      else {
        h += `Conecte um chat ao Uiraçu. Depois é só mandar ao bot: <i>"gastei 45 no mercado"</i>, um <b>áudio</b> ou a <b>foto da nota fiscal</b>.`;
        if (st.code) {
          const tg = st.code.canal === "tg", link = tg ? (st.code.tgBot ? `https://t.me/${st.code.tgBot}?start=${st.code.code}` : "") : `https://wa.me/${st.code.bot}?text=${encodeURIComponent("vincular " + st.code.code)}`;
          h += `<div class="stat" style="margin:12px 0"><small>Seu código (vale 15 minutos)</small><b class="num" style="font-size:24px;letter-spacing:.12em">${esc(st.code.code)}</b></div>`;
          h += link ? `<a class="btn" target="_blank" rel="noopener" href="${esc(link)}">Abrir o ${tg ? "Telegram" : "WhatsApp"} e enviar o código</a><div class="mut" style="font-size:12.5px;margin-top:8px">${tg ? "Toque em Iniciar no bot." : "O texto já vem escrito. Só enviar."}</div>` : `<div class="mut" style="font-size:13px">Abra o bot no Telegram e envie: <b>vincular ${esc(st.code.code)}</b></div>`;
        } else h += (can.tg ? `<button class="btn" data-glink="tg">Conectar ao Telegram</button>` : "") + (can.wa ? `<button class="btn ${can.tg ? "ghost" : ""}" data-glink="wa">Conectar ao WhatsApp</button>` : "");
      }
    } else {
      h += `<div class="stat"><small>${tgOn ? "Telegram" : "WhatsApp"} conectado</small><b class="num">${esc((tgOn ? s.tg : s.wa) || "")}</b></div>
        <div class="mut" style="font-size:12.5px;margin:8px 0 2px">Mande ao bot: texto, áudio ou foto da nota. Comandos: <b>relatório</b>, <b>planilha</b>, <b>resumo</b>, <b>últimos</b>, <b>desfazer</b>, <b>ajuda</b>.</div>
        ${secTitle("Relatório automático")}<button class="btn opt ${k.on ? "sel" : ""}" id="gr-on"><span class="ck">${k.on ? "✓" : ""}</span>Enviar o relatório todo mês</button>
        <div class="grid2"><div><label>No dia</label><select id="gr-day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${k.day === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></div><div><label>Às</label><select id="gr-hour">${Array.from({ length: 17 }, (_, i) => `<option value="${i + 6}" ${k.hour === i + 6 ? "selected" : ""}>${String(i + 6).padStart(2, "0")}h</option>`).join("")}</select></div></div>
        <div class="mut" style="font-size:12.5px;margin-top:8px">Em meses mais curtos, vai no último dia. ${tgOn ? "No Telegram o robô escreve a qualquer hora, sem modelo de mensagem." : "O WhatsApp só deixa o robô escrever primeiro com um modelo aprovado pela Meta; se ele ainda não estiver aprovado, você recebe um aviso aqui no celular e o PDF chega assim que você responder ao bot."}</div>`;
      if (can.tg && !tgOn || can.wa && tgOn) h += `<div style="margin-top:10px"><button class="btn ghost sm" data-glink="${tgOn ? "wa" : "tg"}">Conectar também ao ${tgOn ? "WhatsApp" : "Telegram"}</button></div>`;
    }
    const sem = !!st.status?.settings?.weekly_on;
    h += `${secTitle("Resumo semanal")}<button class="btn opt ${sem ? "sel" : ""}" id="gw-on"><span class="ck">${sem ? "✓" : ""}</span>Todo domingo, às 18h</button><div class="mut" style="font-size:12.5px;margin-top:6px">Quanto você gastou na semana e as maiores categorias, por aviso no celular e no chat.</div>${secTitle("Avisos deste aplicativo")}<div style="font-size:14px;line-height:1.5">Avisos com o ícone do Uiraçu, sem instalar outro app.</div><button class="btn ghost" id="g-push">${N.pushOn() ? "Avisos ligados neste aparelho ✓" : "Ligar avisos neste aparelho"}</button>${N.pushOn() ? '<button class="btn ghost" id="g-push-test">Enviar um aviso de teste</button>' : ""}</div>`;
    return h;
  }

  // ------------------------------------------------------------ cartões dos recursos extras
  const corNivel = (n) => (n === "estourou" ? "var(--down)" : n === "alerta" ? "var(--gold)" : "var(--up)");
  function limiteCard(S) {
    const L = lim(), s = statusLimite(S.gastos, L);
    let h = secTitle(`${ic("target", "sm")} Limite do mês`) + `<div class="card">`;
    if (s) h += `<div class="gc-h"><span>${fBRL(S.gastos)} de ${fBRL(L)}</span><b class="num">${Math.round(s.p * 100)}%</b></div><div class="bar"><i style="width:${Math.min(100, s.p * 100)}%;background:${corNivel(s.nivel)}"></i></div><div class="mut" style="font-size:13px;margin-top:6px">${s.nivel === "estourou" ? "Você passou do limite em " + fBRL(S.gastos - L) + "." : "Ainda dá para gastar " + fBRL(L - S.gastos) + " este mês."} O app avisa aos 80% e aos 100%.</div>`;
    h += `<div class="gq" style="margin-top:10px"><input id="gl-v" inputmode="decimal" placeholder="${L ? "Novo limite (R$)" : "Quanto quer gastar no mês? (R$)"}"><button class="btn sm" id="gl-save">${L ? "Mudar" : "Definir"}</button></div>${L ? '<button class="btn ghost sm" id="gl-rm" style="margin-top:8px">Remover limite</button>' : ""}</div>`;
    return h;
  }
  function categoriasCard(L) {
    const C = comparaCategorias(L, st.ym), O = orc();
    let h = secTitle(`${ic("chart", "sm")} Para onde foi o dinheiro`) + `<div class="card">`;
    h += C.length ? C.map((x) => {
      const o = O[x.k], so = o ? statusLimite(x.v, o) : null, cor = so ? corNivel(so.nivel) : x.cor, w = so ? Math.min(100, so.p * 100) : x.pct * 100;
      const dl = x.delta == null ? (x.ant ? "" : "novo neste mês") : `${x.delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(x.delta * 100))}% que no mês passado`;
      return `<div class="gcat"><div class="gc-h"><span><i class="gdot" style="background:${x.cor}"></i>${esc(x.n)}</span><b class="num">${fBRL(x.v)} <small class="mut">${o ? "de " + fBRL(o) : Math.round(x.pct * 100) + "%"}</small></b></div><div class="bar"><i style="width:${Math.max(2, w)}%;background:${cor}"></i></div>${dl ? `<div class="gdelta ${x.delta != null ? (x.delta >= 0 ? "down" : "up") : "mut"}">${dl}</div>` : ""}</div>`;
    }).join("") : `<div class="empty">Nada anotado em ${esc(ymLabel(st.ym))}.</div>`;
    h += `<details style="margin-top:8px"><summary>Definir orçamento por categoria</summary><div class="mut" style="font-size:12.5px;margin:6px 0">Deixe em branco o que não quiser limitar. O app avisa quando a categoria estoura.</div><div class="grid2">${CATS.filter((c) => c.k !== "investimento").map((c) => `<div><label>${esc(c.n)} (R$)</label><input data-orc="${c.k}" inputmode="decimal" value="${O[c.k] ? String(O[c.k]).replace(".", ",") : ""}"></div>`).join("")}</div><button class="btn" id="go-save">Salvar orçamentos</button></details></div>`;
    return h;
  }
  function graficoCard(L) {
    const sr = serie(L, st.ym), W = 340, base = 118, mx = Math.max(1, ...sr.flatMap((s) => [s.gastos, s.receitas]));
    let g = ""; sr.forEach((s, i) => { const x = 12 + i * 54, hr = (s.receitas / mx) * 100, hg = (s.gastos / mx) * 100; g += `<rect x="${x}" y="${base - hr}" width="15" height="${hr}" rx="3" style="fill:var(--up)" opacity=".85"/><rect x="${x + 18}" y="${base - hg}" width="15" height="${hg}" rx="3" style="fill:var(--gold)"/><text x="${x + 16.5}" y="${base + 16}" text-anchor="middle" style="fill:var(--mut);font-size:11px">${MES3[+s.ym.slice(5) - 1]}</text>`; });
    const com = sr.filter((s) => s.gastos || s.receitas), media = com.length ? com.reduce((a, s) => a + s.receitas - s.gastos, 0) / com.length : 0;
    return secTitle(`${ic("chart", "sm")} Últimos 6 meses`) + `<div class="card"><svg viewBox="0 0 ${W} 140" width="100%" role="img" aria-label="Receitas e gastos dos últimos 6 meses">${g}</svg><div class="chips" style="margin-top:6px"><span class="chip"><i class="gdot" style="background:var(--up)"></i>Receitas</span><span class="chip"><i class="gdot" style="background:var(--gold)"></i>Gastos</span></div>${com.length ? `<div class="mut" style="font-size:13px;margin-top:8px">Sobra média por mês: <b class="${media >= 0 ? "up" : "down"}">${fBRL(media)}</b></div>` : ""}</div>`;
  }
  function metaCard(L, S) {
    const M = meta(), P = progressoMeta(L, M, hojeBRT().slice(0, 7));
    let h = secTitle(`${ic("target", "sm")} Meta de economia`) + `<div class="card">`;
    if (P) h += `<div class="gc-h"><span>${esc(M.nome || "Minha meta")}</span><b class="num">${Math.round(P.pct * 100)}%</b></div><div class="bar"><i style="width:${Math.max(2, P.pct * 100)}%;background:var(--up)"></i></div><div class="mut" style="font-size:13px;margin-top:6px">Guardado desde ${esc(ymLabel(M.ini))}: <b>${fBRL(P.guardado)}</b> de ${fBRL(M.alvo)}. ${P.mesesParaFechar === 0 ? "Meta batida! 🎉" : P.mesesParaFechar ? `No ritmo de ${fBRL(P.mediaMensal)} por mês, faltam cerca de ${P.mesesParaFechar} ${P.mesesParaFechar === 1 ? "mês" : "meses"}.` : "Anote mais meses para eu estimar o prazo."}</div><div class="mut" style="font-size:12px;margin-top:4px">"Guardado" = receitas menos gastos (o que você investe conta como guardado).</div><button class="btn" id="gm-aporte">Usar a sobra deste mês (${fBRL(sobraDoMes(S))}) como aporte</button><button class="btn ghost sm" id="gm-rm" style="margin-top:8px">Remover meta</button>`;
    else h += `<div class="mut" style="font-size:13px;margin-bottom:8px">Defina quanto quer juntar. O app soma o que sobra de cada mês e mostra o prazo.</div><div class="grid2"><div><label>Nome</label><input id="gm-n" placeholder="ex.: reserva de emergência"></div><div><label>Quanto juntar (R$)</label><input id="gm-v" inputmode="decimal" placeholder="10000"></div></div><button class="btn" id="gm-save">Criar meta</button>`;
    return h + "</div>";
  }
  function fixosCard() {
    const F = fixos();
    return secTitle(`${ic("calendar", "sm")} Gastos fixos e assinaturas`) + `<div class="card"><div class="mut" style="font-size:13px;margin-bottom:6px">Lançam sozinhos todo mês, no dia marcado (aluguel, internet, Netflix...).</div>${F.length ? F.map((f) => `<div class="gl"><div class="gl-m"><div class="gl-d">${esc(f.d)}</div><div class="mut gl-s">todo dia ${f.dia} · ${esc(catOf(f.c).n)}${f.ativo ? "" : " · pausado"}</div></div><div class="num gl-v">${fBRL(f.v)}</div><button class="icbtn" data-fxon="${esc(f.id)}" aria-label="${f.ativo ? "Pausar" : "Ativar"}">${ic(f.ativo ? "check" : "plus", "sm")}</button><button class="icbtn" data-fxdel="${esc(f.id)}" aria-label="Excluir">${ic("trash", "sm")}</button></div>`).join("") : ""}
      <details ${F.length ? "" : "open"} style="margin-top:6px"><summary>Adicionar um gasto fixo</summary><div class="grid2"><div><label>Descrição</label><input id="fx-d" placeholder="ex.: Netflix"></div><div><label>Valor (R$)</label><input id="fx-v" inputmode="decimal" placeholder="0,00"></div><div><label>Categoria</label><select id="fx-c">${CATS.map((c) => `<option value="${c.k}">${c.n}</option>`).join("")}</select></div><div><label>Dia do mês</label><select id="fx-dia">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></div></div><button class="btn" id="fx-add">Adicionar</button></details></div>`;
  }
  function lancamentosCard(L, S) {
    const base = st.todo ? L.filter((x) => !x.deleted).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)) : S.itens, cats = [...new Set(base.map((x) => x.c))];
    const lista = filtrar(base, { q: st.q, cat: st.cat }), n = st.all ? lista.length : 30;
    let h = secTitle(`${ic("search", "sm")} Lançamentos (${lista.length})`) + `<div class="card"><input id="gs-q" placeholder="Buscar (ex.: mercado, uber)" value="${esc(st.q)}" autocomplete="off"><div class="fchips" style="margin:8px 0"><button data-gcat="" class="${st.cat ? "" : "on"}">Todas</button>${cats.map((k) => `<button data-gcat="${k}" class="${st.cat === k ? "on" : ""}">${esc(catOf(k, base.find((x) => x.c === k)?.tp).n)}</button>`).join("")}</div><button class="btn ghost sm" id="gs-todo" style="margin-bottom:6px">${st.todo ? "Só este mês" : "Todos os meses"}</button>`;
    h += lista.length ? lista.slice(0, n).map((x) => `<div class="gl"><div class="gl-m"><div class="gl-d">${esc(x.d || catOf(x.c, x.tp).n)}</div><div class="mut gl-s">${st.todo ? dBR(x.ts) : dBR(x.ts).slice(0, 5)} · ${esc(catOf(x.c, x.tp).n)}${x.src === "wa" ? " · WhatsApp" : ""}</div></div><div class="num gl-v ${x.tp === "receita" ? "up" : ""}">${x.tp === "receita" ? "+ " : ""}${fBRL(x.v)}</div>${fotos.has(x.id) ? `<button class="icbtn" data-gfoto="${esc(x.id)}" aria-label="Ver a foto da nota">${ic("receipt", "sm")}</button>` : ""}<button class="icbtn" data-gedit="${esc(x.id)}" aria-label="Editar">${ic("edit", "sm")}</button><button class="icbtn" data-gdel="${esc(x.id)}" aria-label="Excluir">${ic("trash", "sm")}</button></div>`).join("") + (lista.length > 30 && !st.all ? `<button class="btn ghost" id="g-all">Ver todos (${lista.length})</button>` : "") : `<div class="empty">${st.q || st.cat ? "Nada encontrado com esse filtro." : "Sem lançamentos neste mês."}</div>`;
    return h + "</div>";
  }

  function vGastos() {
    const L = list(), S = summarize(L, st.ym), hoje = hojeBRT().slice(0, 7);
    const kp = (t, v, cls = "") => `<div class="stat"><small>${t}</small><b class="num ${cls}">${fBRL(v)}</b></div>`;
    let h = `<div class="gtop"><button class="icbtn" data-go="#/hoje" aria-label="Voltar">${ic("back")}</button><div class="gtit">Gastos</div></div><div class="mnav"><button class="icbtn" data-gm="-1" aria-label="Mês anterior">${ic("back")}</button><div class="mlabel">${cap(ymLabel(st.ym))}</div><button class="icbtn flip" data-gm="1" aria-label="Próximo mês" ${st.ym >= hoje ? "disabled" : ""}>${ic("back")}</button></div>`;
    h += `<div class="grid2" style="margin-bottom:10px">${kp("Receitas", S.receitas, "up")}${kp("Gastos", S.gastos)}${kp("Investido", S.investido)}${kp("Saldo", S.saldo, S.saldo >= 0 ? "up" : "down")}</div>`;
    h += limiteCard(S);
    h += `<div class="mut" style="font-size:12.5px;line-height:1.5;margin:0 4px 6px">Escreva na barra de baixo, como falaria: "uber 23,50 ontem", "+1500 salário", "dia 12 farmácia 37".</div>` + secTitle(`${ic("plus", "sm")} Anotar com os campos`) + `<div class="card">${formCard()}</div>`;
    h += categoriasCard(L) + graficoCard(L) + metaCard(L, S) + fixosCard() + lancamentosCard(L, S);
    h += secTitle(`${ic("down", "sm")} Relatório e planilha`) + `<div class="card"><button class="btn" id="g-pdf" style="margin-top:0">Relatório de ${esc(ymLabel(st.ym))} (PDF)</button><button class="btn ghost" id="g-csv">Planilha do mês (CSV, abre no Excel)</button><button class="btn ghost" id="g-csv-all">Planilha com tudo</button>${st.status?.linked ? '<button class="btn ghost" id="g-send">Enviar o relatório para o meu chat</button>' : ""}</div>`;
    h += secTitle(`${ic("user", "sm")} Assessor de gastos no chat`) + assessorCard();
    return h;
  }

  // ------------------------------------------------------------ ações
  function addFromParsed(p) {
    const it = { id: newId(), ts: p.date, v: p.v, c: p.c, d: p.d, tp: p.tp, src: "app", deleted: 0 };
    save([...list(), it]); touch(it.id); checaAlertas();
    st.ym = p.date.slice(0, 7);
    toast(`${p.tp === "receita" ? "Receita" : "Gasto"} anotado: ${fBRL(p.v)} · ${catOf(p.c, p.tp).n}`);
  }

  function bindGastos(render) {
    rerender = render;
    if (gerarFixos()) checaAlertas();
    if (!st.fotosOk) { st.fotosOk = true; fotosCarrega().then((n) => { if (n && location.hash === "#/gastos") render(); }); }
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
    $("#g-save")?.addEventListener("click", async () => {
      const v = numCore($("#g-v").value), ts = $("#g-dt").value || hojeBRT(); if (!v || v <= 0) return toast("Digite o valor.");
      const tp = st.editId ? list().find((x) => x.id === st.editId)?.tp || st.tp : st.tp, file = $("#g-foto")?.files?.[0]; let id;
      if (st.editId) { const l = list(), e = l.find((x) => x.id === st.editId); Object.assign(e, { v, ts, d: $("#g-d").value.trim(), c: $("#g-c").value, tp }); save(l); touch(e.id); id = e.id; st.editId = null; toast("Lançamento atualizado."); }
      else { const it = { id: newId(), ts, v, c: $("#g-c").value, d: $("#g-d").value.trim(), tp, src: "app", deleted: 0 }; save([...list(), it]); touch(it.id); id = it.id; toast("Lançamento salvo."); }
      if (file) { try { await fotoPut(id, await comprime(file)); } catch { toast("Salvei o lançamento, mas não consegui guardar a foto."); } }
      checaAlertas(); st.ym = ts.slice(0, 7); render();
    });
    $("#g-cancel")?.addEventListener("click", () => { st.editId = null; render(); });
    document.querySelectorAll("[data-gedit]").forEach((b) => b.addEventListener("click", () => { st.editId = b.dataset.gedit; render(); $("#g-det")?.scrollIntoView({ behavior: "smooth", block: "center" }); }));
    document.querySelectorAll("[data-gdel]").forEach((b) => b.addEventListener("click", () => { if (!confirm("Excluir este lançamento?")) return; const l = list(), e = l.find((x) => x.id === b.dataset.gdel); if (e) { e.deleted = 1; save(l); touch(e.id); fotoDel(e.id); } render(); }));
    $("#g-all")?.addEventListener("click", () => { st.all = true; render(); });
    $("#g-pdf")?.addEventListener("click", () => entrega(new Blob([relatorioPdf(list(), st.ym)], { type: "application/pdf" }), `Uiracu-gastos-${st.ym}.pdf`));
    $("#g-csv")?.addEventListener("click", () => entrega(new Blob([toCsv(list().filter((x) => x.ts.startsWith(st.ym)))], { type: "text/csv;charset=utf-8" }), `Uiracu-gastos-${st.ym}.csv`));
    $("#g-csv-all")?.addEventListener("click", () => entrega(new Blob([toCsv(list())], { type: "text/csv;charset=utf-8" }), "Uiracu-gastos-tudo.csv"));
    $("#g-send")?.addEventListener("click", async () => { try { const r = await N.enviarRelatorio(st.ym); toast(r.modo === "direto" ? "Enviei o PDF e a planilha no seu chat." : "Mande um “oi” ao bot no WhatsApp e o PDF chega na hora."); } catch (e) { toast("Não consegui pedir: " + e.message); } });
    document.querySelectorAll("[data-glink]").forEach((b) => b.addEventListener("click", async () => { try { const ch = b.dataset.glink; st.code = { ...(await N.registrar()), canal: ch }; render();
      const ate = Date.now() + 15 * 60e3, iv = setInterval(async () => {
        if (Date.now() > ate || location.hash !== "#/gastos" || !st.code) return clearInterval(iv);
        try { const s2 = await N.status(); if (ch === "tg" ? s2.tg : s2.wa) { clearInterval(iv); st.status = s2; st.code = null; toast("Conectado!"); render(); } } catch {}
      }, 3000); } catch (e) { toast("Não consegui gerar o código: " + e.message); } }));
    $("#gr-on")?.addEventListener("click", async () => { const k = cfg(); k.on = !k.on; store.set("gastos_cfg", k); try { await N.ajustes({ report_on: k.on ? 1 : 0, report_day: k.day, report_hour: k.hour }); } catch (e) { toast("Não salvou na nuvem: " + e.message); } render(); });
    const saveWhen = async () => { const k = { ...cfg(), day: +$("#gr-day").value, hour: +$("#gr-hour").value }; store.set("gastos_cfg", k); try { await N.ajustes({ report_on: k.on ? 1 : 0, report_day: k.day, report_hour: k.hour }); toast("Combinado: dia " + k.day + ", " + String(k.hour).padStart(2, "0") + "h."); } catch (e) { toast("Não salvou na nuvem: " + e.message); } };
    $("#gr-day")?.addEventListener("change", saveWhen); $("#gr-hour")?.addEventListener("change", saveWhen);
    $("#g-push")?.addEventListener("click", async () => { try { await N.ligarPush(); toast("Avisos ligados neste aparelho."); render(); } catch (e) { toast(e.message === "sem_api" ? "A nuvem ainda não está ligada." : e.message); } });
    $("#g-push-test")?.addEventListener("click", async () => { try { await N.testePush(); toast("Aviso enviado. Deve chegar em segundos."); } catch (e) { toast("Falhou: " + e.message); } });
    // ---- limite do mês, orçamentos, meta, gastos fixos, busca e fotos
    $("#gl-save")?.addEventListener("click", () => { const v = numCore($("#gl-v").value); if (!v || v <= 0) return toast("Digite o valor do limite."); store.set("gastos_lim", v); checaAlertas(); render(); });
    $("#gl-rm")?.addEventListener("click", () => { store.set("gastos_lim", 0); render(); });
    $("#go-save")?.addEventListener("click", () => { const o = {}; document.querySelectorAll("[data-orc]").forEach((i) => { const v = numCore(i.value); if (v > 0) o[i.dataset.orc] = v; }); store.set("gastos_orc", o); checaAlertas(); toast("Orçamentos salvos."); render(); });
    $("#gm-save")?.addEventListener("click", () => { const v = numCore($("#gm-v").value); if (!v || v <= 0) return toast("Digite quanto quer juntar."); store.set("gastos_meta", { nome: $("#gm-n").value.trim() || "Minha meta", alvo: v, ini: hojeBRT().slice(0, 7) }); render(); });
    $("#gm-rm")?.addEventListener("click", () => { if (confirm("Remover a meta?")) { store.set("gastos_meta", null); render(); } });
    $("#gm-aporte")?.addEventListener("click", () => { const S = summarize(list(), hojeBRT().slice(0, 7)), v = sobraDoMes(S), k = hojeBRT().slice(0, 7), o = store.get("aporteMes", {}); if (!v) return toast("Este mês ainda não sobrou nada para aportar."); o[k] = v; store.set("aporteMes", o); toast(`Aporte do mês no Uiraçu: ${fBRL(v)}.`); });
    $("#fx-add")?.addEventListener("click", () => { const v = numCore($("#fx-v").value), d = $("#fx-d").value.trim(); if (!d || !v || v <= 0) return toast("Preencha a descrição e o valor."); store.set("gastos_fixos", [...fixos(), { id: newId().slice(0, 8), d, v, c: $("#fx-c").value, dia: +$("#fx-dia").value, ativo: true, desde: hojeBRT().slice(0, 7) }]); gerarFixos(); checaAlertas(); toast("Gasto fixo adicionado."); render(); });
    document.querySelectorAll("[data-fxon]").forEach((b) => b.addEventListener("click", () => { store.set("gastos_fixos", fixos().map((f) => (f.id === b.dataset.fxon ? { ...f, ativo: !f.ativo, desde: f.ativo ? f.desde : hojeBRT().slice(0, 7) } : f))); gerarFixos(); render(); }));
    document.querySelectorAll("[data-fxdel]").forEach((b) => b.addEventListener("click", () => { if (confirm("Excluir este gasto fixo? Os lançamentos já feitos ficam.")) { store.set("gastos_fixos", fixos().filter((f) => f.id !== b.dataset.fxdel)); render(); } }));
    $("#gs-q")?.addEventListener("input", (e) => { st.q = e.target.value; st.all = false; Promise.resolve(render()).then(() => { const i = $("#gs-q"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); });
    document.querySelectorAll("[data-gcat]").forEach((b) => b.addEventListener("click", () => { st.cat = b.dataset.gcat; st.all = false; render(); }));
    $("#gs-todo")?.addEventListener("click", () => { st.todo = !st.todo; st.all = false; render(); });
    document.querySelectorAll("[data-gfoto]").forEach((b) => b.addEventListener("click", () => verFoto(b.dataset.gfoto)));
    $("#gw-on")?.addEventListener("click", async () => { const on = !st.status?.settings?.weekly_on; try { await N.ajustes({ weekly_on: on ? 1 : 0 }); if (st.status) st.status.settings = { ...(st.status.settings || {}), weekly_on: on ? 1 : 0 }; toast(on ? "Resumo semanal ligado: domingo, 18h." : "Resumo semanal desligado."); } catch (e) { toast("Não consegui salvar: " + e.message); } render(); });
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
  async function syncAgora() { gerarFixos(); try { if (!(await N.ativa())) { checaAlertas(); return false; } save(await N.sync(list())); gerarFixos(); checaAlertas(); return true; } catch { return false; } }
  return { vGastos, bindGastos, syncAgora, pushBox, nuvem: N };
}
