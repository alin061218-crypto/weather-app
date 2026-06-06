/**
 * Service Worker — PWA 离线支持
 * 策略：
 * - 静态资源：Cache First（优先缓存）
 * - API 请求：Network First（网络优先，失败时降级）
 */

const CACHE_NAME = 'weather-app-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/config.js',
    '/js/api.js',
    '/js/ui.js',
    '/js/chart.js',
    '/js/particles.js',
    '/js/advice.js',
    '/js/storage.js',
    '/js/utils.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

// ===== Install：预缓存静态资源 =====
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                // 单个文件失败不影响整体
                console.warn('SW: 部分资源缓存失败', err);
            });
        })
    );
    // 立即激活，不等待旧 SW
    self.skipWaiting();
});

// ===== Activate：清理旧缓存 =====
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// ===== Fetch：请求拦截 =====
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // 非 GET 请求不处理
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // API 请求：Network First
    if (url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('ipapi.co') ||
        url.hostname.includes('geocoding-api')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // 静态资源：Cache First
    event.respondWith(cacheFirst(request));
});

// ===== Cache First 策略 =====
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        // 离线且无缓存，返回空
        return new Response('', { status: 408 });
    }
}

// ===== Network First 策略 =====
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        // 网络失败，尝试缓存
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
