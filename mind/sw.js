/* My Mind app — service worker. Network first (so updates arrive immediately), cached copy when offline.
 * The backend (script.google.com) is never cached: My Mind keeps its own offline copy of your data. */
var CACHE = 'lcm-mind-v2';
var SHELL = ['/mind/', '/mind/manifest.webmanifest', '/mind/icon-192.png', '/mind/icon-512.png', '/assets/img/logo-uNv_1gp3.png',
  '/portal/style.css', '/portal/config.js', '/portal/core.js', '/portal/mind-seed.js', '/portal/mind.js', '/portal/app.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  var sameOrigin = url.origin === self.location.origin, fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return; // API calls go straight to the network
  if (fonts) { // fonts rarely change: cache first
    e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(function (res) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res; }); }));
    return;
  }
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    // offline: exact match first, then the same file without its ?v= version
    return caches.match(req).then(function (hit) { return hit || caches.match(req, { ignoreSearch: true }); })
      .then(function (hit) { return hit || (req.mode === 'navigate' ? caches.match('/mind/', { ignoreSearch: true }) : Response.error()); });
  }));
});
