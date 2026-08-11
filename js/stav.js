/* Stav aplikace — načtení dat, ukládání a přístup k záznamům. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const model = Fx.model;

  const PRODLEVA_ULOZENI = 500; // ms — sdružíme rychlé úpravy do jednoho zápisu

  let data = null;
  let casovacUlozeni = null;
  let ukladaSe = false;
  let posluchaciZmeny = [];

  async function nacti() {
    const odpoved = await root.api.data.nacti();
    if (!odpoved.ok) {
      Fx.ui.hlaska(odpoved.chyba, "chyba");
      data = model.prazdnaData();
      return data;
    }
    data = model.sjednotData(odpoved.data);
    if (!odpoved.data) {
      // První spuštění — data ještě neexistují, rovnou je založíme.
      await ulozHned();
    }
    await zalohujPodlePotreby();
    return data;
  }

  /** Naplánuje uložení. Volá se po každé úpravě. */
  function uloz() {
    if (casovacUlozeni) clearTimeout(casovacUlozeni);
    casovacUlozeni = setTimeout(ulozHned, PRODLEVA_ULOZENI);
  }

  async function ulozHned() {
    if (casovacUlozeni) {
      clearTimeout(casovacUlozeni);
      casovacUlozeni = null;
    }
    if (!data) return false;
    ukladaSe = true;
    const odpoved = await root.api.data.uloz(data);
    ukladaSe = false;
    if (!odpoved.ok) {
      Fx.ui.hlaska("Data se nepodařilo uložit: " + odpoved.chyba, "chyba");
      return false;
    }
    posluchaciZmeny.forEach((p) => p());
    return true;
  }

  /* Záloha jednou denně při spuštění. Vlastní data.json se tím nemění,
     jen se odloží kopie do složky zalohy. */
  async function zalohujPodlePotreby() {
    if (!data.nastaveni.zalohovani.automaticky) return;
    const dnes = util.dnesISO();
    if (data.posledniZaloha === dnes) return;
    const odpoved = await root.api.data.zaloha(data.nastaveni.zalohovani.pocet);
    if (odpoved.ok) {
      data.posledniZaloha = dnes;
      await ulozHned();
    }
  }

  function naZmenu(posluchac) {
    posluchaciZmeny.push(posluchac);
  }

  /* ---------------- přístup k záznamům ---------------- */

  const dej = () => data;

  const klient = (id) => data.klienti.find((k) => k.id === id) || null;
  const faktura = (id) => data.faktury.find((f) => f.id === id) || null;
  const vydaj = (id) => data.vydaje.find((v) => v.id === id) || null;
  const sablona = (id) => data.sablony.find((s) => s.id === id) || null;

  function pridejKlienta(udaje) {
    const novy = model.novyKlient(udaje);
    data.klienti.push(novy);
    uloz();
    return novy;
  }

  function ulozKlienta(zmeneny) {
    const index = data.klienti.findIndex((k) => k.id === zmeneny.id);
    if (index >= 0) data.klienti[index] = zmeneny;
    else data.klienti.push(zmeneny);
    uloz();
    return zmeneny;
  }

  function smazKlienta(id) {
    data.klienti = data.klienti.filter((k) => k.id !== id);
    uloz();
  }

  /** Kolik dokladů odkazuje na klienta — kvůli varování před smazáním. */
  function pocetDokladuKlienta(id) {
    return data.faktury.filter((f) => f.klientId === id).length;
  }

  function ulozFakturu(zmenena) {
    zmenena.zmeneno = Date.now();
    const index = data.faktury.findIndex((f) => f.id === zmenena.id);
    if (index >= 0) data.faktury[index] = zmenena;
    else data.faktury.push(zmenena);
    uloz();
    return zmenena;
  }

  function smazFakturu(id) {
    data.faktury = data.faktury.filter((f) => f.id !== id);
    uloz();
  }

  function ulozVydaj(zmeneny) {
    zmeneny.zmeneno = Date.now();
    const index = data.vydaje.findIndex((v) => v.id === zmeneny.id);
    if (index >= 0) data.vydaje[index] = zmeneny;
    else data.vydaje.push(zmeneny);
    uloz();
    return zmeneny;
  }

  function smazVydaj(id) {
    data.vydaje = data.vydaje.filter((v) => v.id !== id);
    uloz();
  }

  function ulozSablonu(zmenena) {
    const index = data.sablony.findIndex((s) => s.id === zmenena.id);
    if (index >= 0) data.sablony[index] = zmenena;
    else data.sablony.push(zmenena);
    uloz();
    return zmenena;
  }

  function smazSablonu(id) {
    data.sablony = data.sablony.filter((s) => s.id !== id);
    uloz();
  }

  /* ---------------- odvozené údaje ---------------- */

  function vypocet(doklad) {
    return Fx.vypocet.vypocetDokladu(doklad, data.nastaveni);
  }

  function stav(doklad) {
    return Fx.vypocet.stavDokladu(doklad, vypocet(doklad), util.dnesISO());
  }

  /** Faktury po splatnosti — číslo se ukazuje v levém panelu. */
  function poSplatnosti() {
    return Fx.denik.pohledavky(data).filter((p) => p.poSplatnosti > 0);
  }

  /** Šablony opakovaných faktur, kterým už nastalo datum vystavení. */
  function sablonyKVystaveni() {
    const dnes = util.dnesISO();
    return data.sablony.filter(
      (s) => s.aktivni && s.dalsiVystaveni && s.dalsiVystaveni <= dnes
    );
  }

  /** Doplní ceník o položky, které uživatel na fakturách opakuje. */
  function zapamatujPolozky(polozky) {
    for (const polozka of polozky) {
      const popis = String(polozka.popis || "").trim();
      if (!popis) continue;
      const znama = data.cenik.find((c) => c.popis.toLowerCase() === popis.toLowerCase());
      if (znama) {
        znama.cenaZaMj = util.cislo(polozka.cenaZaMj);
        znama.sazba = util.cislo(polozka.sazba);
        znama.jednotka = polozka.jednotka;
        znama.pouzito = (znama.pouzito || 0) + 1;
      } else {
        data.cenik.push({
          id: util.id("c"),
          popis,
          jednotka: polozka.jednotka,
          cenaZaMj: util.cislo(polozka.cenaZaMj),
          sazba: util.cislo(polozka.sazba),
          pouzito: 1,
        });
      }
    }
    // Ceník držíme rozumně krátký — nejčastěji používané nahoře.
    data.cenik.sort((a, b) => (b.pouzito || 0) - (a.pouzito || 0));
    if (data.cenik.length > 200) data.cenik.length = 200;
  }

  Fx.stav = {
    nacti,
    uloz,
    ulozHned,
    naZmenu,
    dej,
    klient,
    faktura,
    vydaj,
    sablona,
    pridejKlienta,
    ulozKlienta,
    smazKlienta,
    pocetDokladuKlienta,
    ulozFakturu,
    smazFakturu,
    ulozVydaj,
    smazVydaj,
    ulozSablonu,
    smazSablonu,
    vypocet,
    stav,
    poSplatnosti,
    sablonyKVystaveni,
    zapamatujPolozky,
    get ukladaSe() {
      return ukladaSe;
    },
  };
})(window);
