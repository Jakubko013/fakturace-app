/* Ovládání výsuvné nabídky na úzké obrazovce.

   Zbytek appky (app.js) o tomhle neví — jen si sám překresluje obsah
   #nabidka při každé změně stránky. Tenhle soubor se jen dívá zvenčí
   a zavírá/otevírá panel kolem něj. */
(function () {
  "use strict";

  function otevrena() {
    return document.getElementById("aplikace").classList.contains("drawer-otevreny");
  }

  function otevri() {
    document.getElementById("aplikace").classList.add("drawer-otevreny");
  }

  function zavri() {
    document.getElementById("aplikace").classList.remove("drawer-otevreny");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const tlacitko = document.getElementById("drawer-otevrit");
    const zastineni = document.getElementById("drawer-zastineni");
    const panel = document.getElementById("bocnipanel");

    tlacitko.addEventListener("click", () => (otevrena() ? zavri() : otevri()));
    zastineni.addEventListener("click", zavri);

    // Klik na položku v nabídce panel zavře — hashchange přepne stránku sám.
    panel.addEventListener("click", (udalost) => {
      if (udalost.target.closest("a[href^='#']")) zavri();
    });

    document.addEventListener("keydown", (udalost) => {
      if (udalost.key === "Escape" && otevrena()) zavri();
    });

    // Otočení na širší obrazovku (nebo přechod na tablet) ať nenechá panel
    // omylem otevřený přes obsah.
    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) zavri();
    });
  });
})();
