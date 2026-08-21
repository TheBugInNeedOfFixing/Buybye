/* BuyBye service worker: offline shell + push display. */
var CACHE = 'buybye-v3';
var SHELL = [
  './', './index.html',
  './css/base.css', './css/components.css',
  './js/format.js', './js/finance.js', './js/store.js', './js/ui.js',
  './js/auth.js', './js/sync.js', './js/push.js', './js/onboarding.js',
  './js/budget.js', './js/worthit.js', './js/daily.js', './js/insights.js',
  './js/settings.js', './js/app.js', './js/firebase-config.js',
  './manifest.webmanifest', './assets/icon.svg', './assets/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .catch(function () { /* a missing optional file must not block install */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Network first, falling back to cache, so edits show up immediately
   while the app still opens with no connection. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  /* GitHub Pages serves app files with max-age=600, and a plain fetch()
     inside a service worker is answered from the browser HTTP cache. That
     made "network first" quietly return ten-minute-old code. Asking for a
     revalidation sends a conditional request instead: usually a cheap 304,
     but never stale. */
  var path = new URL(req.url).pathname;
  var isCode = /[.](?:js|css|html|webmanifest|json)$/i.test(path) ||
               req.mode === 'navigate' || path.slice(-1) === '/';
  var hit = isCode
    ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : req;

  e.respondWith(
    fetch(hit).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = {}; }
  var n = data.notification || data;
  e.waitUntil(self.registration.showNotification(n.title || 'BuyBye', {
    body: n.body || '',
    icon: './assets/icon.svg',
    badge: './assets/icon.svg',
    tag: n.tag || 'buybye'
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) return list[i].focus();
    }
    return clients.openWindow('./');
  }));
});
