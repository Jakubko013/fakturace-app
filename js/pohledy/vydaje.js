/* Přijaté faktury, paragony a ostatní výdaje. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  const filtr = { text: "", rok: String(new Date().getFullYear()), kategorie: "vse", stav: "vse" };

  function vykresli(kontejner, parametr) {
    Fx.app.zahlavi({
      nadpis: "Výdaje",
      podnadpis: "Přijaté faktury a ostatní náklady",
      akce: `<button class="hlavni" data-akce="novy">Nový výdaj</button>`,
    });

    kontejner.innerHTML = `<div class="panel">
      <div class="nastroje">
        <input type="text" id="hledani" placeholder="Hledat dodavatele, číslo, popis…" value="${util.esc(
          filtr.text
        )}">
        <select id="filtr-rok">${ui.moznosti(roky(), filtr.rok)}</select>
        <select id="filtr-kategorie">${ui.moznosti(
          [
            { hodnota: "vse", nazev: "Všechny kategorie" },
            ...Fx.model
              .nabizeneKategorie(Fx.stav.dej().vydaje.map((v) => v.kategorie))
              .map((k) => ({ hodnota: k.id, nazev: k.nazev })),
          ],
          filtr.kategorie
        )}</select>
        <select id="filtr-stav">${ui.moznosti(
          [
            { hodnota: "vse", nazev: "Zaplacené i nezaplacené" },
            { hodnota: "nezaplacene", nazev: "Nezaplacené" },
            { hodnota: "zaplacene", nazev: "Zaplacené" },
          ],
          filtr.stav
        )}</select>
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
    ui.naZmenu(kontejner, "#filtr-rok", (u, p) => {
      filtr.rok = p.value;
      vykresliSeznam();
    });
    ui.naZmenu(kontejner, "#filtr-kategorie", (u, p) => {
      filtr.kategorie = p.value;
      vykresliSeznam();
    });
    ui.naZmenu(kontejner, "#filtr-stav", (u, p) => {
      filtr.stav = p.value;
      vykresliSeznam();
    });

    ui.naKlik(kontejner, "[data-akce='export']", exportCsv);
    ui.naKlik(kontejner, "[data-uprav]", (u, prvek) => upravVydaj(prvek.dataset.uprav));
    ui.naKlik(kontejner, "[data-zaplatit]", (u, prvek) => {
      u.stopPropagation();
      oznacZaplaceny(prvek.dataset.zaplatit);
    });
    ui.naKlik(kontejner, "[data-smaz]", (u, prvek) => {
      u.stopPropagation();
      smazVydaj(prvek.dataset.smaz);
    });

    ui.$("#akce-zahlavi").onclick = (udalost) => {
      if (udalost.target.closest("[data-akce='novy']")) upravVydaj(null);
    };

    if (parametr === "novy") upravVydaj(null);
  }

  function roky() {
    const data = Fx.stav.dej();
    const nalezene = new Set(
      data.vydaje.map((v) => String(v.datumVystaveni || "").slice(0, 4)).filter(Boolean)
    );
    nalezene.add(String(new Date().getFullYear()));
    return [
      { hodnota: "vse", nazev: "Všechny roky" },
      ...[...nalezene].sort().reverse().map((r) => ({ hodnota: r, nazev: r })),
    ];
  }

  function vyfiltrovane() {
    const data = Fx.stav.dej();
    const hledat = util.bezDiakritiky(filtr.text.trim().toLowerCase());
    return data.vydaje
      .filter((vydaj) => {
        if (filtr.rok !== "vse" && String(vydaj.datumVystaveni).slice(0, 4) !== filtr.rok) return false;
        if (filtr.kategorie !== "vse" && vydaj.kategorie !== filtr.kategorie) return false;
        if (filtr.stav === "nezaplacene" && vydaj.zaplaceno) return false;
        if (filtr.stav === "zaplacene" && !vydaj.zaplaceno) return false;
        if (hledat) {
          const kupa = util.bezDiakritiky(
            [vydaj.cisloDokladu, vydaj.dodavatel && vydaj.dodavatel.jmeno, vydaj.popis]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
          );
          if (!kupa.includes(hledat)) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.datumVystaveni).localeCompare(String(a.datumVystaveni)));
  }

  function vykresliSeznam() {
    const cil = ui.$("#seznam");
    if (!cil) return;
    const seznam = vyfiltrovane();
    const plateceDph = Fx.stav.dej().nastaveni.firma.plateceDph;

    if (!seznam.length) {
      cil.innerHTML = ui.prazdno(
        "Žádné výdaje",
        "Zapisujte sem přijaté faktury, paragony i platby pojištění.",
        `<button class="hlavni" data-akce="novy">Nový výdaj</button>`
      );
      ui.naKlik(cil, "[data-akce='novy']", () => upravVydaj(null));
      return;
    }

    let celkem = 0;
    let celkemOdpocet = 0;
    let celkemNaklad = 0;

    const radky = seznam
      .map((vydaj) => {
        const rozpis = Fx.dph.rozpisVydaje(vydaj);
        const kategorie = Fx.denik.kategorieVydaje(vydaj.kategorie);
        celkem += rozpis.celkem;
        celkemOdpocet += rozpis.odpocetCelkem;
        if (vydaj.danovyVydaj !== false && kategorie.danovy !== false) celkemNaklad += rozpis.danovyNaklad;

        return `<tr class="klikaci" data-uprav="${util.esc(vydaj.id)}">
          <td class="hlavni-sloupec">${util.esc(vydaj.cisloDokladu || "—")}
            <div class="mala slaby">${util.esc(vydaj.popis || "")}</div>
          </td>
          <td>${util.esc((vydaj.dodavatel && vydaj.dodavatel.jmeno) || "—")}</td>
          <td class="mala">${util.esc(kategorie.nazev)}</td>
          <td class="nowrap">${util.datumCz(vydaj.datumVystaveni)}</td>
          <td>${
            vydaj.zaplaceno
              ? ui.odznak("Zaplaceno", "zelena")
              : ui.odznak("Nezaplaceno", vydaj.datumSplatnosti && util.dnuOd(vydaj.datumSplatnosti) > 0 ? "cervena" : "zluta")
          }</td>
          ${
            plateceDph
              ? `<td class="cislo">${util.formatCislo(rozpis.zakladCelkem)}</td>
                 <td class="cislo">${util.formatCislo(rozpis.odpocetCelkem)}</td>`
              : ""
          }
          <td class="cislo tucne">${util.formatCislo(rozpis.celkem)}</td>
          <td class="akce">
            ${
              !vydaj.zaplaceno
                ? `<button class="drobne" data-zaplatit="${util.esc(vydaj.id)}">Zaplaceno</button>`
                : ""
            }
            <button class="drobne nebezpecna" data-smaz="${util.esc(vydaj.id)}">Smazat</button>
          </td>
        </tr>`;
      })
      .join("");

    cil.innerHTML = `<table class="seznam">
      <thead><tr>
        <th>Doklad</th><th>Dodavatel</th><th>Kategorie</th><th>Vystaveno</th><th>Stav</th>
        ${plateceDph ? '<th class="cislo">Základ</th><th class="cislo">Odpočet DPH</th>' : ""}
        <th class="cislo">${plateceDph ? "Celkem" : "Částka"}</th><th></th>
      </tr></thead>
      <tbody>${radky}</tbody>
      <tfoot><tr>
        <td colspan="5">${seznam.length} ${util.sklonuj(
      seznam.length,
      "doklad",
      "doklady",
      "dokladů"
    )} · daňové výdaje ${util.kc(celkemNaklad, 0)}</td>
        ${
          plateceDph
            ? `<td class="cislo"></td><td class="cislo">${util.formatCislo(celkemOdpocet)}</td>`
            : ""
        }
        <td class="cislo">${util.formatCislo(celkem)}</td>
        <td></td>
      </tr></tfoot>
    </table>`;
  }

  /* ---------------- formulář výdaje ---------------- */

  function radekSazbyHtml(radek, index) {
    const sazby = Fx.model.SAZBY_DPH.map((s) => ({ hodnota: s.hodnota, nazev: s.hodnota + " %" }));
    return `<tr data-sazba-radek="${index}">
      <td style="width:110px"><select data-sazba="sazba">${ui.moznosti(
        sazby,
        radek.sazba
      )}</select></td>
      <td><input type="number" step="0.01" data-sazba="zaklad" value="${util.cislo(
        radek.zaklad
      )}"></td>
      <td><input type="number" step="0.01" data-sazba="dph" value="${util.cislo(radek.dph)}"></td>
      <td style="width:120px"><input type="number" step="0.01" data-sazba="celkem" value="${util.zaokrouhli(
        util.cislo(radek.zaklad) + util.cislo(radek.dph),
        2
      )}"></td>
      <td style="width:34px"><button type="button" class="hole" data-smaz-sazbu="${index}">✕</button></td>
    </tr>`;
  }

  async function upravVydaj(id) {
    const puvodni = id ? Fx.stav.vydaj(id) : null;
    const vydaj = puvodni ? util.kopie(puvodni) : Fx.model.novyVydaj();
    const data = Fx.stav.dej();
    const plateceDph = data.nastaveni.firma.plateceDph;

    const telo = `
      <div class="mrizka">
        <div class="pole"><label>Typ dokladu</label>
          <select id="v-typ">${ui.moznosti(
            [
              { hodnota: "faktura", nazev: "Přijatá faktura" },
              { hodnota: "paragon", nazev: "Paragon / účtenka" },
              { hodnota: "interni", nazev: "Interní doklad" },
            ],
            vydaj.typ
          )}</select></div>
        <div class="pole"><label>Číslo dokladu</label>
          <input type="text" id="v-cislo" value="${util.esc(vydaj.cisloDokladu)}"></div>
        <div class="pole"><label>Kategorie</label>
          <select id="v-kategorie">${ui.moznosti(
            Fx.model
              .nabizeneKategorie([vydaj.kategorie])
              .map((k) => ({ hodnota: k.id, nazev: k.nazev })),
            vydaj.kategorie
          )}</select></div>
      </div>

      <div class="podnadpis">Dodavatel</div>
      <div class="mrizka">
        <div class="pole" style="grid-column:1/-1"><label>Název</label>
          <input type="text" id="v-dodavatel" value="${util.esc(vydaj.dodavatel.jmeno)}"></div>
        <div class="pole"><label>IČO</label>
          <div style="display:flex;gap:6px">
            <input type="text" id="v-ico" value="${util.esc(vydaj.dodavatel.ico)}">
            <button type="button" id="v-ares">ARES</button>
          </div></div>
        <div class="pole"><label>DIČ</label>
          <input type="text" id="v-dic" value="${util.esc(vydaj.dodavatel.dic)}"></div>
      </div>

      <div class="podnadpis">Popis a datumy</div>
      <div class="pole"><label>Popis výdaje</label>
        <input type="text" id="v-popis" value="${util.esc(vydaj.popis)}"></div>
      <div class="mrizka uzka">
        <div class="pole"><label>Vystaveno</label>
          <input type="date" id="v-vystaveno" value="${util.esc(vydaj.datumVystaveni)}"></div>
        <div class="pole"><label>DUZP</label>
          <input type="date" id="v-duzp" value="${util.esc(vydaj.duzp)}"></div>
        <div class="pole"><label>Splatnost</label>
          <input type="date" id="v-splatnost" value="${util.esc(vydaj.datumSplatnosti)}"></div>
        <div class="pole"><label>Datum úhrady</label>
          <input type="date" id="v-uhrada" value="${util.esc(vydaj.datumUhrady || "")}"></div>
      </div>
      <label class="zaskrtavaci" style="margin-top:8px">
        <input type="checkbox" id="v-zaplaceno" ${vydaj.zaplaceno ? "checked" : ""}>
        Doklad je zaplacený (teprve pak vstupuje do peněžního deníku)
      </label>

      <div class="podnadpis">Částka${plateceDph ? " a DPH" : ""}</div>
      ${
        plateceDph
          ? `<div class="mrizka" style="margin-bottom:10px">
               <div class="pole"><label>Režim</label>
                 <select id="v-rezim">${ui.moznosti(
                   [
                     { hodnota: "bezny", nazev: "Běžný režim" },
                     { hodnota: "prenesena", nazev: "Přenesená daňová povinnost" },
                     { hodnota: "bezDph", nazev: "Bez nároku na odpočet" },
                   ],
                   vydaj.rezim
                 )}</select></div>
               <div class="pole"><label>Poměr odpočtu (%)</label>
                 <input type="number" id="v-pomer" value="${util.cislo(vydaj.pomerOdpoctu, 100)}">
                 <div class="napoveda">100 % u čistě firemního výdaje</div></div>
             </div>`
          : ""
      }
      ${
        plateceDph
          ? `<div class="tabulka-x">
               <table class="polozky" id="v-sazby">
                 <thead><tr>
                   <th>Sazba</th><th>Základ</th><th>DPH</th><th>Celkem s DPH</th><th></th>
                 </tr></thead>
                 <tbody>${vydaj.zaklady.map(radekSazbyHtml).join("")}</tbody>
               </table>
             </div>
             <div class="pruh-tlacitek" style="margin-top:8px">
               <button type="button" id="v-pridat-sazbu">Přidat sazbu</button>
               <span class="napoveda">Stačí vyplnit jedno pole — zbývající se dopočítají.</span>
             </div>`
          : `<div class="mrizka">
               <div class="pole"><label>Zaplacená částka</label>
                 <input type="number" step="0.01" id="v-castka" value="${util.zaokrouhli(
                   (vydaj.zaklady || []).reduce(
                     (soucet, r) => soucet + util.cislo(r.zaklad) + util.cislo(r.dph),
                     0
                   ),
                   2
                 )}"></div>
             </div>`
      }

      <label class="zaskrtavaci" style="margin-top:12px">
        <input type="checkbox" id="v-danovy" ${vydaj.danovyVydaj !== false ? "checked" : ""}>
        Daňově uznatelný výdaj (snižuje základ daně z příjmů)
      </label>

      <div class="pole" style="margin-top:12px"><label>Poznámka</label>
        <textarea id="v-poznamka">${util.esc(vydaj.poznamka || "")}</textarea></div>`;

    const vysledek = await ui.dialog({
      nadpis: puvodni ? "Úprava výdaje" : "Nový výdaj",
      sirka: "760px",
      telo,
      tlacitka: [
        { text: "Zrušit", hodnota: null },
        { text: "Uložit", hodnota: true, hlavni: true },
      ],
      poVykresleni: (dialog) => navazUdalostiFormulare(dialog),
      predUzavrenim: (dialog) => sesbirejFormular(dialog, vydaj, plateceDph),
    });

    if (!vysledek) return;
    Fx.stav.ulozVydaj(vysledek);
    vykresliSeznam();
    ui.hlaska("Výdaj uložen.", "uspech");
  }

  function navazUdalostiFormulare(dialog) {
    const tabulka = ui.$("#v-sazby", dialog);
    // Neplátce zadává jen jednu částku, rozpis sazeb ve formuláři není.
    if (tabulka) navazRozpisSazeb(dialog, tabulka);
    navazSpolecneUdalosti(dialog);
  }

  function navazRozpisSazeb(dialog, tabulka) {
    /* Dopočet mezi základem, daní a celkovou částkou. Uživatel opisuje
       z dokladu to, co tam vidí — často jen celkovou částku. */
    const prepocitejRadek = (radek, zdroj) => {
      const sazba = util.cislo(radek.querySelector("[data-sazba='sazba']").value);
      const poleZaklad = radek.querySelector("[data-sazba='zaklad']");
      const poleDph = radek.querySelector("[data-sazba='dph']");
      const poleCelkem = radek.querySelector("[data-sazba='celkem']");

      if (zdroj === "celkem") {
        const celkem = util.cislo(poleCelkem.value);
        const zaklad = util.zaokrouhli(celkem / (1 + sazba / 100), 2);
        poleZaklad.value = zaklad;
        poleDph.value = util.zaokrouhli(celkem - zaklad, 2);
      } else if (zdroj === "dph") {
        poleCelkem.value = util.zaokrouhli(
          util.cislo(poleZaklad.value) + util.cislo(poleDph.value),
          2
        );
      } else {
        const zaklad = util.cislo(poleZaklad.value);
        const dph = util.zaokrouhli((zaklad * sazba) / 100, 2);
        poleDph.value = dph;
        poleCelkem.value = util.zaokrouhli(zaklad + dph, 2);
      }
    };

    ui.naVstup(tabulka, "[data-sazba]", (u, pole) => {
      prepocitejRadek(pole.closest("tr"), pole.dataset.sazba);
    });
    ui.naZmenu(tabulka, "[data-sazba='sazba']", (u, pole) => {
      prepocitejRadek(pole.closest("tr"), "zaklad");
    });

    ui.$("#v-pridat-sazbu", dialog).addEventListener("click", () => {
      const telo = tabulka.querySelector("tbody");
      const index = telo.children.length;
      telo.insertAdjacentHTML("beforeend", radekSazbyHtml({ sazba: 12, zaklad: 0, dph: 0 }, index));
    });

    ui.naKlik(tabulka, "[data-smaz-sazbu]", (u, tlacitko) => {
      const telo = tabulka.querySelector("tbody");
      if (telo.children.length <= 1) return;
      tlacitko.closest("tr").remove();
    });
  }

  function navazSpolecneUdalosti(dialog) {
    // Zaškrtnutí úhrady doplní dnešní datum, když uživatel žádné nezadal.
    const poleZaplaceno = ui.$("#v-zaplaceno", dialog);
    poleZaplaceno.addEventListener("change", () => {
      const poleUhrady = ui.$("#v-uhrada", dialog);
      if (poleZaplaceno.checked && !poleUhrady.value) poleUhrady.value = util.dnesISO();
    });

    ui.$("#v-ares", dialog).addEventListener("click", async () => {
      const ico = ui.$("#v-ico", dialog).value;
      if (!ico) return ui.hlaska("Vyplňte IČO dodavatele.", "chyba");
      ui.hlaska("Načítám z ARESu…");
      const odpoved = await root.api.ares(ico);
      if (!odpoved.ok) return ui.hlaska(odpoved.chyba, "chyba");
      ui.$("#v-dodavatel", dialog).value = odpoved.firma.jmeno;
      ui.$("#v-dic", dialog).value = odpoved.firma.dic;
      ui.hlaska("Údaje doplněny.", "uspech");
    });
  }

  function sesbirejFormular(dialog, vydaj, plateceDph) {
    /* Neplátce nerozepisuje sazby — jeho částka se uloží jako jediný řádek
       s nulovou daní, aby s ní zbytek aplikace uměl počítat stejně. */
    const zaklady = plateceDph
      ? ui
          .$$("#v-sazby tbody tr", dialog)
          .map((radek) => ({
            sazba: util.cislo(radek.querySelector("[data-sazba='sazba']").value),
            zaklad: util.cislo(radek.querySelector("[data-sazba='zaklad']").value),
            dph: util.cislo(radek.querySelector("[data-sazba='dph']").value),
          }))
          .filter((r) => r.zaklad !== 0 || r.dph !== 0)
      : [{ sazba: 0, zaklad: util.cislo(ui.$("#v-castka", dialog).value), dph: 0 }].filter(
          (r) => r.zaklad !== 0
        );

    if (!zaklady.length) {
      ui.hlaska("Vyplňte částku výdaje.", "chyba");
      return false;
    }

    const zaplaceno = ui.$("#v-zaplaceno", dialog).checked;
    const datumUhrady = ui.$("#v-uhrada", dialog).value;
    if (zaplaceno && !datumUhrady) {
      ui.hlaska("U zaplaceného dokladu vyplňte datum úhrady.", "chyba");
      return false;
    }

    return Object.assign(vydaj, {
      typ: ui.$("#v-typ", dialog).value,
      cisloDokladu: ui.$("#v-cislo", dialog).value.trim(),
      kategorie: ui.$("#v-kategorie", dialog).value,
      dodavatel: {
        jmeno: ui.$("#v-dodavatel", dialog).value.trim(),
        ico: ui.$("#v-ico", dialog).value.trim(),
        dic: Fx.validace.normalizujDic(ui.$("#v-dic", dialog).value),
      },
      popis: ui.$("#v-popis", dialog).value.trim(),
      datumVystaveni: ui.$("#v-vystaveno", dialog).value,
      duzp: ui.$("#v-duzp", dialog).value,
      datumSplatnosti: ui.$("#v-splatnost", dialog).value,
      datumUhrady,
      zaplaceno,
      rezim: plateceDph ? ui.$("#v-rezim", dialog).value : "bezDph",
      pomerOdpoctu: plateceDph ? util.cislo(ui.$("#v-pomer", dialog).value, 100) : 0,
      odpocetDph: plateceDph && ui.$("#v-rezim", dialog).value !== "bezDph",
      danovyVydaj: ui.$("#v-danovy", dialog).checked,
      zaklady,
      poznamka: ui.$("#v-poznamka", dialog).value,
    });
  }

  /* ---------------- akce ---------------- */

  async function oznacZaplaceny(id) {
    const vydaj = Fx.stav.vydaj(id);
    if (!vydaj) return;
    vydaj.zaplaceno = true;
    if (!vydaj.datumUhrady) vydaj.datumUhrady = util.dnesISO();
    Fx.stav.ulozVydaj(vydaj);
    vykresliSeznam();
    ui.hlaska("Označeno jako zaplacené.", "uspech");
  }

  async function smazVydaj(id) {
    const vydaj = Fx.stav.vydaj(id);
    if (!vydaj) return;
    const potvrzeno = await ui.potvrd(`Smazat výdaj ${vydaj.cisloDokladu || vydaj.popis || ""}?`, {
      nadpis: "Smazat výdaj",
      detail: "Doklad zmizí z evidence i z podkladů pro DPH. Akce je nevratná.",
      potvrzeni: "Smazat",
      nebezpecne: true,
    });
    if (!potvrzeno) return;
    Fx.stav.smazVydaj(id);
    vykresliSeznam();
  }

  async function exportCsv() {
    const seznam = vyfiltrovane();
    const hlavicka = [
      "Doklad",
      "Dodavatel",
      "IČO",
      "DIČ",
      "Kategorie",
      "Popis",
      "Vystaveno",
      "DUZP",
      "Uhrazeno",
      "Základ",
      "DPH",
      "Odpočet DPH",
      "Celkem",
      "Daňový výdaj",
    ];
    const radky = seznam.map((vydaj) => {
      const rozpis = Fx.dph.rozpisVydaje(vydaj);
      const kategorie = Fx.denik.kategorieVydaje(vydaj.kategorie);
      const danovy = vydaj.danovyVydaj !== false && kategorie.danovy !== false;
      return [
        vydaj.cisloDokladu,
        vydaj.dodavatel.jmeno,
        vydaj.dodavatel.ico,
        vydaj.dodavatel.dic,
        kategorie.nazev,
        vydaj.popis,
        util.datumCz(vydaj.datumVystaveni),
        util.datumCz(vydaj.duzp),
        vydaj.zaplaceno ? util.datumCz(vydaj.datumUhrady) : "",
        rozpis.zakladCelkem,
        rozpis.dphCelkem,
        rozpis.odpocetCelkem,
        rozpis.celkem,
        danovy ? rozpis.danovyNaklad : 0,
      ];
    });
    await ui.ulozCsv(Fx.csv.sestav(hlavicka, radky), "vydaje-" + util.dnesISO());
  }

  pohledy.vydaje = { vykresli };
})(window);
