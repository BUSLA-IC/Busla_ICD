/**
 * BUSLA LMS - Progressive Web App Service Worker (sw.js)
 * Architecture: STRICT Network-First with Zero-Stale-Data Guarantee
 * Desktop & Mobile Support with Instant Auto-Updates
 */

const CACHE_VERSION = 'busla-pwa-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
    './index.html',
    './manifest.webmanifest',
    './css/roadmap.css',
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
                    // Update cache copy with fresh page
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Network failed (Offline mode) -> return cached copy or index fallback
                    return caches.match(request).then((cached) => {
                        return cached || caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // Rule 4: JavaScript & CSS Code (Strict Network-First with Offline Fallback)
    // Ensures updates to code are ALWAYS fetched fresh when online!
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
                .catch(() => {
                    return caches.match(request);
                })
        );
        return;
    }

    // Rule 5: Images & Media (Stale-While-Revalidate for performance, with background refresh)
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
                    .catch(() => cachedResponse);

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
            .catch(() => {
                return caches.match(request);
            })
    );
});

// 4. Support for direct message commands
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
