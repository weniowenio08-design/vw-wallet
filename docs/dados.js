// VW Wallet: proteção e backup dos dados do usuário. Tudo local; nada é enviado a servidor.
// - pede ao Chrome para NÃO apagar os dados do app sozinho (storage.persist)
// - cria um arquivo de backup (opcionalmente criptografado com senha, AES-GCM) para guardar no celular, no Drive, etc.
// - restaura o backup depois de reinstalar o app
export function makeDados(c) {
  const { store, toast } = c;
  const SKIP = new Set(["snap", "hiddenAt", "vistas", "sinaisVistos"]);
  const b64 = (u8) => { let s = ""; u8.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  const dayStr = () => new Date().toISOString().slice(0, 10);

  function collect() {
    const data = {};
    Object.keys(localStorage).filter((k) => k.startsWith("vw:")).forEach((k) => {
      const key = k.slice(3); if (SKIP.has(key)) return;
      try { data[key] = JSON.parse(localStorage.getItem(k)); } catch {}
    });
    return data;
  }
  async function keyFrom(pass, salt) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function pack(pass) {
    const body = { app: "vw-wallet", v: 1, at: new Date().toISOString(), data: collect() };
    if (!pass) return JSON.stringify({ app: "vw-wallet", enc: false, body });
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(pass, salt), new TextEncoder().encode(JSON.stringify(body)));
    return JSON.stringify({ app: "vw-wallet", enc: true, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) });
  }
  async function unpack(text, askPass) {
    const f = JSON.parse(text); if (f.app !== "vw-wallet") throw new Error("formato");
    if (!f.enc) return f.body.data;
    const pass = await askPass(); if (!pass) throw new Error("cancelado");
    try {
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(f.iv) }, await keyFrom(pass, unb64(f.salt)), unb64(f.ct));
      return JSON.parse(new TextDecoder().decode(pt)).data;
    } catch { throw new Error("senha"); }
  }

  async function persist() { try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; } }
  async function isPersisted() { try { return (await navigator.storage?.persisted?.()) ?? false; } catch { return false; } }

  const lastBackup = () => store.get("ultimoBackup", null);
  function backupBanner() {
    const pos = store.get("posicoes", []); if (!pos.length) return "";
    const last = lastBackup(), snooze = store.get("backupAdiado", 0);
    if (Date.now() < snooze) return "";
    if (last && Date.now() - last < 30 * 86400e3) return "";
    return `<div class="card cta" data-go="#/mais" style="border-left:4px solid var(--gold)"><div class="cta-i">${c.ic("shield")}</div><div style="flex:1"><div style="font-weight:800">Guarde uma cópia dos seus dados</div><div class="mut" style="font-size:13px;margin-top:2px">${last ? "O último backup tem mais de 30 dias." : "Você ainda não fez backup."} Se o app for reinstalado, ele volta com tudo.</div></div><button class="btn sm ghost" id="bk-later">Depois</button></div>`;
  }
  function dadosCard() {
    const last = lastBackup();
    return `<div class="card"><div style="font-size:14px;line-height:1.55">Seus dados ficam <b>só neste celular</b>, dentro do app. Para não perdê-los ao reinstalar, guarde uma cópia em arquivo.</div>
      <div class="mut" style="font-size:12.5px;margin-top:6px">${last ? "Último backup: " + new Date(last).toLocaleDateString("pt-BR") : "Nenhum backup feito ainda."} · <span id="bk-persist">verificando proteção…</span></div>
      <label>Senha do backup (opcional, 6 ou mais caracteres; sem ela o arquivo fica legível)</label><input id="bk-pass" type="password" autocomplete="new-password" placeholder="deixe vazio para não proteger">
      <button class="btn" id="bk-save">${c.ic("down", "sm")} Salvar backup no celular</button>
      <button class="btn ghost" id="bk-share">${c.ic("share", "sm")} Enviar backup (Drive, WhatsApp…)</button>
      <button class="btn ghost" id="bk-restore">Restaurar de um arquivo</button><input type="file" id="bk-file" accept="application/json,.json" style="display:none">
      <div class="mut" style="font-size:12px;margin-top:10px;line-height:1.5">O Android não deixa um app da web criar pastas escondidas. O arquivo <b>vw-wallet-backup-DATA.json</b> vai para a pasta <b>Downloads</b>, ou para onde você enviar. Depois de reinstalar o app: aba Mais › Restaurar de um arquivo. Guarde o arquivo em lugar seguro: ele contém a sua carteira.</div>
      <button class="btn ghost" id="wipe" style="color:var(--down)">Apagar tudo deste aparelho</button></div>`;
  }
  function bindDados(render) {
    const pass = () => document.getElementById("bk-pass")?.value || "";
    const passOk = () => { const p = pass(); if (p && p.length < 6) { toast("A senha precisa de 6 ou mais caracteres."); return false; } return true; };
    isPersisted().then((p) => { const el = document.getElementById("bk-persist"); if (el) el.textContent = p ? "armazenamento protegido pelo Chrome" : "armazenamento ainda sem proteção extra (o backup é o seguro)"; });
    const stamp = () => store.set("ultimoBackup", Date.now());
    const mk = async () => new File([await pack(pass())], `vw-wallet-backup-${dayStr()}.json`, { type: "application/json" });
    document.getElementById("bk-save")?.addEventListener("click", async () => {
      if (!passOk()) return;
      const f = await mk(), a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); stamp(); toast("Backup salvo em Downloads."); render();
    });
    document.getElementById("bk-share")?.addEventListener("click", async () => {
      if (!passOk()) return;
      const f = await mk();
      try { if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: "Backup do VW Wallet" }); stamp(); toast("Backup enviado."); render(); } else toast("Este aparelho não envia arquivos daqui: use Salvar backup."); } catch {}
    });
    document.getElementById("bk-restore")?.addEventListener("click", () => document.getElementById("bk-file").click());
    document.getElementById("bk-file")?.addEventListener("change", async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = await unpack(await file.text(), async () => prompt("Digite a senha deste backup:"));
        if (!confirm("Restaurar este backup? Os dados atuais do app serão substituídos.")) return;
        Object.keys(localStorage).filter((k) => k.startsWith("vw:") && k !== "vw:snap").forEach((k) => localStorage.removeItem(k));
        Object.entries(data).forEach(([k, v]) => { if (/^[a-zA-Z][A-Za-z0-9]{0,40}$/.test(k) && !SKIP.has(k) && v != null) store.set(k, v); });
        toast("Backup restaurado."); location.reload();
      } catch (err) { toast(err.message === "senha" ? "Senha incorreta." : err.message === "cancelado" ? "Cancelado." : "Arquivo inválido."); }
      e.target.value = "";
    });
    document.getElementById("wipe")?.addEventListener("click", () => { if (confirm("Apagar posições, metas e ajustes deste aparelho? Faça o backup antes se quiser guardar.")) { Object.keys(localStorage).filter((k) => k.startsWith("vw:")).forEach((k) => localStorage.removeItem(k)); render(); } });
  }
  function bindBanner() { document.getElementById("bk-later")?.addEventListener("click", (e) => { e.stopPropagation(); store.set("backupAdiado", Date.now() + 7 * 86400e3); toast("Lembro em 7 dias."); e.target.closest(".card").remove(); }); }
  return { persist, backupBanner, bindBanner, dadosCard, bindDados };
}
