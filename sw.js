/**
 * BUSLA LMS - Progressive Web App Service Worker (sw.js)
 * Architecture: STRICT Network-First with Zero-Stale-Data Guarantee
 * Desktop & Mobile Support with Instant Auto-Updates
 */

const CACHE_VERSION = 'busla-pwa-v1.0.3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
    './index.html',
    './manifest.webmanifest',
    './css/roadmap.css',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/icon-maskable-512.png',
    './assets/icons/BUSLA-icon.png',
    './assets/icons/1.png',
    './js/custom-dialogs.js',
    './js/omni-search.js',
    './js/pwa-handler.js'
];

// Domains and endpoints that must NEVER be intercepted by the cache (Always fresh from network)
const NETWORK_ONLY_ORIGINS = [
    'supabase.co',
    'script.google.com',
    'script.googleusercontent.com',
    'youtube.com',
    'www.youtube.com',
    'googlevideo.com',
    'ytimg.com',
    'api.github.com'
];

// Helper to safely match cache or return a valid synthetic Response
async function safeMatchOrFallback(request, fallbackUrl = null) {
    try {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (fallbackUrl) {
            const fb = await caches.match(fallbackUrl);
            if (fb) return fb;
        }
    } catch (e) {
        // Cache error fallback
    }
    // NEVER return undefined to event.respondWith - must always be a valid Response object!
    return new Response('Network error and asset not in cache', {
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
    });
}

// 1. Service Worker Installation
self.addEventListener('install', (event) => {
    // Immediately activate new service worker without waiting in queue
    self.skipWaiting();

    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('SW Precache: Some assets failed to cache', err);
            });
        })
    );
});

// 2. Service Worker Activation & Cache Cleanup
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            // Claim all open clients immediately so the new worker takes control right away
            self.clients.claim(),
            // Clean up any old caches from previous versions
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
                            return caches.delete(key);
                        }
                    })
                );
            })
        ]).then(() => {
            // Notify all clients that a new version is active
            return self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({
                        type: 'BUSLA_SW_ACTIVATED',
                        version: CACHE_VERSION
                    });
                });
            });
        })
    );
});

// 3. Request Interception: Strict Network-First Strategy
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Rule 0: Skip non-HTTP(S) schemes, WebSockets (Live Server reload), or chrome extensions
    if (!url.protocol.startsWith('http') || url.pathname.includes('/ws')) {
        return;
    }

    // Rule 1: Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Rule 2: NEVER cache Supabase, Apps Script, YouTube or external dynamic APIs (Zero Stale Data!)
    if (NETWORK_ONLY_ORIGINS.some(origin => url.hostname.includes(origin))) {
        return; // Pass through directly to network
    }

    // Rule 3: HTML Pages / Navigation Requests (Strict Network-First)
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => safeMatchOrFallback(request, './index.html'))
        );
        return;
    }

    // Rule 4: JavaScript & CSS Code (Strict Network-First with Offline Fallback)
    if (request.destination === 'script' || request.destination === 'style') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => safeMatchOrFallback(request))
        );
        return;
    }

    // Rule 5: Images & Media (Stale-While-Revalidate with background refresh)
    if (request.destination === 'image' || request.destination === 'font') {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const fetchPromise = fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(DYNAMIC_CACHE).then((cache) => {
                                cache.put(request, responseClone);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => safeMatchOrFallback(request));

                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // Default: Network First
    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => safeMatchOrFallback(request))
    );
});

// 4. Support for direct message commands
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
