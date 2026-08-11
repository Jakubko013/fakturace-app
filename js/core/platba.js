(function (root, tovarna) {
  if (typeof module === "object" && module.exports)
    module.exports = tovarna(require("./util.js"), require("./validace.js"));
  else {
    root.Fx = root.Fx || {};
    root.Fx.platba = tovarna(root.Fx.util, root.Fx.validace);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (util, validace) {
  "use strict";

  /* QR Platba — český standard (Česká bankovní asociace, formát SPD 1.0).
     Bankovní aplikace přečtou z QR kódu řetězec tvaru

       SPD*1.0*ACC:CZ6508000000192000145399*AM:12100.00*CC:CZK*X-VS:2026001

     Hodnoty nesmí obsahovat hvězdičku, zpráva pro příjemce je omezená
     na 60 znaků a bezpečně projde jen bez diakritiky. */

  const MAX_ZPRAVA = 60;

  function ocisti(hodnota, maxDelka) {
    let text = util
      .bezDiakritiky(String(hodnota ?? ""))
      .replace(/[*\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (maxDelka) text = text.slice(0, maxDelka);
    return text;
  }

  /**
   * Sestaví řetězec pro QR platbu.
   * @param {{iban:string, castka:number, mena?:string, vs?:string, ks?:string, ss?:string,
   *          splatnost?:string, zprava?:string, prijemce?:string}} platba
   */
  function retezecSpd(platba) {
    const iban = String(platba.iban ?? "").replace(/\s/g, "").toUpperCase();
    if (!iban) return "";

    const casti = ["SPD", "1.0", "ACC:" + iban];

    const castka = util.zaokrouhli(platba.castka, 2);
    if (castka > 0) casti.push("AM:" + castka.toFixed(2));
    casti.push("CC:" + (platba.mena || "CZK"));

    if (platba.splatnost) {
      const datum = String(platba.splatnost).slice(0, 10).replace(/-/g, "");
      if (/^\d{8}$/.test(datum)) casti.push("DT:" + datum);
    }
    if (platba.prijemce) casti.push("RN:" + ocisti(platba.prijemce, 35));

    const zprava = ocisti(platba.zprava, MAX_ZPRAVA);
    if (zprava) casti.push("MSG:" + zprava);

    const vs = String(platba.vs ?? "").replace(/\D/g, "").slice(0, 10);
    if (vs) casti.push("X-VS:" + vs);
    const ss = String(platba.ss ?? "").replace(/\D/g, "").slice(0, 10);
    if (ss) casti.push("X-SS:" + ss);
    const ks = String(platba.ks ?? "").replace(/\D/g, "").slice(0, 4);
    if (ks) casti.push("X-KS:" + ks);

    return casti.join("*");
  }

  /**
   * Připraví data QR platby k faktuře. Když firma nemá vyplněný účet,
   * vrátí null a doklad se vytiskne bez QR kódu.
   */
  function platbaKFakture(doklad, vypocet, nastaveni) {
    const banka = (nastaveni && nastaveni.banka) || {};
    const iban = banka.iban ? banka.iban.replace(/\s/g, "") : validace.ucetNaIban(banka.ucet);
    if (!iban) return null;
    const zbyva = vypocet.zbyvaUhradit != null ? vypocet.zbyvaUhradit : vypocet.kUhrade;
    if (!(zbyva > 0)) return null;

    return {
      iban,
      castka: zbyva,
      mena: doklad.mena || "CZK",
      vs: doklad.vs || validace.vsZCisla(doklad.cislo),
      ks: doklad.ks || "",
      ss: doklad.ss || "",
      splatnost: doklad.datumSplatnosti,
      prijemce: (nastaveni.firma && nastaveni.firma.jmeno) || "",
      zprava: "Faktura " + (doklad.cislo || ""),
    };
  }

  return { retezecSpd, platbaKFakture, ocisti };
});
