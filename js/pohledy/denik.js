/* Peněžní deník — přehled skutečných příjmů a výdajů podle data platby. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  const vyber = { rok: String(new Date().getFullYear()), obdobi: "rok", druh: "vse" };

  const plateceDph = () => Fx.stav.dej().nastaveni.firma.plateceDph;

  function meze() {
    const rok = Number(vyber.rok);
    if (vyber.obdobi === "rok") return { od: `${rok}-01-01`, do: `${rok}-12-31` };
    if (vyber.obdobi.startsWith("q")) {
      return util.obdobi(rok, Number(vyber.obdobi.slice(1)), "ctvrtleti");
    }
    return util.obdobi(rok, Number(vyber.obdobi), "mesic");
  }

  function vykresli(kontejner) {
    Fx.app.zahlavi({
      nadpis: "Peněžní deník",
      podnadpis: "Daňová evidence — rozhoduje datum úhrady",
      akce: `<button data-akce="export">Export do CSV</button>`,
    });

    kontejner.innerHTML = `
      <div class="panel">
        <div class="nastroje">
          <select id="d-rok">${ui.moznosti(roky(), vyber.rok)}</select>
          <select id="d-obdobi">${ui.moznosti(obdobiMoznosti(), vyber.obdobi)}</select>
          <select id="d-druh">${ui.moznosti(
            [
              { hodnota: "vse", nazev: "Příjmy i výdaje" },
              { hodnota: "prijem", nazev: "Jen příjmy" },
              { hodnota: "vydaj", nazev: "Jen výdaje" },
            ],
            vyber.druh
          )}</select>
        </div>
        <div class="telo" id="d-souhrn"></div>
      </div>
      <div class="panel">
        <h2>Pohyby</h2>
        <div class="telo bezodsazeni" id="d-seznam"></div>
      </div>
      <div id="d-doplnky"></div>`;

    prekresli();

    ui.naZmenu(kontejner, "#d-rok", (u, p) => {
      vyber.rok = p.value;
      prekresli();
    });
    ui.naZmenu(kontejner, "#d-obdobi", (u, p) => {
      vyber.obdobi = p.value;
      prekresli();
    });
    ui.naZmenu(kontejner, "#d-druh", (u, p) => {
      vyber.druh = p.value;
      prekresli();
    });
    ui.naKlik(kontejner, "[data-doklad]", (u, prvek) => {
      const typ = prvek.dataset.typ;
      if (typ === "faktura") Fx.app.prejdi("faktura/" + prvek.dataset.doklad);
      else Fx.app.prejdi("vydaje");
    });

    ui.$("#akce-zahlavi").onclick = (udalost) => {
      if (udalost.target.closest("[data-akce='export']")) exportCsv();
    };
  }

  function roky() {
    const data = Fx.stav.dej();
    const nalezene = new Set([String(new Date().getFullYear())]);
    data.faktury.forEach((f) =>
      (f.uhrady || []).forEach((u) => u.datum && nalezene.add(String(u.datum).slice(0, 4)))
    );
    data.vydaje.forEach((v) => v.datumUhrady && nalezene.add(String(v.datumUhrady).slice(0, 4)));
    return [...nalezene].sort().reverse().map((r) => ({ hodnota: r, nazev: r }));
  }

  function obdobiMoznosti() {
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
    return [
      { hodnota: "rok", nazev: "Celý rok" },
      ...[1, 2, 3, 4].map((q) => ({ hodnota: "q" + q, nazev: q + ". čtvrtletí" })),
      ...mesice.map((nazev, i) => ({ hodnota: String(i + 1), nazev })),
    ];
  }

  function prekresli() {
    const data = Fx.stav.dej();
    const rozsah = meze();
    const vsechny = Fx.denik.polozkyDeniku(data, rozsah.od, rozsah.do);
    const polozky = vsechny.filter((p) => vyber.druh === "vse" || p.druh === vyber.druh);
    const souhrn = Fx.denik.souhrn(vsechny);

    ui.$("#d-souhrn").innerHTML = `
      <div class="dlazdice" style="margin:0">
        <div class="karta">
          <div class="titulek">Příjmy</div>
          <div class="hodnota">${util.kc(souhrn.prijmyCelkem, 0)}</div>
          <div class="doplnek">${
            plateceDph()
              ? "do základu daně " + util.kc(souhrn.prijmyDoZakladu, 0)
              : "vše vstupuje do základu daně"
          }</div>
        </div>
        <div class="karta">
          <div class="titulek">Výdaje</div>
          <div class="hodnota">${util.kc(souhrn.vydajeCelkem, 0)}</div>
          <div class="doplnek">daňově uznatelné ${util.kc(souhrn.vydajeDoZakladu, 0)}</div>
        </div>
        <div class="karta ${souhrn.rozdilPenez >= 0 ? "zvyrazneni-zelena" : "zvyrazneni-cervena"}">
          <div class="titulek">Rozdíl peněz</div>
          <div class="hodnota">${util.kc(souhrn.rozdilPenez, 0)}</div>
          <div class="doplnek">kolik zbylo na účtu a v hotovosti</div>
        </div>
        <div class="karta">
          <div class="titulek">Základ daně z příjmů</div>
          <div class="hodnota">${util.kc(souhrn.zakladDane, 0)}</div>
          <div class="doplnek">příjmy bez DPH − daňové výdaje</div>
        </div>
      </div>`;

    ui.$("#d-seznam").innerHTML = polozky.length
      ? tabulka(polozky)
      : ui.prazdno("V tomto období nejsou žádné pohyby", "Zkuste jiné období nebo zaznamenejte úhradu faktury.");

    ui.$("#d-doplnky").innerHTML = kategorieHtml(souhrn) + zbyvaHtml(data);
  }

  function tabulka(polozky) {
    const sDani = plateceDph();
    let zustatek = 0;
    const radky = polozky
      .map((p) => {
        zustatek += p.druh === "prijem" ? p.castka : -p.castka;
        return `<tr class="klikaci" data-doklad="${util.esc(p.dokladId)}" data-typ="${util.esc(
          p.dokladTyp
        )}">
          <td class="nowrap">${util.datumCz(p.datum)}</td>
          <td class="hlavni-sloupec">${util.esc(p.doklad)}</td>
          <td>${util.esc(p.popis)}<div class="mala slaby">${util.esc(p.protistrana)}</div></td>
          <td class="mala">${util.esc(p.kategorieNazev)}${
          !p.danovy ? `<div class="slaby">nedaňový</div>` : ""
        }</td>
          <td class="cislo zelene">${p.druh === "prijem" ? util.formatCislo(p.castka) : ""}</td>
          <td class="cislo cervene">${p.druh === "vydaj" ? util.formatCislo(p.castka) : ""}</td>
          ${sDani ? `<td class="cislo slaby">${util.formatCislo(p.dph)}</td>` : ""}
          <td class="cislo">${util.formatCislo(p.doZakladuDane)}</td>
          <td class="cislo tucne">${util.formatCislo(zustatek)}</td>
        </tr>`;
      })
      .join("");

    return `<table class="seznam">
      <thead><tr>
        <th>Datum</th><th>Doklad</th><th>Popis</th><th>Kategorie</th>
        <th class="cislo">Příjem</th><th class="cislo">Výdaj</th>
        ${sDani ? '<th class="cislo">z toho DPH</th>' : ""}
        <th class="cislo">Do základu daně</th><th class="cislo">Zůstatek</th>
      </tr></thead>
      <tbody>${radky}</tbody>
    </table>`;
  }

  function kategorieHtml(souhrn) {
    if (!souhrn.kategorie.length) return "";
    const nejvetsi = Math.max(...souhrn.kategorie.map((k) => k.castka));
    return `<div class="panel">
      <h2>Výdaje podle kategorií</h2>
      <div class="telo bezodsazeni">
        <table class="seznam">
          <thead><tr><th>Kategorie</th><th style="width:40%"></th>
            <th class="cislo">Zaplaceno</th><th class="cislo">Do základu daně</th></tr></thead>
          <tbody>
            ${souhrn.kategorie
              .map(
                (k) => `<tr>
                  <td>${util.esc(k.nazev)}</td>
                  <td><div style="background:var(--hlavni-svetla);border-radius:3px;height:8px;width:${
                    (k.castka / nejvetsi) * 100
                  }%"></div></td>
                  <td class="cislo">${util.kc(k.castka)}</td>
                  <td class="cislo">${util.kc(k.doZakladu)}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function zbyvaHtml(data) {
    const pohledavky = Fx.denik.pohledavky(data);
    const zavazky = Fx.denik.zavazky(data);
    if (!pohledavky.length && !zavazky.length) return "";

    const soucetP = pohledavky.reduce((s, p) => s + p.zbyva, 0);
    const soucetZ = zavazky.reduce((s, z) => s + z.zbyva, 0);

    return `<div class="panel">
      <h2>Neuhrazené k dnešnímu dni</h2>
      <div class="telo">
        <div class="mrizka">
          <div>
            <div class="podnadpis">Pohledávky — dluží mně</div>
            <div class="tucne" style="font-size:1.2rem">${util.kc(soucetP, 0)}</div>
            <div class="mala slaby">${pohledavky.length} ${util.sklonuj(
      pohledavky.length,
      "faktura",
      "faktury",
      "faktur"
    )}</div>
          </div>
          <div>
            <div class="podnadpis">Závazky — dlužím já</div>
            <div class="tucne" style="font-size:1.2rem">${util.kc(soucetZ, 0)}</div>
            <div class="mala slaby">${zavazky.length} ${util.sklonuj(
      zavazky.length,
      "doklad",
      "doklady",
      "dokladů"
    )}</div>
          </div>
        </div>
        <div class="napoveda" style="margin-top:12px">
          Neuhrazené doklady do daňové evidence zatím nevstupují — započítají se až v okamžiku zaplacení.
        </div>
      </div>
    </div>`;
  }

  async function exportCsv() {
    const data = Fx.stav.dej();
    const rozsah = meze();
    const polozky = Fx.denik.polozkyDeniku(data, rozsah.od, rozsah.do);
    const hlavicka = [
      "Datum",
      "Doklad",
      "Popis",
      "Protistrana",
      "Kategorie",
      "Příjem",
      "Výdaj",
      "z toho DPH",
      "Do základu daně",
      "Daňový",
    ];
    const radky = polozky.map((p) => [
      util.datumCz(p.datum),
      p.doklad,
      p.popis,
      p.protistrana,
      p.kategorieNazev,
      p.druh === "prijem" ? p.castka : 0,
      p.druh === "vydaj" ? p.castka : 0,
      p.dph,
      p.doZakladuDane,
      p.danovy ? "ano" : "ne",
    ]);
    await ui.ulozCsv(
      Fx.csv.sestav(hlavicka, radky),
      `penezni-denik-${rozsah.od}-az-${rozsah.do}`
    );
  }

  pohledy.denik = { vykresli };
})(window);
