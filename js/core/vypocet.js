(function (root, tovarna) {
  if (typeof module === "object" && module.exports) module.exports = tovarna(require("./util.js"));
  else {
    root.Fx = root.Fx || {};
    root.Fx.vypocet = tovarna(root.Fx.util);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (util) {
  "use strict";

  const { cislo, zaokrouhli, naKoruny } = util;

  /* Režimy DPH na vydané faktuře. Jiný než "bezny" znamená, že dodavatel
     daň neúčtuje — na dokladu pak musí být uvedený důvod. */
  const REZIMY = {
    bezny: { nazev: "Běžný režim", bezDane: false, text: "" },
    prenesena: {
      nazev: "Přenesená daňová povinnost",
      bezDane: true,
      text: "Daň odvede zákazník podle § 92a zákona o DPH.",
    },
    osvobozeno: {
      nazev: "Osvobozeno od DPH",
      bezDane: true,
      text: "Plnění osvobozené od daně podle zákona o DPH.",
    },
    dodaniEu: {
      nazev: "Dodání do jiného státu EU",
      bezDane: true,
      text: "Dodání zboží nebo služby do jiného členského státu EU — daň odvede pořizovatel (reverse charge).",
    },
    mimoEu: {
      nazev: "Vývoz mimo EU",
      bezDane: true,
      text: "Plnění s místem plnění mimo tuzemsko.",
    },
  };

  function rezimBezDane(doklad, nastaveni) {
    if (nastaveni && nastaveni.firma && nastaveni.firma.plateceDph === false) return true;
    const rezim = REZIMY[doklad.rezim] || REZIMY.bezny;
    return rezim.bezDane;
  }

  /** Zálohová faktura není daňový doklad — DPH se na ní nevyčísluje jako daň. */
  function jeDanovyDoklad(doklad) {
    return doklad.typ !== "zaloha";
  }

  /**
   * Spočítá celý doklad. Vrací i rozpis po sazbách, který jde rovnou vytisknout.
   * Dobropis (opravný daňový doklad) má všechny částky záporné.
   */
  function vypocetDokladu(doklad, nastaveni) {
    const znamenko = doklad.typ === "dobropis" ? -1 : 1;
    const bezDane = rezimBezDane(doklad, nastaveni);
    const vcetneDph = !!doklad.cenyVcetneDph && !bezDane;
    const slevaDokladu = Math.min(100, Math.max(0, cislo(doklad.slevaProc)));

    const radky = (doklad.polozky || []).map((polozka) => {
      const mnozstvi = cislo(polozka.mnozstvi);
      const cenaZaMj = cislo(polozka.cenaZaMj);
      const slevaRadku = Math.min(100, Math.max(0, cislo(polozka.slevaProc)));
      const sazba = bezDane ? 0 : cislo(polozka.sazba);

      let castka = mnozstvi * cenaZaMj;
      if (slevaRadku) castka *= 1 - slevaRadku / 100;
      if (slevaDokladu) castka *= 1 - slevaDokladu / 100;

      let zaklad;
      if (vcetneDph) {
        // Zadaná cena je včetně daně, základ se z ní vypočítá zpětně.
        zaklad = zaokrouhli(castka / (1 + sazba / 100), 2);
      } else {
        zaklad = zaokrouhli(castka, 2);
      }
      const dph = zaokrouhli((zaklad * sazba) / 100, 2);

      return {
        popis: polozka.popis || "",
        mnozstvi,
        jednotka: polozka.jednotka || "",
        cenaZaMj,
        slevaProc: slevaRadku,
        sazba,
        zaklad: zaokrouhli(zaklad * znamenko, 2),
        dph: zaokrouhli(dph * znamenko, 2),
        celkem: zaokrouhli((zaklad + dph) * znamenko, 2),
      };
    });

    /* Rozpis po sazbách. Daň se počítá až ze součtu základů dané sazby —
       ne jako součet daní jednotlivých řádků. Jinak by se u faktury s mnoha
       položkami nasčítaly haléřové rozdíly ze zaokrouhlování. */
    const podleSazeb = new Map();
    for (const radek of radky) {
      const klic = radek.sazba;
      if (!podleSazeb.has(klic)) podleSazeb.set(klic, { sazba: klic, zaklad: 0, dph: 0, celkem: 0 });
      podleSazeb.get(klic).zaklad = zaokrouhli(podleSazeb.get(klic).zaklad + radek.zaklad, 2);
    }
    const sazby = [...podleSazeb.values()]
      .map((s) => {
        const dph = zaokrouhli((s.zaklad * s.sazba) / 100, 2);
        return { sazba: s.sazba, zaklad: s.zaklad, dph, celkem: zaokrouhli(s.zaklad + dph, 2) };
      })
      .sort((a, b) => b.sazba - a.sazba);

    const zakladCelkem = zaokrouhli(
      sazby.reduce((soucet, s) => soucet + s.zaklad, 0),
      2
    );
    const dphCelkem = zaokrouhli(
      sazby.reduce((soucet, s) => soucet + s.dph, 0),
      2
    );
    const mezisoucet = zaokrouhli(zakladCelkem + dphCelkem, 2);

    // Odpočet dříve zaplacených záloh
    const odpocty = (doklad.odpocty || []).map((o) => ({
      popis: o.popis || "Uhrazená záloha",
      cislo: o.cislo || "",
      castka: zaokrouhli(cislo(o.castka), 2),
    }));
    const odpocetCelkem = zaokrouhli(
      odpocty.reduce((soucet, o) => soucet + o.castka, 0),
      2
    );

    const poOdpoctu = zaokrouhli(mezisoucet - odpocetCelkem, 2);
    const zaokrouhlit = doklad.zaokrouhlit !== false;
    const zaokrouhleni = zaokrouhlit ? zaokrouhli(naKoruny(poOdpoctu) - poOdpoctu, 2) : 0;
    const kUhrade = zaokrouhli(poOdpoctu + zaokrouhleni, 2);

    const uhrady = (doklad.uhrady || []).map((u) => ({
      datum: u.datum,
      castka: zaokrouhli(cislo(u.castka), 2),
      zpusob: u.zpusob || "prevodem",
      poznamka: u.poznamka || "",
    }));
    const zaplaceno = zaokrouhli(
      uhrady.reduce((soucet, u) => soucet + u.castka, 0),
      2
    );
    const zbyvaUhradit = zaokrouhli(kUhrade - zaplaceno, 2);

    return {
      radky,
      sazby,
      zakladCelkem,
      dphCelkem,
      mezisoucet,
      odpocty,
      odpocetCelkem,
      zaokrouhleni,
      kUhrade,
      uhrady,
      zaplaceno,
      zbyvaUhradit,
      bezDane,
      cenyVcetneDph: vcetneDph,
      znamenko,
    };
  }

  /* ---------------- stav dokladu ---------------- */

  const STAVY = {
    koncept: { nazev: "Koncept", barva: "seda" },
    vystavena: { nazev: "Vystavená", barva: "modra" },
    castecne: { nazev: "Částečně uhrazená", barva: "zluta" },
    zaplacena: { nazev: "Zaplacená", barva: "zelena" },
    poSplatnosti: { nazev: "Po splatnosti", barva: "cervena" },
    stornovana: { nazev: "Stornovaná", barva: "seda" },
  };

  /* Stav se neukládá, počítá se z úhrad a data splatnosti. Uložený je jen
     příznak "koncept" a "stornovaná" — ty určuje uživatel. */
  function stavDokladu(doklad, vypocet, dnes) {
    if (doklad.stav === "stornovana") return "stornovana";
    if (doklad.stav === "koncept") return "koncept";

    const kUhrade = vypocet.kUhrade;
    const zaplaceno = vypocet.zaplaceno;
    // Přeplatek i haléřový nedoplatek do jedné koruny bereme jako zaplaceno.
    if (kUhrade === 0 || zaplaceno >= kUhrade - 0.5) return "zaplacena";

    const poSplatnosti =
      doklad.datumSplatnosti && util.dnuOd(doklad.datumSplatnosti, dnes || util.dnesISO()) > 0;
    if (poSplatnosti) return "poSplatnosti";
    return zaplaceno > 0 ? "castecne" : "vystavena";
  }

  function dnuPoSplatnosti(doklad, dnes) {
    if (!doklad.datumSplatnosti) return 0;
    return Math.max(0, util.dnuOd(doklad.datumSplatnosti, dnes || util.dnesISO()));
  }

  /** Datum, ke kterému je faktura zaplacená (poslední úhrada). */
  function datumZaplaceni(doklad, vypocet) {
    if (!vypocet.uhrady.length) return "";
    if (vypocet.zbyvaUhradit > 0.5) return "";
    return vypocet.uhrady
      .map((u) => u.datum)
      .filter(Boolean)
      .sort()
      .pop() || "";
  }

  return {
    REZIMY,
    STAVY,
    rezimBezDane,
    jeDanovyDoklad,
    vypocetDokladu,
    stavDokladu,
    dnuPoSplatnosti,
    datumZaplaceni,
  };
});
