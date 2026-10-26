// Service worker: o app abre mesmo sem internet (mostra o último dado salvo) e se atualiza sozinho.
const SHELL = "vw-shell-v3";
const DATA = "vw-data-v3";
const FILES = ["./", "index.html", "style.css", "main.js", "extras.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/logo.svg"];

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
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(DATA).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
  } else {
    // app: cache primeiro, atualiza em segundo plano
    e.respondWith(caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((r) => { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, cp)); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow("./"))));
});
