/* 서희의 단어 바다 — 서비스 워커
 *
 * 앱 화면(index.html)은 "네트워크 먼저": 인터넷이 되면 항상 Netlify의 최신 파일을 받아 오고,
 * 인터넷이 끊겼을 때만 저장해 둔 사본으로 열어요. 그래서 재배포하면 다음에 열 때 바로 반영돼요.
 * 아이콘·글꼴·라이브러리는 "저장본 먼저 + 뒤에서 새로 받기"로 빠르게 열어요.
 *
 * 재배포할 때 아래 VERSION을 바꾸면 예전 저장본이 통째로 정리돼요.
 */
const VERSION = '2026-11-10-14';
const CACHE = 'danbada-' + VERSION;
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('danbada-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAppShell(req, url){
  if (req.mode === 'navigate') return true;
  if (url.origin !== self.location.origin) return false;
  return url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('manifest.json');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Claude API 등 외부 요청은 건드리지 않음
  if (url.hostname === 'api.anthropic.com') return;

  // 1) 앱 화면: 네트워크 먼저 → 실패하면 저장본
  if (isAppShell(req, url)){
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok){
            const copy = res.clone();
            const key = req.mode === 'navigate' ? './index.html' : req;
            caches.open(CACHE).then(c => c.put(key, copy));
          }
          if (res && res.ok) return res;
          return caches.match(req, { ignoreSearch: true })
            .then(hit => hit || caches.match('./index.html'))
            .then(hit => hit || res);
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // 2) 아이콘·글꼴·CDN 라이브러리: 저장본 먼저, 뒤에서 새로 받아 갱신
  const sameOrigin = url.origin === self.location.origin;
  const cdn = /(^|\.)cdnjs\.cloudflare\.com$|(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$/.test(url.hostname);
  if (!sameOrigin && !cdn) return;
  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(hit => {
        const net = fetch(req)
          .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});
