// --- CONFIGURATION & ETAT GLOBAL ---
const DB_NAME = 'DrivePlayerDB';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

let db = null;
let currentPlaylist = 'Chill';
let tracksQueue = [];
let currentIndex = -1;

const audio = document.getElementById('audio-element');
const trackTitleEl = document.getElementById('track-title');
const playlistDisplayEl = document.getElementById('current-playlist-display');
const trackListEl = document.getElementById('track-list');

// --- INITIALISATION ---
window.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    setupEventListeners();
    setupMediaSession();
    await loadPlaylist(currentPlaylist);
    registerServiceWorker();
});

// --- GESTION INDEXEDDB ---
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                // Utilisation d'une clé auto-incrémentée
                database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(); };
        request.onerror = (e) => reject(e.target.error);
    });
}

// Sauvegarde d'un fichier MP3 sous forme de Blob
function saveTrack(name, blob, playlist) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const track = { name, blob, playlist, addedAt: Date.now() };
        
        const request = store.add(track);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// Récupération des morceaux d'une playlist spécifique
function getTracksByPlaylist(playlist) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const tracks = [];

        store.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                if (cursor.value.playlist === playlist) {
                    tracks.push(cursor.value);
                }
                cursor.continue();
            } else {
                resolve(tracks);
            }
        };
    });
}

// --- LOGIQUE DU LECTEUR ---
async function loadPlaylist(playlistName) {
    currentPlaylist = playlistName;
    playlistDisplayEl.textContent = `Playlist : ${currentPlaylist}`;
    
    // Mettre à jour les onglets UI
    document.querySelectorAll('.btn-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.playlist === playlistName);
    });

    tracksQueue = await getTracksByPlaylist(currentPlaylist);
    renderTrackList();
    
    if (tracksQueue.length > 0) {
        currentIndex = 0;
        loadTrack(currentIndex, false); // Charge sans jouer automatiquement au changement d'onglet
    } else {
        currentIndex = -1;
        audio.src = '';
        trackTitleEl.textContent = "Playlist vide";
    }
}

function loadTrack(index, shouldPlay = true) {
    if (index < 0 || index >= tracksQueue.length) return;
    
    const track = tracksQueue[index];
    // Création d'une URL locale sécurisée pour le Blob binaire stocké
    if (audio.src) URL.revokeObjectURL(audio.src); 
    audio.src = URL.createObjectURL(track.blob);
    trackTitleEl.textContent = track.name;
    
    updateMediaSessionMetadata(track.name);
    updateTrackListHighlight();

    if (shouldPlay) {
        audio.play().catch(() => {/* Gestion blocage autoplay navigateur */});
        document.getElementById('btn-play-pause').textContent = '⏸';
    }
}

function togglePlay() {
    if (tracksQueue.length === 0) return;
    if (audio.paused) {
        audio.play();
        document.getElementById('btn-play-pause').textContent = '⏸';
    } else {
        audio.pause();
        document.getElementById('btn-play-pause').textContent = '▶';
    }
}

function nextTrack() {
    if (tracksQueue.length === 0) return;
    currentIndex = (currentIndex + 1) % tracksQueue.length;
    loadTrack(currentIndex, true);
}

function prevTrack() {
    if (tracksQueue.length === 0) return;
    currentIndex = (currentIndex - 1 + tracksQueue.length) % tracksQueue.length;
    loadTrack(currentIndex, true);
}

// --- INTERFACE GRAPHIQUE ---
function renderTrackList() {
    trackListEl.innerHTML = '';
    tracksQueue.forEach((track, index) => {
        const li = document.createElement('li');
        li.textContent = track.name;
        li.addEventListener('click', () => {
            currentIndex = index;
            loadTrack(currentIndex, true);
        });
        trackListEl.appendChild(li);
    });
}

function updateTrackListHighlight() {
    const items = trackListEl.querySelectorAll('li');
    items.forEach((item, index) => {
        item.classList.toggle('playing', index === currentIndex);
    });
}

// --- API MEDIA SESSION (Écran de verrouillage standard) ---
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    }
}

function updateMediaSessionMetadata(title) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: 'Drive Player Offline',
            album: currentPlaylist
        });
    }
}

// --- EVENEMENTS & ACTIONS ---
function setupEventListeners() {
   document.getElementById('btn-trigger-upload').addEventListener('click', () => {
        document.getElementById('file-upload').click();
    }); 
    // Importation de fichiers
    document.getElementById('file-upload').addEventListener('change', async (e) => {
        const files = e.target.files;
        const targetPlaylist = document.getElementById('import-playlist-target').value;
        
        for (let file of files) {
            await saveTrack(file.name.replace('.mp3', ''), file, targetPlaylist);
        }
        
        // Rafraîchir si l'import a eu lieu dans la playlist courante
        if (targetPlaylist === currentPlaylist) {
            await loadPlaylist(currentPlaylist);
        }
        e.target.value = ''; // Reset input
    });

    // Contrôles UI
    document.getElementById('btn-play-pause').addEventListener('click', togglePlay);
    document.getElementById('btn-next').addEventListener('click', nextTrack);
    document.getElementById('btn-prev').addEventListener('click', prevTrack);

    // Changement d'onglet UI
    document.querySelectorAll('.btn-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            loadPlaylist(e.target.dataset.playlist);
        });
    });

    // Fin du morceau -> Passage au suivant automatique
    audio.addEventListener('ended', nextTrack);
}

// --- SERVICE WORKER & NOTIFICATION PERSISTANTE ---
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker Enregistré avec succès !');
            
            // Demande de permission pour les notifications (nécessaire pour le contrôle playlist déporté)
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }
            
            // Déclencher l'affichage de la notification persistante de contrôle
            if (Notification.permission === 'granted') {
                showPersistentNotification(reg);
            }
            
            // Écouter les messages en provenance du Service Worker (clics sur la notification)
            navigator.serviceWorker.addEventListener('message', async (event) => {
                if (event.data && event.data.action === 'switch-playlist') {
                    await loadPlaylist(event.data.playlist);
                    // Lance directement le premier morceau de la nouvelle playlist
                    if (tracksQueue.length > 0) {
                        loadTrack(0, true);
                    }
                }
            });

        } catch (err) {
            console.error('Échec enregistrement SW:', err);
        }
    }
}

function showPersistentNotification(reg) {
    // Note : 'sticky: true' et 'requireInteraction: true' maintiennent la notification visible au maximum
    reg.showNotification('Drive PWA Controls', {
        body: 'Basculez instantanément de playlist :',
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="%23ff5722" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>',
        tag: 'drive-playlist-control',
        renotify: false,
        requireInteraction: true,
        silent: true, // Évite de faire vibrer le téléphone inutilement
        actions: [
            { action: 'playlist-Chill', title: '🎵 Chill' },
            { action: 'playlist-Énergie', title: '⚡ Énergie' },
            { action: 'playlist-Focus', title: '🧠 Focus' }
        ]
    });
}
