/* Podklady pro přiznání k DPH a kontrolní hlášení.

   Aplikace nevytváří XML pro finanční správu — čísla jsou připravená tak,
   aby se dala přepsat do formuláře na portálu MOJE daně, a doklady k nim
   jde vyexportovat pro účetní. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  const vyber = { rok: null, poradi: null };

  function ctvrtletni() {
    return Fx.stav.dej().nastaveni.dph.obdobi === "ctvrtleti";
  }

  function vychoziObdobi() {
    const dnes = new Date();
    let rok = dnes.getFullYear();
    let poradi = ctvrtletni() ? Math.floor(dnes.getMonth() / 3) + 1 : dnes.getMonth() + 1;
    poradi -= 1; // přiznání se podává za období, které už skončilo
    if (poradi < 1) {
      poradi = ctvrtletni() ? 4 : 12;
      rok -= 1;
    }
    return { rok, poradi };
  }

  function vykresli(kontejner) {
    const data = Fx.stav.dej();

    if (!data.nastaveni.firma.plateceDph) {
      Fx.app.zahlavi({ nadpis: "DPH", podnadpis: "" });
      kontejner.innerHTML = ui.prazdno(
        "Nejste plátce DPH",
        "Přehled se zapne, jakmile v nastavení označíte, že jste plátcem DPH."
      );
      return;
    }

    if (vyber.rok === null) {
      const vychozi = vychoziObdobi();
      vyber.rok = vychozi.rok;
      vyber.poradi = vychozi.poradi;
    }

    Fx.app.zahlavi({
      nadpis: "DPH",
      podnadpis: ctvrtletni() ? "Čtvrtletní plátce" : "Měsíční plátce",
      akce: `<button data-akce="export-kh">Export kontrolního hlášení</button>
             <button data-akce="export-doklady">Export dokladů</button>`,
    });

    kontejner.innerHTML = `
      <div class="panel">
        <div class="nastroje">
          <select id="dph-rok">${ui.moznosti(roky(), String(vyber.rok))}</select>
          <select id="dph-obdobi">${ui.moznosti(obdobiMoznosti(), String(vyber.poradi))}</select>
        </div>
        <div class="telo" id="dph-obsah"></div>
      </div>
      <div id="dph-detaily"></div>`;

    prekresli();

    ui.naZmenu(kontejner, "#dph-rok", (u, p) => {
      vyber.rok = Number(p.value);
      prekresli();
    });
    ui.naZmenu(kontejner, "#dph-obdobi", (u, p) => {
      vyber.poradi = Number(p.value);
      prekresli();
    });
    ui.naKlik(kontejner, "[data-faktura]", (u, prvek) =>
      Fx.app.prejdi("faktura/" + prvek.dataset.faktura)
    );

    ui.$("#akce-zahlavi").onclick = (udalost) => {
      const tlacitko = udalost.target.closest("[data-akce]");
      if (!tlacitko) return;
      if (tlacitko.dataset.akce === "export-kh") exportKontrolnihoHlaseni();
      if (tlacitko.dataset.akce === "export-doklady") exportDokladu();
    };
  }

  function roky() {
    const data = Fx.stav.dej();
    const nalezene = new Set([String(new Date().getFullYear())]);
    data.faktury.forEach((f) => f.duzp && nalezene.add(String(f.duzp).slice(0, 4)));
    data.vydaje.forEach((v) => v.duzp && nalezene.add(String(v.duzp).slice(0, 4)));
    return [...nalezene].sort().reverse().map((r) => ({ hodnota: r, nazev: r }));
  }

  function obdobiMoznosti() {
    if (ctvrtletni()) {
      return [1, 2, 3, 4].map((q) => ({ hodnota: String(q), nazev: q + ". čtvrtletí" }));
    }
    const mesice = [
      "leden",
      "únor",
      "březen",
      "duben",
      "květen",
      "červen",
      "červenec",
      "srpen",
      "září",
      "říjen",
      "listopad",
      "prosinec",
    ];
    return mesice.map((nazev, i) => ({ hodnota: String(i + 1), nazev }));
  }

  function rozsah() {
    return util.obdobi(vyber.rok, vyber.poradi, ctvrtletni() ? "ctvrtleti" : "mesic");
  }

  function prekresli() {
    const data = Fx.stav.dej();
    const meze = rozsah();
    const prehled = Fx.dph.prehledDph(data, meze.od, meze.do);
    const kh = Fx.dph.kontrolniHlaseni(data, meze.od, meze.do);

    ui.$("#dph-obsah").innerHTML = `
      <div class="napoveda" style="margin-bottom:14px">
        Období ${util.datumCz(meze.od)} — ${util.datumCz(meze.do)}, doklady zařazené podle data
        zdanitelného plnění.
      </div>
      <div class="dlazdice" style="margin:0">
        <div class="karta">
          <div class="titulek">Daň na výstupu</div>
          <div class="hodnota">${util.kc(prehled.danNaVystupu, 0)}</div>
          <div class="doplnek">z vydaných faktur</div>
        </div>
        <div class="karta">
          <div class="titulek">Odpočet daně</div>
          <div class="hodnota">${util.kc(prehled.odpocet, 0)}</div>
          <div class="doplnek">z přijatých dokladů</div>
        </div>
        <div class="karta ${prehled.jeNadmernyOdpocet ? "zvyrazneni-zelena" : "zvyrazneni-cervena"}">
          <div class="titulek">${
            prehled.jeNadmernyOdpocet ? "Nadměrný odpočet" : "Vlastní daňová povinnost"
          }</div>
          <div class="hodnota">${util.kc(Math.abs(prehled.vysledek), 0)}</div>
          <div class="doplnek">${
            prehled.jeNadmernyOdpocet ? "finanční úřad vrátí" : "k zaplacení finančnímu úřadu"
          }</div>
        </div>
      </div>`;

    ui.$("#dph-detaily").innerHTML =
      radkyPriznaniHtml(prehled) + kontrolniHlaseniHtml(kh) + dokladyHtml(prehled);
  }

  function radek(cislo, nazev, hodnota) {
    if (!hodnota || (!hodnota.zaklad && !hodnota.dan)) return "";
    return `<tr>
      <td class="slaby">${cislo}</td>
      <td>${util.esc(nazev)}</td>
      <td class="cislo">${util.formatCislo(hodnota.zaklad)}</td>
      <td class="cislo">${hodnota.dan ? util.formatCislo(hodnota.dan) : ""}</td>
    </tr>`;
  }

  function radkyPriznaniHtml(prehled) {
    const vystup = prehled.vystup;
    const vstup = prehled.vstup;
    const radky = [
      radek(1, "Dodání zboží nebo poskytnutí služby — základní sazba", vystup.r1),
      radek(2, "Dodání zboží nebo poskytnutí služby — snížená sazba", vystup.r2),
      radek(10, "Přijatá plnění v režimu přenesení — základní sazba", vystup.r10),
      radek(11, "Přijatá plnění v režimu přenesení — snížená sazba", vystup.r11),
      radek(20, "Dodání zboží do jiného členského státu", vystup.r20),
      radek(21, "Poskytnutí služeb s místem plnění v EU", vystup.r21),
      radek(25, "Režim přenesení daňové povinnosti — dodavatel", vystup.r25),
      radek(26, "Ostatní uskutečněná plnění", vystup.r26),
    ]
      .filter(Boolean)
      .join("");

    const radkyVstup = [
      radek(40, "Z přijatých zdanitelných plnění — základní sazba", vstup.r40),
      radek(41, "Z přijatých zdanitelných plnění — snížená sazba", vstup.r41),
      radek(43, "Odpočet u plnění podle řádků 10 a 11 — základní sazba", vstup.r43),
      radek(44, "Odpočet u plnění podle řádků 10 a 11 — snížená sazba", vstup.r44),
    ]
      .filter(Boolean)
      .join("");

    return `<div class="panel">
      <h2>Podklady pro přiznání k DPH</h2>
      <div class="telo bezodsazeni">
        <table class="seznam">
          <thead><tr><th style="width:60px">Řádek</th><th>Plnění</th>
            <th class="cislo">Základ daně</th><th class="cislo">Daň</th></tr></thead>
          <tbody>
            ${
              radky
                ? `<tr><td colspan="4" class="podnadpis" style="margin:0">Zdanitelná plnění na výstupu</td></tr>${radky}`
                : ""
            }
            ${
              radkyVstup
                ? `<tr><td colspan="4" class="podnadpis" style="margin:0">Nárok na odpočet daně</td></tr>${radkyVstup}`
                : ""
            }
            ${
              !radky && !radkyVstup
                ? `<tr><td colspan="4" class="slaby" style="text-align:center;padding:30px">V tomto období nejsou žádná plnění.</td></tr>`
                : ""
            }
          </tbody>
          <tfoot>
            <tr><td></td><td>Ř. 62 — daň na výstupu</td><td></td>
              <td class="cislo">${util.formatCislo(prehled.danNaVystupu)}</td></tr>
            <tr><td></td><td>Ř. 63 — odpočet daně</td><td></td>
              <td class="cislo">${util.formatCislo(prehled.odpocet)}</td></tr>
            <tr><td></td><td>${
              prehled.jeNadmernyOdpocet ? "Ř. 65 — nadměrný odpočet" : "Ř. 64 — vlastní daňová povinnost"
            }</td><td></td>
              <td class="cislo">${util.formatCislo(Math.abs(prehled.vysledek))}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  }

  function kontrolniHlaseniHtml(kh) {
    const oddily = [];

    if (kh.A1.length) {
      oddily.push(`
        <div class="podnadpis">A.1 — režim přenesení daňové povinnosti (dodavatel)</div>
        <table class="seznam">
          <thead><tr><th>Doklad</th><th>DIČ odběratele</th><th>DUZP</th><th class="cislo">Základ</th></tr></thead>
          <tbody>${kh.A1.map(
            (r) => `<tr><td>${util.esc(r.cislo)}</td><td>${util.esc(r.dic)}</td>
              <td>${util.datumCz(r.duzp)}</td><td class="cislo">${util.formatCislo(r.zaklad)}</td></tr>`
          ).join("")}</tbody>
        </table>`);
    }

    if (kh.A4.length) {
      oddily.push(`
        <div class="podnadpis">A.4 — uskutečněná plnění nad ${util.kc(kh.limit, 0)}</div>
        <table class="seznam">
          <thead><tr><th>Doklad</th><th>DIČ odběratele</th><th>DUZP</th>
            <th class="cislo">Základ 21 %</th><th class="cislo">Daň 21 %</th>
            <th class="cislo">Základ 12 %</th><th class="cislo">Daň 12 %</th></tr></thead>
          <tbody>${kh.A4.map(
            (r) => `<tr>
              <td>${util.esc(r.cislo)}</td><td>${util.esc(r.dic)}</td><td>${util.datumCz(r.duzp)}</td>
              <td class="cislo">${util.formatCislo(r.zaklad21)}</td>
              <td class="cislo">${util.formatCislo(r.dan21)}</td>
              <td class="cislo">${util.formatCislo(r.zaklad12)}</td>
              <td class="cislo">${util.formatCislo(r.dan12)}</td>
            </tr>`
          ).join("")}</tbody>
        </table>`);
    }

    if (kh.A5.zaklad21 || kh.A5.zaklad12) {
      oddily.push(`
        <div class="podnadpis">A.5 — ostatní uskutečněná plnění (souhrnně)</div>
        <table class="seznam">
          <thead><tr><th class="cislo">Základ 21 %</th><th class="cislo">Daň 21 %</th>
            <th class="cislo">Základ 12 %</th><th class="cislo">Daň 12 %</th></tr></thead>
          <tbody><tr>
            <td class="cislo">${util.formatCislo(kh.A5.zaklad21)}</td>
            <td class="cislo">${util.formatCislo(kh.A5.dan21)}</td>
            <td class="cislo">${util.formatCislo(kh.A5.zaklad12)}</td>
            <td class="cislo">${util.formatCislo(kh.A5.dan12)}</td>
          </tr></tbody>
        </table>`);
    }

    if (kh.B2.length) {
      oddily.push(`
        <div class="podnadpis">B.2 — přijatá plnění nad ${util.kc(kh.limit, 0)}</div>
        <table class="seznam">
          <thead><tr><th>Doklad</th><th>DIČ dodavatele</th><th>DUZP</th>
            <th class="cislo">Základ 21 %</th><th class="cislo">Odpočet 21 %</th>
            <th class="cislo">Základ 12 %</th><th class="cislo">Odpočet 12 %</th></tr></thead>
          <tbody>${kh.B2.map(
            (r) => `<tr>
              <td>${util.esc(r.cislo)}</td><td>${util.esc(r.dic)}</td><td>${util.datumCz(r.duzp)}</td>
              <td class="cislo">${util.formatCislo(r.zaklad21)}</td>
              <td class="cislo">${util.formatCislo(r.dan21)}</td>
              <td class="cislo">${util.formatCislo(r.zaklad12)}</td>
              <td class="cislo">${util.formatCislo(r.dan12)}</td>
            </tr>`
          ).join("")}</tbody>
        </table>`);
    }

    if (kh.B3.zaklad21 || kh.B3.zaklad12) {
      oddily.push(`
        <div class="podnadpis">B.3 — ostatní přijatá plnění (souhrnně)</div>
        <table class="seznam">
          <thead><tr><th class="cislo">Základ 21 %</th><th class="cislo">Odpočet 21 %</th>
            <th class="cislo">Základ 12 %</th><th class="cislo">Odpočet 12 %</th></tr></thead>
          <tbody><tr>
            <td class="cislo">${util.formatCislo(kh.B3.zaklad21)}</td>
            <td class="cislo">${util.formatCislo(kh.B3.dan21)}</td>
            <td class="cislo">${util.formatCislo(kh.B3.zaklad12)}</td>
            <td class="cislo">${util.formatCislo(kh.B3.dan12)}</td>
          </tr></tbody>
        </table>`);
    }

    if (kh.B1.length) {
      oddily.push(`
        <div class="podnadpis">B.1 — přijatá plnění v režimu přenesení</div>
        <table class="seznam">
          <thead><tr><th>Doklad</th><th>DIČ dodavatele</th><th>DUZP</th>
            <th class="cislo">Základ</th><th class="cislo">Daň</th></tr></thead>
          <tbody>${kh.B1.map(
            (r) => `<tr><td>${util.esc(r.cislo)}</td><td>${util.esc(r.dic)}</td>
              <td>${util.datumCz(r.duzp)}</td>
              <td class="cislo">${util.formatCislo(r.zaklad)}</td>
              <td class="cislo">${util.formatCislo(r.dan)}</td></tr>`
          ).join("")}</tbody>
        </table>`);
    }

    if (!oddily.length) return "";

    return `<div class="panel">
      <h2>Kontrolní hlášení</h2>
      <div class="telo">
        <div class="napoveda" style="margin-bottom:6px">
          Doklady nad ${util.kc(
            kh.limit,
            0
          )} včetně daně se uvádějí jmenovitě, ostatní jen souhrnně.
        </div>
        ${oddily.join("")}
      </div>
    </div>`;
  }

  function dokladyHtml(prehled) {
    if (!prehled.doklady.vydane.length) return "";
    return `<div class="panel">
      <h2>Vydané doklady v období</h2>
      <div class="telo bezodsazeni">
        <table class="seznam">
          <thead><tr><th>Číslo</th><th>Odběratel</th><th>DUZP</th>
            <th class="cislo">Základ</th><th class="cislo">DPH</th><th class="cislo">Celkem</th></tr></thead>
          <tbody>
            ${prehled.doklady.vydane
              .map(
                ({ faktura, vypocet }) => `<tr class="klikaci" data-faktura="${util.esc(faktura.id)}">
                  <td class="hlavni-sloupec">${util.esc(faktura.cislo)}</td>
                  <td>${util.esc(faktura.odberatel.jmeno)}</td>
                  <td>${util.datumCz(faktura.duzp)}</td>
                  <td class="cislo">${util.formatCislo(vypocet.zakladCelkem)}</td>
                  <td class="cislo">${util.formatCislo(vypocet.dphCelkem)}</td>
                  <td class="cislo tucne">${util.formatCislo(vypocet.kUhrade)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  /* ---------------- exporty ---------------- */

  async function exportKontrolnihoHlaseni() {
    const data = Fx.stav.dej();
    const meze = rozsah();
    const kh = Fx.dph.kontrolniHlaseni(data, meze.od, meze.do);

    const hlavicka = [
      "Oddíl",
      "Doklad",
      "DIČ",
      "Název",
      "DUZP",
      "Základ 21",
      "Daň 21",
      "Základ 12",
      "Daň 12",
      "Celkem",
    ];
    const radky = [];
    kh.A1.forEach((r) =>
      radky.push(["A.1", r.cislo, r.dic, r.odberatel, util.datumCz(r.duzp), r.zaklad, 0, 0, 0, r.zaklad])
    );
    kh.A4.forEach((r) =>
      radky.push([
        "A.4",
        r.cislo,
        r.dic,
        r.odberatel,
        util.datumCz(r.duzp),
        r.zaklad21,
        r.dan21,
        r.zaklad12,
        r.dan12,
        r.celkem,
      ])
    );
    if (kh.A5.zaklad21 || kh.A5.zaklad12) {
      radky.push(["A.5", "souhrnně", "", "", "", kh.A5.zaklad21, kh.A5.dan21, kh.A5.zaklad12, kh.A5.dan12, ""]);
    }
    kh.B1.forEach((r) =>
      radky.push(["B.1", r.cislo, r.dic, r.dodavatel, util.datumCz(r.duzp), r.zaklad, r.dan, 0, 0, r.zaklad])
    );
    kh.B2.forEach((r) =>
      radky.push([
        "B.2",
        r.cislo,
        r.dic,
        r.dodavatel,
        util.datumCz(r.duzp),
        r.zaklad21,
        r.dan21,
        r.zaklad12,
        r.dan12,
        r.celkem,
      ])
    );
    if (kh.B3.zaklad21 || kh.B3.zaklad12) {
      radky.push(["B.3", "souhrnně", "", "", "", kh.B3.zaklad21, kh.B3.dan21, kh.B3.zaklad12, kh.B3.dan12, ""]);
    }

    if (!radky.length) return ui.hlaska("V tomto období není co exportovat.", "chyba");
    await ui.ulozCsv(Fx.csv.sestav(hlavicka, radky), `kontrolni-hlaseni-${meze.od}-az-${meze.do}`);
  }

  async function exportDokladu() {
    const data = Fx.stav.dej();
    const meze = rozsah();
    const prehled = Fx.dph.prehledDph(data, meze.od, meze.do);

    const hlavicka = [
      "Druh",
      "Doklad",
      "Protistrana",
      "DIČ",
      "DUZP",
      "Základ",
      "DPH",
      "Celkem",
      "Režim",
    ];
    const radky = [];
    prehled.doklady.vydane.forEach(({ faktura, vypocet }) =>
      radky.push([
        "vydaná",
        faktura.cislo,
        faktura.odberatel.jmeno,
        faktura.odberatel.dic,
        util.datumCz(faktura.duzp),
        vypocet.zakladCelkem,
        vypocet.dphCelkem,
        vypocet.kUhrade,
        (Fx.vypocet.REZIMY[faktura.rezim] || {}).nazev || "",
      ])
    );
    prehled.doklady.prijate.forEach(({ vydaj, rozpis }) =>
      radky.push([
        "přijatá",
        vydaj.cisloDokladu,
        vydaj.dodavatel.jmeno,
        vydaj.dodavatel.dic,
        util.datumCz(vydaj.duzp),
        rozpis.zakladCelkem,
        rozpis.odpocetCelkem,
        rozpis.celkem,
        vydaj.rezim,
      ])
    );

    if (!radky.length) return ui.hlaska("V tomto období nejsou žádné doklady.", "chyba");
    await ui.ulozCsv(Fx.csv.sestav(hlavicka, radky), `doklady-dph-${meze.od}-az-${meze.do}`);
  }

  pohledy.dph = { vykresli };
})(window);
