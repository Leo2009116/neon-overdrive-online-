const CACHE = "neon-ovd-online-v1";
const FILES = [
  "./", "./index.html", "./data.js", "./save.js", "./decor.js",
  "./engine.js", "./gacha.js", "./parry.js", "./systems.js",
  "./net.js", "./multiplayer.js", "./ui.js", "./main.js", "./manifest.json"
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
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => r))
  );
});