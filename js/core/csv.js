(function (root, tovarna) {
  if (typeof module === "object" && module.exports) module.exports = tovarna(require("./util.js"));
  else {
    root.Fx = root.Fx || {};
    root.Fx.csv = tovarna(root.Fx.util);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (util) {
  "use strict";

  /* Export do CSV pro účetní a pro Excel.

     Český Excel čeká středník jako oddělovač a desetinnou čárku. Aby si
     poradil s diakritikou, musí soubor začínat značkou BOM. */

  const BOM = "\uFEFF";
  const ODDELOVAC = ";";

  function bunka(hodnota) {
    if (hodnota == null) return "";
    if (typeof hodnota === "number") {
      // Excel v českém prostředí čte čísla s desetinnou čárkou.
      return String(util.zaokrouhli(hodnota, 2)).replace(".", ",");
    }
    const text = String(hodnota);
    if (/[";\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function sestav(hlavicka, radky) {
    const vsechny = [hlavicka, ...radky];
    return BOM + vsechny.map((r) => r.map(bunka).join(ODDELOVAC)).join("\r\n") + "\r\n";
  }

  return { sestav, bunka, BOM, ODDELOVAC };
});
