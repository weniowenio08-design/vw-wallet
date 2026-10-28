// Service worker: o app abre mesmo sem internet (mostra o último dado salvo) e se atualiza sozinho.
const SHELL = "vw-shell-v6";
const DATA = "vw-data-v6";
const FILES = ["./", "index.html", "style.css", "main.js", "extras.js", "dados.js", "gastos.js", "gastos-core.js", "relatorio.js", "nuvem.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/badge-96.png", "icons/logo.svg", "fonts/BricolageGrotesque-Bold.woff"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.includes("/data/")) {
    // dados: rede primeiro, cache como reserva
    // guarda no máximo 60 arquivos de dados (as séries de cada ativo aberto) para não encher o armazenamento
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(DATA).then(async (c) => { await c.put(e.request, cp); const ks = await c.keys(); if (ks.length > 60) await c.delete(ks[0]); }); return r; }).catch(() => caches.match(e.request)));
  } else {
    // app: rede primeiro (2,5 s) para pegar a versão nova ao abrir; sem rede, usa o cache
    e.respondWith(new Promise((res) => {
      let done = false; const fromCache = () => caches.match(e.request).then((hit) => hit || fetch(e.request));
      const t = setTimeout(() => { if (!done) { done = true; fromCache().then(res, () => res(Response.error())); } }, 2500);
      fetch(e.request).then((r) => { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, cp)); if (!done) { done = true; clearTimeout(t); res(r); } }).catch(() => { if (!done) { done = true; clearTimeout(t); fromCache().then(res, () => res(Response.error())); } });
    }));
  }
});
// Avisos push (Web Push): chegam com o ícone e o selo do próprio app, sem instalar outro aplicativo.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Uiraçu", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Uiraçu", {
    body: d.body || "", icon: "icons/icon-192.png", badge: "icons/badge-96.png",
    tag: d.tag || undefined, renotify: !!d.tag, vibrate: [80, 40, 80], data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs[0]; if (c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
