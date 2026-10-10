/**
 * ==========================================================================
 * QUICKCHAT - SERVICE WORKER (SW.JS)
 * Lưu cache tài nguyên tĩnh hỗ trợ khởi chạy offline hoàn toàn
 * ==========================================================================
 */

const CACHE_NAME = 'quickchat-cache-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/themes.css',
  './js/utils.js',
  './js/storage.js',
  './js/transport.js',
  './js/ui.js',
  './js/groups.js',
  './js/files.js',
  './js/links.js',
  './js/search.js',
  './js/settings.js',
  './js/chat.js',
  './js/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Chiến lược Cache First, Network Fallback
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).catch(() => {
        // Trả về index.html nếu mất mạng khi chuyển trang
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
