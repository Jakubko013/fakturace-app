/* Pomocná stránka pro tisk/PDF na mobilu — otevírá ji api-web.js jako
   skutečnou, novou stránku (ne jen window.open("", "_blank")), protože
   prázdné okno otevřené zevnitř appky přidané na plochu iOS zůstává ve
   stejném omezeném zobrazení jako appka samotná a window.print() z něj
   nejde vůbec spustit. Skutečná navigace na tuhle stránku appku na iOS
   přepne do normálního Safari, kde tisk funguje.

   Vykreslovaný doklad appka stránce předá přes localStorage (ne přímým
   voláním z otvírajícího okna) — tisk se pak spouští odsud, vlastním
   časovačem téhle stránky, ne cizím voláním zvenčí. */
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
    try {
      document.open();
      document.write(obsah);
      document.close();
    } catch (err) {
      zobrazChybu("Doklad se nepodařilo vykreslit: " + err.message);
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        try {
          window.focus();
          window.print();
        } catch (err) {
          /* Tiskový dialog se nepodařilo spustit automaticky — stránka
             zůstává vykreslená, uživatel může zkusit tisk ručně. */
        }
      });
    });
  }

  zkusNacist();
})();
