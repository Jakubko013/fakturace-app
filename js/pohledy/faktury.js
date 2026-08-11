/* Seznam vydaných dokladů s filtrem a hromadnými akcemi. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  // Nastavení filtru přežije přepnutí obrazovky, ať se uživatel nemusí vracet.
  const filtr = { text: "", typ: "vse", stav: "vse", rok: "vse" };

  function vykresli(kontejner) {
    Fx.app.zahlavi({
      nadpis: "Faktury",
      podnadpis: "Vydané doklady",
      akce: `<button data-akce="nova-zaloha">Zálohová faktura</button>
             <button class="hlavni" data-akce="nova-faktura">Nová faktura</button>`,
    });

    kontejner.innerHTML = `<div class="panel">
      <div class="nastroje">
        <input type="text" id="hledani" placeholder="Hledat číslo, odběratele, popis…" value="${util.esc(
          filtr.text
        )}">
        <select id="filtr-typ">${ui.moznosti(
          [
            { hodnota: "vse", nazev: "Všechny doklady" },
            { hodnota: "faktura", nazev: "Faktury" },
            { hodnota: "zaloha", nazev: "Zálohové faktury" },
            { hodnota: "dobropis", nazev: "Dobropisy" },
          ],
          filtr.typ
        )}</select>
        <select id="filtr-stav">${ui.moznosti(
          [
            { hodnota: "vse", nazev: "Všechny stavy" },
            { hodnota: "nezaplacene", nazev: "Neuhrazené" },
            { hodnota: "poSplatnosti", nazev: "Po splatnosti" },
            { hodnota: "zaplacena", nazev: "Zaplacené" },
            { hodnota: "koncept", nazev: "Koncepty" },
          ],
          filtr.stav
        )}</select>
        <select id="filtr-rok">${ui.moznosti(roky(), filtr.rok)}</select>
        <span class="oddelovac"></span>
        <button data-akce="export">Export do CSV</button>
      </div>
      <div class="telo bezodsazeni" id="seznam"></div>
    </div>`;

    vykresliSeznam();

    ui.naVstup(kontejner, "#hledani", (u, pole) => {
      filtr.text = pole.value;
      vykresliSeznam();
    });
    ui.naZmenu(kontejner, "#filtr-typ", (u, pole) => {
      filtr.typ = pole.value;
      vykresliSeznam();
    });
    ui.naZmenu(kontejner, "#filtr-stav", (u, pole) => {
      filtr.stav = pole.value;
      vykresliSeznam();
    });
    ui.naZmenu(kontejner, "#filtr-rok", (u, pole) => {
      filtr.rok = pole.value;
      vykresliSeznam();
    });

    ui.naKlik(kontejner, "[data-akce='nova-faktura']", () => Fx.app.prejdi("faktura/nova"));
    ui.naKlik(kontejner, "[data-akce='nova-zaloha']", () => Fx.app.prejdi("faktura/nova/zaloha"));
    ui.naKlik(kontejner, "[data-akce='export']", exportCsv);

    ui.naKlik(kontejner, "[data-otevri]", (u, prvek) => {
      Fx.app.prejdi("faktura/" + prvek.dataset.otevri);
    });
    ui.naKlik(kontejner, "[data-pdf]", async (u, prvek) => {
      u.stopPropagation();
      const faktura = Fx.stav.faktura(prvek.dataset.pdf);
      if (faktura) await Fx.doklad.ulozPdf(faktura, Fx.stav.dej());
    });
    ui.naKlik(kontejner, "[data-zaplatit]", async (u, prvek) => {
      u.stopPropagation();
      await oznacZaplacenou(prvek.dataset.zaplatit);
    });
    ui.naKlik(kontejner, "[data-kopie]", (u, prvek) => {
      u.stopPropagation();
      vytvorKopii(prvek.dataset.kopie);
    });
  }

  function roky() {
    const data = Fx.stav.dej();
    const nalezene = new Set(
      data.faktury.map((f) => String(f.datumVystaveni || "").slice(0, 4)).filter(Boolean)
    );
    nalezene.add(String(new Date().getFullYear()));
    return [
      { hodnota: "vse", nazev: "Všechny roky" },
      ...[...nalezene].sort().reverse().map((r) => ({ hodnota: r, nazev: r })),
    ];
  }

  function vyfiltrovane() {
    const data = Fx.stav.dej();
    const hledane = util.bezDiakritiky(filtr.text.trim().toLowerCase());

    return data.faktury
      .filter((faktura) => {
        if (filtr.typ !== "vse" && faktura.typ !== filtr.typ) return false;
        if (filtr.rok !== "vse" && String(faktura.datumVystaveni).slice(0, 4) !== filtr.rok)
          return false;

        const stav = Fx.stav.stav(faktura);
        if (filtr.stav === "nezaplacene" && (stav === "zaplacena" || stav === "stornovana" || stav === "koncept"))
          return false;
        if (filtr.stav === "poSplatnosti" && stav !== "poSplatnosti") return false;
        if (filtr.stav === "zaplacena" && stav !== "zaplacena") return false;
        if (filtr.stav === "koncept" && stav !== "koncept") return false;

        if (hledane) {
          const kupa = util.bezDiakritiky(
            [
              faktura.cislo,
              faktura.odberatel && faktura.odberatel.jmeno,
              faktura.poznamka,
              ...(faktura.polozky || []).map((p) => p.popis),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
          );
          if (!kupa.includes(hledane)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const podleData = String(b.datumVystaveni).localeCompare(String(a.datumVystaveni));
        return podleData !== 0 ? podleData : String(b.cislo).localeCompare(String(a.cislo));
      });
  }

  function vykresliSeznam() {
    const seznam = vyfiltrovane();
    const cil = ui.$("#seznam");
    if (!cil) return;
    const plateceDph = Fx.stav.dej().nastaveni.firma.plateceDph;

    if (!seznam.length) {
      cil.innerHTML = ui.prazdno(
        "Nic tu není",
        "Buď zatím nemáte doklady, nebo jim neodpovídá filtr.",
        `<button class="hlavni" data-akce="nova-faktura">Nová faktura</button>`
      );
      return;
    }

    let celkemBezDph = 0;
    let celkemSDph = 0;
    let celkemZbyva = 0;

    const radky = seznam
      .map((faktura) => {
        const vypocet = Fx.stav.vypocet(faktura);
        const stav = Fx.stav.stav(faktura);
        if (stav !== "stornovana" && stav !== "koncept") {
          celkemBezDph += vypocet.zakladCelkem;
          celkemSDph += vypocet.kUhrade;
          celkemZbyva += Math.max(0, vypocet.zbyvaUhradit);
        }
        const dnu = Fx.vypocet.dnuPoSplatnosti(faktura);

        return `<tr class="klikaci" data-otevri="${util.esc(faktura.id)}">
          <td class="hlavni-sloupec">
            ${util.esc(faktura.cislo || "koncept")}
            ${
              faktura.typ !== "faktura"
                ? `<div class="mala slaby">${util.esc(Fx.model.NAZVY_TYPU_KRATCE[faktura.typ])}</div>`
                : ""
            }
          </td>
          <td>${util.esc((faktura.odberatel && faktura.odberatel.jmeno) || "—")}</td>
          <td class="nowrap">${util.datumCz(faktura.datumVystaveni)}</td>
          <td class="nowrap">${util.datumCz(faktura.datumSplatnosti)}
            ${
              stav === "poSplatnosti"
                ? `<div class="mala cervene">${dnu} ${util.sklonuj(dnu, "den", "dny", "dní")} po splatnosti</div>`
                : ""
            }
          </td>
          <td>${ui.odznakStavu(stav)}</td>
          ${plateceDph ? `<td class="cislo">${util.formatCislo(vypocet.zakladCelkem)}</td>` : ""}
          <td class="cislo tucne">${util.formatCislo(vypocet.kUhrade)}</td>
          <td class="akce">
            <button class="drobne" data-pdf="${util.esc(faktura.id)}" title="Uložit PDF">PDF</button>
            ${
              stav !== "zaplacena" && stav !== "koncept" && stav !== "stornovana"
                ? `<button class="drobne" data-zaplatit="${util.esc(faktura.id)}">Zaplaceno</button>`
                : ""
            }
            <button class="drobne" data-kopie="${util.esc(faktura.id)}" title="Vytvořit kopii">Kopie</button>
          </td>
        </tr>`;
      })
      .join("");

    cil.innerHTML = `<table class="seznam">
      <thead><tr>
        <th>Číslo</th><th>Odběratel</th><th>Vystaveno</th><th>Splatnost</th><th>Stav</th>
        ${plateceDph ? '<th class="cislo">Bez DPH</th>' : ""}<th class="cislo">Celkem</th><th></th>
      </tr></thead>
      <tbody>${radky}</tbody>
      <tfoot><tr>
        <td colspan="5">${seznam.length} ${util.sklonuj(
      seznam.length,
      "doklad",
      "doklady",
      "dokladů"
    )}${celkemZbyva > 0 ? ` · neuhrazeno ${util.kc(celkemZbyva)}` : ""}</td>
        ${plateceDph ? `<td class="cislo">${util.formatCislo(celkemBezDph)}</td>` : ""}
        <td class="cislo">${util.formatCislo(celkemSDph)}</td>
        <td></td>
      </tr></tfoot>
    </table>`;
  }

  /* ---------------- akce ---------------- */

  async function oznacZaplacenou(id) {
    const faktura = Fx.stav.faktura(id);
    if (!faktura) return;
    const vypocet = Fx.stav.vypocet(faktura);
    const zbyva = vypocet.zbyvaUhradit;

    const odpoved = await ui.dialog({
      nadpis: "Zaznamenat úhradu",
      telo: `
        <div class="mrizka">
          <div class="pole">
            <label>Datum úhrady</label>
            <input type="date" id="u-datum" value="${util.dnesISO()}">
          </div>
          <div class="pole">
            <label>Částka</label>
            <input type="number" step="0.01" id="u-castka" value="${zbyva}">
          </div>
          <div class="pole">
            <label>Způsob</label>
            <select id="u-zpusob">${ui.moznosti(
              Object.entries(Fx.model.FORMY_UHRADY).map(([hodnota, nazev]) => ({ hodnota, nazev })),
              faktura.formaUhrady
            )}</select>
          </div>
        </div>
        <div class="napoveda">Faktura ${util.esc(faktura.cislo)} — k úhradě zbývá ${util.kc(
        zbyva
      )}.</div>`,
      tlacitka: [
        { text: "Zrušit", hodnota: null },
        { text: "Zaznamenat", hodnota: true, hlavni: true },
      ],
      predUzavrenim: (dialog) => ({
        datum: ui.$("#u-datum", dialog).value,
        castka: util.cislo(ui.$("#u-castka", dialog).value),
        zpusob: ui.$("#u-zpusob", dialog).value,
      }),
    });

    if (!odpoved) return;
    if (!odpoved.castka) {
      ui.hlaska("Zadejte částku úhrady.", "chyba");
      return;
    }
    faktura.uhrady.push(odpoved);
    if (faktura.stav === "koncept") faktura.stav = "vystavena";
    Fx.stav.ulozFakturu(faktura);
    ui.hlaska("Úhrada zaznamenána.", "uspech");
    vykresliSeznam();
    Fx.app.obnovNabidku();
  }

  function vytvorKopii(id) {
    const puvodni = Fx.stav.faktura(id);
    if (!puvodni) return;
    const data = Fx.stav.dej();
    const kopie = util.kopie(puvodni);
    kopie.id = util.id("f");
    kopie.cislo = "";
    kopie.stav = "koncept";
    kopie.uhrady = [];
    kopie.upominky = [];
    kopie.datumVystaveni = util.dnesISO();
    kopie.duzp = util.dnesISO();
    kopie.datumSplatnosti = util.pridejDny(
      util.dnesISO(),
      util.cislo(data.nastaveni.faktura.splatnostDni, 14)
    );
    kopie.vytvoreno = Date.now();
    kopie.polozky = (kopie.polozky || []).map((p) => Object.assign({}, p, { id: util.id("p") }));
    Fx.stav.ulozFakturu(kopie);
    Fx.app.prejdi("faktura/" + kopie.id);
    ui.hlaska("Vytvořena kopie jako koncept.", "uspech");
  }

  async function exportCsv() {
    const seznam = vyfiltrovane();
    const plateceDph = Fx.stav.dej().nastaveni.firma.plateceDph;
    const hlavicka = [
      "Číslo",
      "Typ",
      "Odběratel",
      "IČO",
      "DIČ",
      "Vystaveno",
      "DUZP",
      "Splatnost",
      "Stav",
      ...(plateceDph ? ["Základ", "DPH"] : []),
      "Celkem",
      "Uhrazeno",
      "Zbývá",
    ];
    const radky = seznam.map((faktura) => {
      const vypocet = Fx.stav.vypocet(faktura);
      const odberatel = faktura.odberatel || {};
      return [
        faktura.cislo,
        Fx.model.NAZVY_TYPU_KRATCE[faktura.typ] || faktura.typ,
        odberatel.jmeno,
        odberatel.ico,
        odberatel.dic,
        util.datumCz(faktura.datumVystaveni),
        util.datumCz(faktura.duzp),
        util.datumCz(faktura.datumSplatnosti),
        Fx.vypocet.STAVY[Fx.stav.stav(faktura)].nazev,
        ...(plateceDph ? [vypocet.zakladCelkem, vypocet.dphCelkem] : []),
        vypocet.kUhrade,
        vypocet.zaplaceno,
        vypocet.zbyvaUhradit,
      ];
    });
    await ui.ulozCsv(Fx.csv.sestav(hlavicka, radky), "faktury-" + util.dnesISO());
  }

  pohledy.faktury = { vykresli };
})(window);
