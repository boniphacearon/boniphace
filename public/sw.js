const CACHE_NAME = 'boniphace-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/chat.js',
  '/js/auth.js',
  '/js/memory.js',
  '/js/voice.js',
  '/js/projects.js',
  '/js/settings.js',
  '/manifest.json',
  '/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('Cache addAll failed:', err);
        // Continue even if some assets fail
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Skip non-GET requests and API calls
  if (req.method !== 'GET') return;
  if (req.url.includes('/api/')) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, clone).catch(err => {
              console.warn('Cache put failed:', err);
            });
          });
        }
        return response;
      }).catch(() => {
        // Return cached version if network fails
        return cached;
      });
      
      return cached || fetchPromise;
    })
  );
});
