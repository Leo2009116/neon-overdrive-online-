const CACHE = "neon-ovd-online-v3"; // 版本號提升
const FILES = [
  "./data.js", "./save.js", "./decor.js", "./engine.js", "./gacha.js", 
  "./parry.js", "./systems.js", "./net.js", "./multiplayer.js", "./ui.js", "./main.js", "./manifest.json"
  // 故意不把 index.html 放進去，避免被永久緩存
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  // 如果是 HTML 請求，強制走網路 (Network First)
  if (e.request.mode === 'navigate' || e.request.url.includes('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // JS 走緩存優先
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => r))
  );
});