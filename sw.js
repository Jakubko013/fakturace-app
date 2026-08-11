/* Service worker mobilní appky Fakturace.
   Při změně souborů appky zvyš CACHE_VERSION, jinak si telefony s appkou
   nainstalovanou na ploše nechají starou verzi. */
const CACHE_VERZE = "fakturace-mobile-v1";

const PRECACHE = [
  "./index.html",
  "./styles-mobile.css",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./js/api-web.js",
  "./js/mobile-nav.js",
  "./js/registrace-sw.js",
  "./js/vendor/qrcode.min.js",
  "styles.css",
  "js/core/util.js",
  "js/core/validace.js",
  "js/core/platba.js",
  "js/core/vypocet.js",
  "js/core/model.js",
  "js/core/dph.js",
  "js/core/denik.js",
  "js/core/csv.js",
  "js/ui.js",
  "js/stav.js",
  "js/doklad.js",
  "js/pohledy/prehled.js",
  "js/pohledy/faktury.js",
  "js/pohledy/faktura.js",
  "js/pohledy/klienti.js",
  "js/pohledy/vydaje.js",
  "js/pohledy/denik.js",
  "js/pohledy/dph.js",
  "js/pohledy/opakovane.js",
  "js/pohledy/upominky.js",
  "js/pohledy/nastaveni.js",
  "js/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERZE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((klice) => Promise.all(klice.filter((k) => k !== CACHE_VERZE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Volání na ARES (nebo cokoli mimo tento web) jde vždy přímo na síť.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Vlastní soubory appky: síť s okamžitým přechodem na cache, když není
  // připojení — aktualizace se projeví hned při dalším online spuštění.
  event.respondWith(
    fetch(req)
      .then((odpoved) => {
        const kopie = odpoved.clone();
        caches.open(CACHE_VERZE).then((cache) => cache.put(req, kopie));
        return odpoved;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
