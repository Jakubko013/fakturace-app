(function (root, tovarna) {
  if (typeof module === "object" && module.exports) module.exports = tovarna(require("./util.js"));
  else {
    root.Fx = root.Fx || {};
    root.Fx.model = tovarna(root.Fx.util);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (util) {
  "use strict";

  const VERZE_DAT = 1;

  const VYCHOZI_NASTAVENI = {
    firma: {
      jmeno: "",
      ico: "",
      dic: "",
      plateceDph: false,
      ulice: "",
      mesto: "",
      psc: "",
      zeme: "Česká republika",
      tel: "",
      email: "",
      web: "",
      rejstrik: "Zapsáno v živnostenském rejstříku.",
      logo: null,
    },
    banka: { ucet: "", banka: "", iban: "", swift: "" },
    faktura: {
      splatnostDni: 14,
      formaUhrady: "prevodem",
      vychoziSazba: 21,
      vychoziJednotka: "ks",
      cenyVcetneDph: false,
      zaokrouhlit: true,
      qrPlatba: true,
      textPredPolozkami: "Fakturujeme Vám:",
      patka: "Děkuji za spolupráci.",
    },
    dph: { obdobi: "mesic" },
    zalohovani: { automaticky: true, pocet: 30 },
    cislovani: {
      faktura: "{RRRR}{NNN}",
      zaloha: "Z{RRRR}{NNN}",
      dobropis: "D{RRRR}{NNN}",
    },
    upominky: {
      prvniPoDnech: 3,
      druhaPoDnech: 14,
      textPrvni:
        "Dobrý den,\n\ndovoluji si Vás upozornit, že faktura {CISLO} na částku {CASTKA} se splatností {SPLATNOST} nebyla dosud uhrazena.\n\nPokud jste platbu již odeslali, považujte prosím tuto zprávu za bezpředmětnou.\n\nS pozdravem\n{FIRMA}",
      textDruha:
        "Dobrý den,\n\nfaktura {CISLO} na částku {CASTKA} je {DNU} dní po splatnosti (splatnost byla {SPLATNOST}).\n\nProsím o její úhradu do sedmi dnů na účet {UCET}, variabilní symbol {VS}.\n\nS pozdravem\n{FIRMA}",
    },
  };

  const SAZBY_DPH = [
    { hodnota: 21, nazev: "21 % — základní" },
    { hodnota: 12, nazev: "12 % — snížená" },
    { hodnota: 0, nazev: "0 % — nulová" },
  ];

  const JEDNOTKY = ["ks", "hod", "den", "měsíc", "km", "kg", "m", "m²", "m³", "l", "soubor", "%"];

  const FORMY_UHRADY = {
    prevodem: "Převodem na účet",
    hotove: "Hotově",
    kartou: "Platební kartou",
    dobirka: "Dobírkou",
    zapoctem: "Zápočtem",
  };

  const KATEGORIE_VYDAJU = [
    { id: "material", nazev: "Materiál a zboží", danovy: true },
    { id: "sluzby", nazev: "Služby a subdodávky", danovy: true },
    { id: "kancelar", nazev: "Kancelář a vybavení", danovy: true },
    { id: "software", nazev: "Software a předplatné", danovy: true },
    { id: "doprava", nazev: "Doprava a pohonné hmoty", danovy: true },
    { id: "telefon", nazev: "Telefon a internet", danovy: true },
    { id: "najem", nazev: "Nájem a energie", danovy: true },
    { id: "marketing", nazev: "Marketing a reklama", danovy: true },
    { id: "vzdelavani", nazev: "Vzdělávání a literatura", danovy: true },
    { id: "pojisteni", nazev: "Pojištění", danovy: true },
    { id: "poplatky", nazev: "Bankovní a správní poplatky", danovy: true },
    { id: "dane", nazev: "Daně a odvody (vč. pojistného OSVČ)", danovy: false },
    /* Zálohy na pojistné mívá jen OSVČ na hlavní činnost, proto se u nových
       výdajů nenabízejí. Kategorie tu zůstává, aby se starší doklady pořád
       správně počítaly jako nedaňové. */
    { id: "socialni", nazev: "Sociální a zdravotní pojištění OSVČ", danovy: false, skryta: true },
    { id: "osobni", nazev: "Osobní spotřeba / výběr", danovy: false },
    { id: "ostatni", nazev: "Ostatní", danovy: true },
  ];

  /** Kategorie nabízené u nových výdajů — bez těch, které se už nepoužívají. */
  function nabizeneKategorie(pouzite) {
    const pouzitych = new Set(pouzite || []);
    return KATEGORIE_VYDAJU.filter((k) => !k.skryta || pouzitych.has(k.id));
  }

  /* ---------------- prázdná databáze ---------------- */

  function prazdnaData() {
    return {
      verze: VERZE_DAT,
      nastaveni: util.kopie(VYCHOZI_NASTAVENI),
      klienti: [],
      faktury: [],
      vydaje: [],
      sablony: [],
      cenik: [],
      cislovani: {},
      vytvoreno: Date.now(),
    };
  }

  /* Doplní chybějící části dat. Volá se při každém spuštění, takže starší
     uložená data se samy dorovnají na aktuální tvar. */
  function sjednotData(data) {
    const zaklad = prazdnaData();
    if (!data || typeof data !== "object") return zaklad;

    const vysledek = Object.assign(zaklad, data);
    vysledek.verze = VERZE_DAT;
    vysledek.nastaveni = slucNastaveni(data.nastaveni);
    vysledek.klienti = Array.isArray(data.klienti) ? data.klienti : [];
    vysledek.faktury = Array.isArray(data.faktury) ? data.faktury : [];
    vysledek.vydaje = Array.isArray(data.vydaje) ? data.vydaje : [];
    vysledek.sablony = Array.isArray(data.sablony) ? data.sablony : [];
    vysledek.cenik = Array.isArray(data.cenik) ? data.cenik : [];
    vysledek.cislovani = data.cislovani && typeof data.cislovani === "object" ? data.cislovani : {};

    vysledek.faktury.forEach(sjednotFakturu);
    vysledek.vydaje.forEach(sjednotVydaj);
    return vysledek;
  }

  function slucNastaveni(ulozene) {
    const zaklad = util.kopie(VYCHOZI_NASTAVENI);
    if (!ulozene || typeof ulozene !== "object") return zaklad;
    for (const klic of Object.keys(zaklad)) {
      if (ulozene[klic] && typeof ulozene[klic] === "object") {
        zaklad[klic] = Object.assign(zaklad[klic], ulozene[klic]);
      } else if (ulozene[klic] !== undefined) {
        zaklad[klic] = ulozene[klic];
      }
    }
    return zaklad;
  }

  function sjednotFakturu(faktura) {
    if (!Array.isArray(faktura.polozky)) faktura.polozky = [];
    if (!Array.isArray(faktura.uhrady)) faktura.uhrady = [];
    if (!Array.isArray(faktura.odpocty)) faktura.odpocty = [];
    if (!faktura.odberatel) faktura.odberatel = prazdnyKlient();
    if (!faktura.typ) faktura.typ = "faktura";
    if (!faktura.rezim) faktura.rezim = "bezny";
    if (!faktura.stav) faktura.stav = "vystavena";
    return faktura;
  }

  function sjednotVydaj(vydaj) {
    if (!Array.isArray(vydaj.zaklady)) vydaj.zaklady = [];
    if (!vydaj.dodavatel) vydaj.dodavatel = { jmeno: "", ico: "", dic: "" };
    return vydaj;
  }

  /* ---------------- nové záznamy ---------------- */

  function prazdnyKlient() {
    return {
      id: "",
      jmeno: "",
      ico: "",
      dic: "",
      ulice: "",
      mesto: "",
      psc: "",
      zeme: "Česká republika",
      email: "",
      tel: "",
      poznamka: "",
      vychoziSplatnost: null,
    };
  }

  function novyKlient(data) {
    return Object.assign(prazdnyKlient(), { id: util.id("k") }, data || {});
  }

  function novaPolozka(nastaveni, data) {
    return Object.assign(
      {
        id: util.id("p"),
        popis: "",
        mnozstvi: 1,
        jednotka: (nastaveni && nastaveni.faktura.vychoziJednotka) || "ks",
        cenaZaMj: 0,
        slevaProc: 0,
        sazba: nastaveni ? nastaveni.faktura.vychoziSazba : 21,
      },
      data || {}
    );
  }

  function novaFaktura(data, typ) {
    const nastaveni = data.nastaveni;
    const dnes = util.dnesISO();
    const splatnostDni = util.cislo(nastaveni.faktura.splatnostDni, 14);
    return {
      id: util.id("f"),
      typ: typ || "faktura",
      cislo: "",
      vs: "",
      ks: "",
      klientId: "",
      odberatel: prazdnyKlient(),
      datumVystaveni: dnes,
      duzp: dnes,
      datumSplatnosti: util.pridejDny(dnes, splatnostDni),
      formaUhrady: nastaveni.faktura.formaUhrady,
      rezim: "bezny",
      cenyVcetneDph: !!nastaveni.faktura.cenyVcetneDph,
      zaokrouhlit: nastaveni.faktura.zaokrouhlit !== false,
      slevaProc: 0,
      mena: "CZK",
      polozky: [novaPolozka(nastaveni)],
      odpocty: [],
      uhrady: [],
      textPredPolozkami: nastaveni.faktura.textPredPolozkami || "",
      poznamka: "",
      objednavka: "",
      stav: "koncept",
      sablonaId: null,
      upominky: [],
      vytvoreno: Date.now(),
      zmeneno: Date.now(),
    };
  }

  function novyVydaj(data) {
    const dnes = util.dnesISO();
    return {
      id: util.id("v"),
      typ: "faktura", // faktura | paragon | interni
      cisloDokladu: "",
      dodavatel: { jmeno: "", ico: "", dic: "" },
      popis: "",
      kategorie: "material",
      datumVystaveni: dnes,
      duzp: dnes,
      datumSplatnosti: util.pridejDny(dnes, 14),
      datumUhrady: dnes,
      zaplaceno: true,
      // Rozpis částek po sazbách — u paragonu stačí jeden řádek.
      zaklady: [{ sazba: 21, zaklad: 0, dph: 0 }],
      odpocetDph: true,
      pomerOdpoctu: 100,
      danovyVydaj: true,
      rezim: "bezny", // bezny | prenesena | dovoz | bezDph
      poznamka: "",
      vytvoreno: Date.now(),
      zmeneno: Date.now(),
    };
  }

  function novaSablona(data) {
    return {
      id: util.id("s"),
      nazev: "",
      aktivni: true,
      klientId: "",
      interval: "mesic", // mesic | ctvrtleti | pulrok | rok
      denVystaveni: 1,
      dalsiVystaveni: util.dnesISO(),
      posledniVystaveni: null,
      predloha: null, // uložená faktura bez čísla a dat
      vytvoreno: Date.now(),
    };
  }

  const INTERVALY = {
    mesic: { nazev: "Měsíčně", mesicu: 1 },
    ctvrtleti: { nazev: "Čtvrtletně", mesicu: 3 },
    pulrok: { nazev: "Pololetně", mesicu: 6 },
    rok: { nazev: "Ročně", mesicu: 12 },
  };

  /* ---------------- číslování dokladů ---------------- */

  /* Vzor může obsahovat {RRRR} rok, {RR} rok dvojčíslím, {MM} měsíc
     a {N}…{NNNNN} pořadové číslo doplněné nulami. */
  function sestavCislo(vzor, poradi, datum) {
    const d = util.zISO(datum) || new Date();
    const rok = d.getFullYear();
    const mesic = String(d.getMonth() + 1).padStart(2, "0");
    return String(vzor || "{RRRR}{NNN}")
      .replace(/\{RRRR\}/g, String(rok))
      .replace(/\{RR\}/g, String(rok).slice(-2))
      .replace(/\{MM\}/g, mesic)
      .replace(/\{N+\}/g, (shoda) => String(poradi).padStart(shoda.length - 2, "0"));
  }

  /* Pořadové číslo se počítá z už vydaných dokladů daného typu a roku,
     ne z uloženého čítače. Když uživatel doklad smaže nebo přečísluje,
     řada se tím sama srovná a nevzniknou díry ani duplicity. */
  function dalsiPoradi(data, typ, rok) {
    const vzor = data.nastaveni.cislovani[typ] || "{RRRR}{NNN}";
    let nejvyssi = 0;
    for (const faktura of data.faktury) {
      if (faktura.typ !== typ || !faktura.cislo) continue;
      const rokDokladu = (util.zISO(faktura.datumVystaveni) || new Date()).getFullYear();
      if (rokDokladu !== rok) continue;
      const poradi = poradiZCisla(faktura.cislo, vzor, faktura.datumVystaveni);
      if (poradi > nejvyssi) nejvyssi = poradi;
    }
    return nejvyssi + 1;
  }

  /** Ze skutečného čísla dokladu zpětně přečte pořadové číslo podle vzoru. */
  function poradiZCisla(cisloDokladu, vzor, datum) {
    const d = util.zISO(datum) || new Date();
    const rok = d.getFullYear();
    const mesic = String(d.getMonth() + 1).padStart(2, "0");
    const regulerni = String(vzor)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{RRRR\\\}/g, String(rok))
      .replace(/\\\{RR\\\}/g, String(rok).slice(-2))
      .replace(/\\\{MM\\\}/g, mesic)
      .replace(/\\\{N+\\\}/g, "(\\d+)");
    const shoda = String(cisloDokladu).match(new RegExp("^" + regulerni + "$"));
    if (shoda && shoda[1]) return Number(shoda[1]);
    // Doklad s ručně zadaným číslem — zkusíme z něj alespoň poslední číslice.
    const cisla = String(cisloDokladu).match(/(\d+)\s*$/);
    return cisla ? Number(cisla[1]) : 0;
  }

  function dalsiCislo(data, typ, datum) {
    const d = util.zISO(datum) || new Date();
    const vzor = data.nastaveni.cislovani[typ] || "{RRRR}{NNN}";
    return sestavCislo(vzor, dalsiPoradi(data, typ, d.getFullYear()), datum);
  }

  const NAZVY_TYPU = {
    faktura: "Faktura — daňový doklad",
    zaloha: "Zálohová faktura",
    dobropis: "Opravný daňový doklad (dobropis)",
  };

  /* Neplátce nevystavuje daňový doklad, tak se ani takhle nesmí jmenovat. */
  const NAZVY_TYPU_NEPLATCE = {
    faktura: "Faktura",
    zaloha: "Zálohová faktura",
    dobropis: "Opravný doklad (dobropis)",
  };

  function nazevDokladu(typ, plateceDph) {
    const nazvy = plateceDph ? NAZVY_TYPU : NAZVY_TYPU_NEPLATCE;
    return nazvy[typ] || nazvy.faktura;
  }

  const NAZVY_TYPU_KRATCE = {
    faktura: "Faktura",
    zaloha: "Záloha",
    dobropis: "Dobropis",
  };

  return {
    VERZE_DAT,
    VYCHOZI_NASTAVENI,
    SAZBY_DPH,
    JEDNOTKY,
    FORMY_UHRADY,
    KATEGORIE_VYDAJU,
    nabizeneKategorie,
    INTERVALY,
    NAZVY_TYPU,
    NAZVY_TYPU_NEPLATCE,
    NAZVY_TYPU_KRATCE,
    nazevDokladu,
    prazdnaData,
    sjednotData,
    prazdnyKlient,
    novyKlient,
    novaPolozka,
    novaFaktura,
    novyVydaj,
    novaSablona,
    sestavCislo,
    dalsiPoradi,
    poradiZCisla,
    dalsiCislo,
  };
});
