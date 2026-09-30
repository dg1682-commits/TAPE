/**
 * sw.js - PWA Service Worker
 * 크롬 브라우저가 본 웹앱을 단순 바로가기가 아닌 '독립형 APK 앱(WebAPK)'으로 승격하여
 * 상단 주소창을 100% 영구 제거하고 설치할 수 있도록 해주는 서비스 워커입니다.
 */

const CACHE_NAME = 'tape-sing-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './tape-renderer.js',
  './audio-engine.js',
  './firebase-db.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // 네트워크 우선, 실패 시 캐시 폴백 (항상 최신 코드 유지)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
