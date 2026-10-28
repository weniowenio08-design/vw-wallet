// Cliente da "nuvem" do Uiraçu (Cloudflare Worker): sincroniza gastos, vincula o WhatsApp e liga os avisos push.
// Tudo é opcional: sem `config.json` com "api", o app funciona 100% no aparelho.
import { cleanItem } from "./gastos-core.js";

export function makeNuvem({ store, toast }) {
  let cfg = null;
  const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  const token = () => { let t = store.get("nuvem_token", null); if (!t) { t = hex(32); store.set("nuvem_token", t); } return t; };
  async function config() {
    if (cfg) return cfg;
    try { const r = await fetch("config.json", { cache: "no-cache" }); cfg = r.ok ? await r.json() : {}; } catch { cfg = {}; }
    return cfg;
  }
  async function api(path, body, raw) {
    const c = await config(); if (!c.api) throw new Error("sem_api");
    const r = await fetch(c.api + path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + token(), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { let m = ""; try { m = (await r.json()).erro || ""; } catch {} const e = new Error(m || "http_" + r.status); e.status = r.status; throw e; }
    return raw ? r : r.json();
  }
  const ativa = async () => !!(await config()).api;

  /** Junta o que está no aparelho com o que o bot anotou. Devolve a lista completa. */
  async function sync(list) {
    const since = store.get("gastos_sync", 0), pend = store.get("gastos_pend", []);
    const send = list.filter((x) => pend.includes(x.id));
    const r = await api("/api/sync", { since, items: send });
    const byId = new Map(list.map((x) => [x.id, x]));
    for (const it of r.items) { const c = cleanItem(it); if (c && !pend.includes(c.id)) byId.set(c.id, c); }
    store.set("gastos_sync", r.now); store.set("gastos_pend", []);
    return [...byId.values()];
  }
  const markPend = (id) => { const p = store.get("gastos_pend", []); if (!p.includes(id)) { p.push(id); store.set("gastos_pend", p); } };

  const status = () => api("/api/status");
  const registrar = () => api("/api/register", {});
  const ajustes = (o) => api("/api/settings", o);
  const enviarRelatorio = (ym) => api("/api/report/send", { ym });

  // ----------------------------------------------------------- avisos push (sem instalar outro app)
  const b64u = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  async function ligarPush() {
    const c = await config(); if (!c.api || !c.vapid) throw new Error("sem_api");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("O navegador deste aparelho não suporta avisos push.");
    const perm = await Notification.requestPermission(); if (perm !== "granted") throw new Error("Permissão de avisos negada.");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(c.vapid) });
    await api("/api/push/subscribe", { sub: sub.toJSON() });
    store.set("push_on", true);
    return true;
  }
  const testePush = () => api("/api/push/test", {});
  const pushOn = () => store.get("push_on", false) && "Notification" in window && Notification.permission === "granted";

  return { ativa, config, sync, markPend, status, registrar, ajustes, enviarRelatorio, ligarPush, testePush, pushOn, token };
}
