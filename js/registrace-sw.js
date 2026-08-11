/* Registrace service workeru — v samostatném souboru kvůli CSP (script-src 'self'
   nedovolí spouštět vložený <script> přímo v HTML). */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* Bez service workeru appka pořád funguje, jen ne offline. */
    });
  });
}
