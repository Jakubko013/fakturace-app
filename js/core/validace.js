(function (root, tovarna) {
  if (typeof module === "object" && module.exports) module.exports = tovarna(require("./util.js"));
  else {
    root.Fx = root.Fx || {};
    root.Fx.validace = tovarna(root.Fx.util);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (util) {
  "use strict";

  /* ---------------- IČO ---------------- */

  /* Kontrolní číslice IČO: prvních sedm číslic se násobí vahami 8..2,
     součet modulo 11 určuje osmou číslici. */
  function platneIco(ico) {
    const c = String(ico ?? "").replace(/\s/g, "");
    if (!/^\d{8}$/.test(c)) return false;
    let soucet = 0;
    for (let i = 0; i < 7; i++) soucet += Number(c[i]) * (8 - i);
    const zbytek = soucet % 11;
    let kontrolni;
    if (zbytek === 0) kontrolni = 1;
    else if (zbytek === 1) kontrolni = 0;
    else kontrolni = 11 - zbytek;
    return kontrolni === Number(c[7]);
  }

  function formatIco(ico) {
    return String(ico ?? "").replace(/\s/g, "");
  }

  /* ---------------- DIČ ---------------- */

  /** Základní kontrola tvaru DIČ (CZ + 8 až 10 číslic, nebo jiný stát EU). */
  function platneDic(dic) {
    const c = String(dic ?? "").replace(/\s/g, "").toUpperCase();
    if (!c) return true; // prázdné DIČ je v pořádku, neplátce ho nemá
    if (/^CZ\d{8,10}$/.test(c)) return true;
    return /^[A-Z]{2}[0-9A-Z]{2,12}$/.test(c); // ostatní členské státy
  }

  function normalizujDic(dic) {
    return String(dic ?? "").replace(/\s/g, "").toUpperCase();
  }

  /** Je to DIČ z jiného členského státu než ČR? Rozhoduje o režimu DPH. */
  function dicJeZahranicni(dic) {
    const c = normalizujDic(dic);
    return /^[A-Z]{2}/.test(c) && !c.startsWith("CZ");
  }

  /* ---------------- bankovní účet a IBAN ---------------- */

  /* Tuzemské číslo účtu: [předčíslí-]číslo/kód banky.
     Předčíslí i číslo mají vlastní kontrolní součet s vahami 10,5,8,4,2,1,6,3,7,9
     (zprava), součet musí být dělitelný 11. */
  const VAHY = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];

  function kontrolniSoucetCastiUctu(cast) {
    const cisla = String(cast).replace(/\D/g, "");
    if (!cisla) return true; // prázdné předčíslí je v pořádku
    let soucet = 0;
    for (let i = 0; i < cisla.length; i++) {
      const cislice = Number(cisla[cisla.length - 1 - i]);
      soucet += cislice * VAHY[i % VAHY.length];
    }
    return soucet % 11 === 0;
  }

  function rozeberUcet(ucet) {
    const text = String(ucet ?? "").replace(/\s/g, "");
    const shoda = text.match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/);
    if (!shoda) return null;
    return { predcisli: shoda[1] || "", cislo: shoda[2], kodBanky: shoda[3] };
  }

  function platnyUcet(ucet) {
    const casti = rozeberUcet(ucet);
    if (!casti) return false;
    return (
      kontrolniSoucetCastiUctu(casti.predcisli) && kontrolniSoucetCastiUctu(casti.cislo)
    );
  }

  /* IBAN se počítá tak, že se kód země a kontrolní číslice přesunou na konec,
     písmena se nahradí čísly (A=10 … Z=35) a z celku se vezme zbytek po 97. */
  function mod97(retezec) {
    let zbytek = 0;
    for (const znak of retezec) {
      const hodnota = /\d/.test(znak) ? znak : String(znak.toUpperCase().charCodeAt(0) - 55);
      for (const cislice of hodnota) {
        zbytek = (zbytek * 10 + Number(cislice)) % 97;
      }
    }
    return zbytek;
  }

  /** Z tuzemského čísla účtu spočítá IBAN. Vrací "" když je účet nečitelný. */
  function ucetNaIban(ucet) {
    const casti = rozeberUcet(ucet);
    if (!casti) return "";
    const bban =
      casti.kodBanky + casti.predcisli.padStart(6, "0") + casti.cislo.padStart(10, "0");
    const kontrola = 98 - mod97(bban + "CZ00");
    return "CZ" + String(kontrola).padStart(2, "0") + bban;
  }

  function platnyIban(iban) {
    const c = String(iban ?? "").replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[0-9A-Z]{10,30}$/.test(c)) return false;
    return mod97(c.slice(4) + c.slice(0, 4)) === 1;
  }

  function formatIban(iban) {
    const c = String(iban ?? "").replace(/\s/g, "").toUpperCase();
    return c.replace(/(.{4})/g, "$1 ").trim();
  }

  /* ---------------- variabilní symbol ---------------- */

  /** VS smí mít nejvýš deset číslic; z čísla faktury vytáhneme jen cifry. */
  function vsZCisla(cisloDokladu) {
    const cisla = String(cisloDokladu ?? "").replace(/\D/g, "");
    return cisla.slice(-10);
  }

  /* ---------------- souhrn pro formuláře ---------------- */

  /** Vrátí seznam varování k údajům firmy — aplikace kvůli nim nic neblokuje. */
  function zkontrolujFirmu(firma, banka) {
    const potize = [];
    if (!String(firma.jmeno || "").trim()) potize.push("Není vyplněné jméno nebo název firmy.");
    if (!firma.ico) potize.push("Není vyplněné IČO.");
    else if (!platneIco(firma.ico)) potize.push("IČO nemá platnou kontrolní číslici.");
    if (firma.plateceDph && !firma.dic) potize.push("Jste plátce DPH, ale nemáte vyplněné DIČ.");
    if (firma.dic && !platneDic(firma.dic)) potize.push("DIČ nemá očekávaný tvar (např. CZ12345678).");
    if (!firma.mesto || !firma.psc) potize.push("Není vyplněná úplná adresa sídla.");
    if (banka) {
      if (!banka.ucet && !banka.iban) potize.push("Není vyplněný bankovní účet.");
      else if (banka.ucet && !platnyUcet(banka.ucet))
        potize.push("Číslo účtu neodpovídá tvaru předčíslí-číslo/kód banky.");
      if (banka.iban && !platnyIban(banka.iban)) potize.push("IBAN nemá platnou kontrolní číslici.");
    }
    return potize;
  }

  return {
    platneIco,
    formatIco,
    platneDic,
    normalizujDic,
    dicJeZahranicni,
    rozeberUcet,
    platnyUcet,
    ucetNaIban,
    platnyIban,
    formatIban,
    mod97,
    vsZCisla,
    zkontrolujFirmu,
  };
});
