(function (root, tovarna) {
  if (typeof module === "object" && module.exports)
    module.exports = tovarna(require("./util.js"), require("./vypocet.js"), require("./dph.js"), require("./model.js"));
  else {
    root.Fx = root.Fx || {};
    root.Fx.denik = tovarna(root.Fx.util, root.Fx.vypocet, root.Fx.dph, root.Fx.model);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (util, vypocetModul, dphModul, model) {
  "use strict";

  const { zaokrouhli, vRozmezi } = util;

  /* Peněžní deník daňové evidence.

     Zásadní rozdíl proti DPH: tady rozhoduje den, kdy peníze skutečně přišly
     nebo odešly. Faktura vystavená v prosinci a zaplacená v lednu je příjmem
     až v lednu, zatímco do DPH patřila už do prosince.

     U plátce DPH se do základu daně z příjmů počítají částky bez DPH —
     odvedená daň není příjem a nárokovaná daň není výdaj. */

  function kategorieVydaje(id) {
    return model.KATEGORIE_VYDAJU.find((k) => k.id === id) || { id, nazev: id, danovy: true };
  }

  /** Všechny pohyby peněz v období, seřazené podle data. */
  function polozkyDeniku(data, od, doData) {
    const polozky = [];

    for (const faktura of data.faktury) {
      if (faktura.stav === "stornovana" || faktura.stav === "koncept") continue;
      const vypocet = vypocetModul.vypocetDokladu(faktura, data.nastaveni);
      if (!vypocet.uhrady.length) continue;

      for (const uhrada of vypocet.uhrady) {
        if (!vRozmezi(uhrada.datum, od, doData)) continue;
        /* Částečná úhrada se dělí na základ a daň ve stejném poměru,
           v jakém je celý doklad. */
        const podil = vypocet.kUhrade !== 0 ? uhrada.castka / vypocet.kUhrade : 0;
        const zaklad = zaokrouhli(vypocet.zakladCelkem * podil, 2);
        const dph = zaokrouhli(uhrada.castka - zaklad, 2);

        polozky.push({
          id: faktura.id + ":" + (uhrada.datum || "") + ":" + uhrada.castka,
          datum: uhrada.datum,
          druh: "prijem",
          doklad: faktura.cislo || "(bez čísla)",
          dokladId: faktura.id,
          dokladTyp: "faktura",
          popis: popisFaktury(faktura),
          protistrana: (faktura.odberatel && faktura.odberatel.jmeno) || "",
          castka: uhrada.castka,
          zaklad,
          dph,
          zpusob: uhrada.zpusob,
          danovy: true,
          doZakladuDane: zaklad,
          kategorie: "trzby",
          kategorieNazev: "Tržby z podnikání",
        });
      }
    }

    for (const vydaj of data.vydaje) {
      if (!vydaj.zaplaceno || !vydaj.datumUhrady) continue;
      if (!vRozmezi(vydaj.datumUhrady, od, doData)) continue;
      const rozpis = dphModul.rozpisVydaje(vydaj);
      const kategorie = kategorieVydaje(vydaj.kategorie);
      const danovy = vydaj.danovyVydaj !== false && kategorie.danovy !== false;

      polozky.push({
        id: vydaj.id,
        datum: vydaj.datumUhrady,
        druh: "vydaj",
        doklad: vydaj.cisloDokladu || "(bez čísla)",
        dokladId: vydaj.id,
        dokladTyp: "vydaj",
        popis: vydaj.popis || kategorie.nazev,
        protistrana: (vydaj.dodavatel && vydaj.dodavatel.jmeno) || "",
        castka: rozpis.celkem,
        zaklad: rozpis.zakladCelkem,
        dph: rozpis.dphCelkem,
        zpusob: vydaj.zpusobUhrady || "prevodem",
        danovy,
        doZakladuDane: danovy ? rozpis.danovyNaklad : 0,
        kategorie: vydaj.kategorie,
        kategorieNazev: kategorie.nazev,
      });
    }

    return polozky.sort((a, b) => {
      if (a.datum === b.datum) return a.druh === b.druh ? 0 : a.druh === "prijem" ? -1 : 1;
      return String(a.datum).localeCompare(String(b.datum));
    });
  }

  function popisFaktury(faktura) {
    const prvni = (faktura.polozky || [])[0];
    const zaklad = prvni && prvni.popis ? prvni.popis : "Fakturace";
    const dalsich = (faktura.polozky || []).length - 1;
    return dalsich > 0
      ? `${zaklad} a ${dalsich} ${util.sklonuj(dalsich, "další položka", "další položky", "dalších položek")}`
      : zaklad;
  }

  /** Souhrn deníku — to, z čeho se počítá daň z příjmů. */
  function souhrn(polozky) {
    const vysledek = {
      prijmyCelkem: 0,
      vydajeCelkem: 0,
      prijmyDoZakladu: 0,
      vydajeDoZakladu: 0,
      dphNaVystupu: 0,
      dphNaVstupu: 0,
      podleKategorii: new Map(),
    };

    for (const p of polozky) {
      if (p.druh === "prijem") {
        vysledek.prijmyCelkem = zaokrouhli(vysledek.prijmyCelkem + p.castka, 2);
        vysledek.prijmyDoZakladu = zaokrouhli(vysledek.prijmyDoZakladu + p.doZakladuDane, 2);
        vysledek.dphNaVystupu = zaokrouhli(vysledek.dphNaVystupu + p.dph, 2);
      } else {
        vysledek.vydajeCelkem = zaokrouhli(vysledek.vydajeCelkem + p.castka, 2);
        vysledek.vydajeDoZakladu = zaokrouhli(vysledek.vydajeDoZakladu + p.doZakladuDane, 2);
        vysledek.dphNaVstupu = zaokrouhli(vysledek.dphNaVstupu + p.dph, 2);

        const klic = p.kategorie || "ostatni";
        const soucasny = vysledek.podleKategorii.get(klic) || {
          kategorie: klic,
          nazev: p.kategorieNazev,
          castka: 0,
          doZakladu: 0,
        };
        soucasny.castka = zaokrouhli(soucasny.castka + p.castka, 2);
        soucasny.doZakladu = zaokrouhli(soucasny.doZakladu + p.doZakladuDane, 2);
        vysledek.podleKategorii.set(klic, soucasny);
      }
    }

    vysledek.rozdilPenez = zaokrouhli(vysledek.prijmyCelkem - vysledek.vydajeCelkem, 2);
    vysledek.zakladDane = util.naKoruny(vysledek.prijmyDoZakladu - vysledek.vydajeDoZakladu);
    vysledek.kategorie = [...vysledek.podleKategorii.values()].sort((a, b) => b.castka - a.castka);
    return vysledek;
  }

  /* ---------------- pohledávky a závazky ---------------- */

  /** Vystavené a dosud neuhrazené faktury k danému dni. */
  function pohledavky(data, kDatu) {
    const dnes = kDatu || util.dnesISO();
    const seznam = [];
    for (const faktura of data.faktury) {
      if (faktura.stav === "koncept" || faktura.stav === "stornovana") continue;
      if (faktura.typ === "zaloha") continue;
      const vypocet = vypocetModul.vypocetDokladu(faktura, data.nastaveni);
      if (vypocet.zbyvaUhradit <= 0.5) continue;
      seznam.push({
        faktura,
        vypocet,
        zbyva: vypocet.zbyvaUhradit,
        poSplatnosti: vypocetModul.dnuPoSplatnosti(faktura, dnes),
      });
    }
    return seznam.sort((a, b) =>
      String(a.faktura.datumSplatnosti).localeCompare(String(b.faktura.datumSplatnosti))
    );
  }

  /** Přijaté a dosud nezaplacené doklady. */
  function zavazky(data, kDatu) {
    const dnes = kDatu || util.dnesISO();
    const seznam = [];
    for (const vydaj of data.vydaje) {
      if (vydaj.zaplaceno) continue;
      const rozpis = dphModul.rozpisVydaje(vydaj);
      seznam.push({
        vydaj,
        rozpis,
        zbyva: rozpis.celkem,
        poSplatnosti: vydaj.datumSplatnosti ? Math.max(0, util.dnuOd(vydaj.datumSplatnosti, dnes)) : 0,
      });
    }
    return seznam.sort((a, b) =>
      String(a.vydaj.datumSplatnosti).localeCompare(String(b.vydaj.datumSplatnosti))
    );
  }

  /** Roční přehled po měsících — pro graf na úvodní stránce. */
  function poMesicich(data, rok) {
    const mesice = Array.from({ length: 12 }, (_, i) => ({
      mesic: i + 1,
      prijmy: 0,
      vydaje: 0,
    }));
    const polozky = polozkyDeniku(data, `${rok}-01-01`, `${rok}-12-31`);
    for (const p of polozky) {
      const mesic = Number(String(p.datum).slice(5, 7)) - 1;
      if (mesic < 0 || mesic > 11) continue;
      if (p.druh === "prijem") mesice[mesic].prijmy = zaokrouhli(mesice[mesic].prijmy + p.castka, 2);
      else mesice[mesic].vydaje = zaokrouhli(mesice[mesic].vydaje + p.castka, 2);
    }
    return mesice;
  }

  return { polozkyDeniku, souhrn, pohledavky, zavazky, poMesicich, kategorieVydaje };
});
