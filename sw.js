// 서비스워커: 앱 파일은 저장본 우선(빠름·오프라인), content.js은 네트워크 우선(최신 반영)
const V = 'manual-v17';
const SHELL = ['./', 'index.html', 'app.js', 'board.js', 'board-config.js', 'style.css', 'manifest.json', 'content.js', 'icon-192.png', 'img/geonhyeonmang-model.jpg', 'img/hero-banner.jpg', 'img/card-enforce.jpg', 'img/card-admin.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith('content.js')) {
    // 느린 회선 대비: 5초 안에 못 받으면 저장본 사용
    e.respondWith(
      new Promise((resolve) => {
        const t = setTimeout(() => caches.match('content.js').then((m) => m && resolve(m)), 5000);
        fetch(req).then((r) => {
          clearTimeout(t);
          const cp = r.clone();
          caches.open(V).then((c) => c.put('content.js', cp));
          resolve(r);
        }).catch(() => { clearTimeout(t); caches.match('content.js').then((m) => resolve(m || Response.error())); });
      })
    );
    return;
  }

  // 나머지: 저장본 즉시 응답 + 뒤에서 갱신
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((m) => {
      const net = fetch(req).then((r) => {
        if (r.ok) { const cp = r.clone(); caches.open(V).then((c) => c.put(req, cp)); }
        return r;
      }).catch(() => m);
      return m || net;
    })
  );
});
