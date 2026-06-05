const CACHE_NAME = 'drive-player-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon-512-maskable.png'
];

// --- INSTALLATION : Mise en cache des assets ---
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// --- ACTIVATION : Nettoyage des anciens caches ---
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// --- STRATÉGIE NETWORK/CACHE (Cache-first pour l'offline) ---
self.addEventListener('fetch', (e) => {
    // Ne pas intercepter les requêtes non locales (ex: requêtes chrome extension)
    if (!e.request.url.startsWith(self.location.origin)) return;

    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(e.request);
        })
    );
});

// --- INTERCEPTION DES CLICS SUR LA NOTIFICATION ---
self.addEventListener('notificationclick', (e) => {
    const action = e.action;
    
    // Si l'utilisateur clique sur la notification hors d'un bouton d'action spécifique
    if (!action.startsWith('playlist-')) {
        e.notification.close();
        // Optionnel : Ouvrir l'application au premier plan si clic global
        e.waitUntil(
            clients.matchAll({ type: 'window' }).then((clientList) => {
                if (clientList.length > 0) return clientList[0].focus();
                return clients.openWindow('./');
            })
        );
        return;
    }

    // Extraction du nom de la playlist choisie (ex: "Chill")
    const targetPlaylist = action.replace('playlist-', '');

    // Transmission de l'action à l'application ouverte (contexte audio actif en tâche de fond)
    e.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            if (clientList.length > 0) {
                // Envoyer l'ordre de changement à la page web
                clientList[0].postMessage({
                    action: 'switch-playlist',
                    playlist: targetPlaylist
                });
            }
        })
    );
});
