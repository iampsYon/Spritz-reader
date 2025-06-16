const CACHE = "spritz-v1";
const OFFLINE_FILES = [
  "./",
  "index.html",
  "style.css",
  "main.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "https://code.jquery.com/jquery-3.7.1.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://unpkg.com/epubjs@0.3.92/dist/epub.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE_FILES)));
  self.skipWaiting();
});
self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});