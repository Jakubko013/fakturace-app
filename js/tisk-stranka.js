/* Pomocná stránka pro tisk/PDF na mobilu — otevírá ji api-web.js jako
   skutečnou, novou stránku (ne jen window.open("", "_blank")), protože
   prázdné okno otevřené zevnitř appky přidané na plochu iOS zůstává ve
   stejném omezeném zobrazení jako appka samotná a window.print() z něj
   nejde vůbec spustit. Skutečná navigace na tuhle stránku appku na iOS
   přepne do normálního Safari, kde tisk funguje.

   Vykreslovaný doklad appka stránce předá přes localStorage (ne přímým
   voláním z otvírajícího okna) — tahle stránka si ho sama vyzvedne a
   otevře jako nový dokument přes blob: URL (ne document.write() do sebe
   sama, to nechávalo DOM v rozbitém, napůl přepsaném stavu). Tisk pak
   spustí vložený skript uvnitř toho nového dokumentu, ne cizí volání
   zvenčí. */
(function () {
  "use strict";

  var KLIC = "fakturace:tisk-obsah";
  var POKUSU = 0;
  var MAX_POKUSU = 40; // 40 × 150 ms ≈ 6 s

  function zobrazChybu(text) {
    document.getElementById("fx-stav").textContent = text;
  }

  function zkusNacist() {
    var obsah;
    try {
      obsah = localStorage.getItem(KLIC);
    } catch (err) {
      zobrazChybu("Tisk se nepodařilo připravit: " + err.message);
      return;
    }
    if (!obsah) {
      POKUSU += 1;
      if (POKUSU >= MAX_POKUSU) {
        zobrazChybu("Doklad se z appky nepodařilo načíst. Zkuste to prosím znovu.");
        return;
      }
      setTimeout(zkusNacist, 150);
      return;
    }
    try {
      localStorage.removeItem(KLIC);
    } catch (err) {
      /* nevadí, klíč se přepíše při dalším tisku */
    }
    // Místo document.write() do už načtené stránky (to v téhle appce
    // zanechávalo rozbité, napůl přepsané DOM — stará i nová stránka
    // vykreslené přes sebe) se doklad otevře jako doopravdy nový dokument
    // přes blob: URL. Skript, co appka do dokladu vložila (viz api-web.js),
    // pak tisk spustí sám, jakmile se tahle nová stránka načte.
    try {
      var blob = new Blob([obsah], { type: "text/html" });
      var url = URL.createObjectURL(blob);
      location.replace(url);
    } catch (err) {
      zobrazChybu("Doklad se nepodařilo otevřít: " + err.message);
    }
  }

  zkusNacist();
})();
