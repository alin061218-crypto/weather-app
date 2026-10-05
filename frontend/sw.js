/**
 * Service Worker - PWA offline shell.
 * The cache name follows the server-injected shell stylesheet hash.
 */

const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
];

let CACHE_NAME = 'weather-app-unknown';
let STATIC_ASSETS = [...SHELL_ASSETS];

function importMapFrom(html) {
    const match = html.match(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i);
    if (!match) throw new Error('index.html has no importmap');
    const imports = JSON.parse(match[1]).imports;
    if (!imports || typeof imports !== 'object') throw new Error('index.html importmap has no imports');
    return imports;
}

function shellHashFrom(html) {
    const match = html.match(/<link\b[^>]*href=["']([^"']*\/css\/style\.css(?:\?[^"']*)?)["'][^>]*>/i);
    const href = match?.[1];
    const hash = href && new URL(href, self.location.origin).searchParams.get('v');
    if (!/^[a-f0-9]{8}$/i.test(hash || '')) throw new Error('index.html style.css hash is missing or invalid');
    return hash;
}

async function derivePrecacheAssets(failures) {
    let html;
    try {
        const response = await fetch('/index.html', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        html = await response.text();
        const imports = importMapFrom(html);
        STATIC_ASSETS = [...SHELL_ASSETS, ...Object.values(imports)];
        CACHE_NAME = `weather-app-${shellHashFrom(html)}`;
    } catch (error) {
        failures.push(`/index.html (derive importmap/cache name): ${error.message}`);
        STATIC_ASSETS = [...SHELL_ASSETS];
    }
    return STATIC_ASSETS;
}

async function installShell() {
    const failures = [];
    const assets = await derivePrecacheAssets(failures);
    const cache = await caches.open(CACHE_NAME);
    let successCount = 0;
    for (const asset of assets) {
        try {
            await cache.add(asset);
            successCount += 1;
        } catch (error) {
            failures.push(`${asset}: ${error.message}`);
        }
    }
    if (failures.length) {
        console.error(`SW: precache incomplete (${successCount}/${assets.length} succeeded)`, failures);
    } else {
        console.info(`SW: precache complete (${successCount}/${assets.length} succeeded)`);
    }
}

self.addEventListener('install', event => {
    event.waitUntil(installShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

function isApiOrAdmin(url) {
    return url.origin === self.location.origin
        && (url.pathname.startsWith('/api/') || url.pathname === '/admin' || url.pathname.startsWith('/admin/'));
}

function isStaticShell(url) {
    return url.origin === self.location.origin && (
        url.pathname === '/' ||
        url.pathname === '/index.html' ||
        url.pathname.startsWith('/css/') ||
        url.pathname.startsWith('/js/') ||
        url.pathname.startsWith('/vendor/') ||
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/data/')
    );
}

function isExternalNetworkOnly(url) {
    return url.hostname.includes('open-meteo.com')
        || url.hostname.includes('ipapi.co')
        || url.hostname.includes('geocoding-api');
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // API/admin requests are always network-only, including authenticated responses.
    if (isApiOrAdmin(url)) {
        event.respondWith(fetch(request));
        return;
    }
    // The weather/location providers are also network-only.
    if (isExternalNetworkOnly(url)) {
        event.respondWith(fetch(request));
        return;
    }
    // Only same-origin static shell paths are cache-first. Other requests pass through.
    if (isStaticShell(url)) event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('message', event => {
    if (event.data?.type !== 'clear-caches') return;
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))));
});
