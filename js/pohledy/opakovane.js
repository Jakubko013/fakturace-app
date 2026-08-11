/* Opakované faktury — šablony, ze kterých se v daný den vystaví doklad.

   Faktura se nikdy nevystaví sama: aplikace jen upozorní, že nastal čas,
   a vystavení potvrzuje uživatel. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  function vykresli(kontejner) {
    Fx.app.zahlavi({
      nadpis: "Opakované faktury",
      podnadpis: "Pravidelná fakturace podle šablon",
      akce: `<button class="hlavni" data-akce="nova">Nová šablona</button>`,
    });

    kontejner.innerHTML = `<div class="panel">
      <h2>Šablony</h2>
      <div class="telo bezodsazeni" id="seznam"></div>
    </div>`;

    vykresliSeznam();

    ui.naKlik(kontejner, "[data-uprav]", (u, prvek) => upravSablonu(prvek.dataset.uprav));
    ui.naKlik(kontejner, "[data-vystav]", (u, prvek) => {
      u.stopPropagation();
      vystavZeSablony(prvek.dataset.vystav);
    });
    ui.naKlik(kontejner, "[data-prepni]", (u, prvek) => {
      u.stopPropagation();
      prepniAktivni(prvek.dataset.prepni);
    });
    ui.naKlik(kontejner, "[data-smaz]", (u, prvek) => {
      u.stopPropagation();
      smazSablonu(prvek.dataset.smaz);
    });

    ui.$("#akce-zahlavi").onclick = (udalost) => {
      if (udalost.target.closest("[data-akce='nova']")) upravSablonu(null);
    };
  }

  function vykresliSeznam() {
    const cil = ui.$("#seznam");
    if (!cil) return;
    const data = Fx.stav.dej();

    if (!data.sablony.length) {
      cil.innerHTML = ui.prazdno(
        "Žádné opakované faktury",
        "Šablona se hodí na pravidelné měsíční fakturace — nastavíte ji jednou a pak jen potvrdíte vystavení.",
        `<button class="hlavni" data-akce="nova">Nová šablona</button>`
      );
      ui.naKlik(cil, "[data-akce='nova']", () => upravSablonu(null));
      return;
    }

    const dnes = util.dnesISO();
    cil.innerHTML = `<table class="seznam">
      <thead><tr>
        <th>Název</th><th>Odběratel</th><th>Interval</th><th>Další vystavení</th>
        <th class="cislo">Částka</th><th>Stav</th><th></th>
      </tr></thead>
      <tbody>
        ${data.sablony
          .map((sablona) => {
            const klient = Fx.stav.klient(sablona.klientId);
            const nahled = pripravFakturu(sablona, data);
            const vypocet = Fx.vypocet.vypocetDokladu(nahled, data.nastaveni);
            const cekaSe = sablona.aktivni && sablona.dalsiVystaveni <= dnes;
            return `<tr class="klikaci" data-uprav="${util.esc(sablona.id)}">
              <td class="hlavni-sloupec">${util.esc(sablona.nazev || "(bez názvu)")}</td>
              <td>${util.esc(klient ? klient.jmeno : "—")}</td>
              <td>${util.esc(Fx.model.INTERVALY[sablona.interval].nazev)}</td>
              <td class="nowrap">${util.datumCz(sablona.dalsiVystaveni)}
                ${cekaSe ? `<div class="mala cervene">čeká na vystavení</div>` : ""}
              </td>
              <td class="cislo tucne">${util.kc(vypocet.kUhrade)}</td>
              <td>${
                sablona.aktivni ? ui.odznak("Aktivní", "zelena") : ui.odznak("Pozastavená", "seda")
              }</td>
              <td class="akce">
                <button class="drobne${cekaSe ? " hlavni" : ""}" data-vystav="${util.esc(
              sablona.id
            )}">Vystavit</button>
                <button class="drobne" data-prepni="${util.esc(sablona.id)}">${
              sablona.aktivni ? "Pozastavit" : "Obnovit"
            }</button>
                <button class="drobne nebezpecna" data-smaz="${util.esc(sablona.id)}">Smazat</button>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
  }

  /** Ze šablony poskládá fakturu k dnešnímu dni (bez čísla, jako koncept). */
  function pripravFakturu(sablona, data) {
    const faktura = Fx.model.novaFaktura(data, "faktura");
    const predloha = sablona.predloha || {};
    faktura.klientId = sablona.klientId;
    const klient = Fx.stav.klient(sablona.klientId);
    if (klient) faktura.odberatel = util.kopie(klient);
    faktura.polozky = (predloha.polozky || []).map((p) =>
      Object.assign({}, p, { id: util.id("p") })
    );
    if (!faktura.polozky.length) faktura.polozky = [Fx.model.novaPolozka(data.nastaveni)];
    faktura.textPredPolozkami = predloha.textPredPolozkami || faktura.textPredPolozkami;
    faktura.poznamka = predloha.poznamka || "";
    faktura.rezim = predloha.rezim || faktura.rezim;
    faktura.cenyVcetneDph = !!predloha.cenyVcetneDph;
    faktura.sablonaId = sablona.id;
    if (predloha.splatnostDni) {
      faktura.datumSplatnosti = util.pridejDny(faktura.datumVystaveni, predloha.splatnostDni);
    }
    return faktura;
  }

  async function vystavZeSablony(id) {
    const data = Fx.stav.dej();
    const sablona = Fx.stav.sablona(id);
    if (!sablona) return;
    if (!sablona.klientId || !Fx.stav.klient(sablona.klientId)) {
      return ui.hlaska("Šablona nemá přiřazeného klienta z adresáře.", "chyba");
    }

    const faktura = pripravFakturu(sablona, data);
    faktura.cislo = Fx.model.dalsiCislo(data, "faktura", faktura.datumVystaveni);
    faktura.vs = Fx.validace.vsZCisla(faktura.cislo);
    faktura.stav = "vystavena";
    Fx.stav.ulozFakturu(faktura);

    // Posuneme termín dalšího vystavení na další období.
    const mesicu = Fx.model.INTERVALY[sablona.interval].mesicu;
    const zaklad = sablona.dalsiVystaveni || util.dnesISO();
    let dalsi = util.pridejMesice(zaklad, mesicu);
    // Když šablona dlouho stála, přeskočíme zmeškaná období až za dnešek.
    while (dalsi <= util.dnesISO()) dalsi = util.pridejMesice(dalsi, mesicu);
    sablona.dalsiVystaveni = dalsi;
    sablona.posledniVystaveni = util.dnesISO();
    Fx.stav.ulozSablonu(sablona);
    await Fx.stav.ulozHned();

    ui.hlaska(`Faktura ${faktura.cislo} vystavena.`, "uspech");
    Fx.app.obnovNabidku();
    Fx.app.prejdi("faktura/" + faktura.id);
  }

  function prepniAktivni(id) {
    const sablona = Fx.stav.sablona(id);
    if (!sablona) return;
    sablona.aktivni = !sablona.aktivni;
    Fx.stav.ulozSablonu(sablona);
    vykresliSeznam();
  }

  async function smazSablonu(id) {
    const sablona = Fx.stav.sablona(id);
    if (!sablona) return;
    const potvrzeno = await ui.potvrd(`Smazat šablonu ${sablona.nazev}?`, {
      nadpis: "Smazat šablonu",
      detail: "Už vystavené faktury zůstanou beze změny.",
      potvrzeni: "Smazat",
      nebezpecne: true,
    });
    if (!potvrzeno) return;
    Fx.stav.smazSablonu(id);
    vykresliSeznam();
    Fx.app.obnovNabidku();
  }

  /* ---------------- formulář šablony ---------------- */

  function polozkaHtml(polozka, index, plateceDph) {
    const sazby = Fx.model.SAZBY_DPH.map((s) => ({ hodnota: s.hodnota, nazev: s.hodnota + " %" }));
    return `<tr data-polozka-radek="${index}">
      <td><input type="text" data-p="popis" value="${util.esc(polozka.popis || "")}"></td>
      <td style="width:80px"><input type="number" step="0.001" data-p="mnozstvi" value="${util.cislo(
        polozka.mnozstvi,
        1
      )}"></td>
      <td style="width:88px"><select data-p="jednotka">${ui.moznosti(
        Fx.model.JEDNOTKY,
        polozka.jednotka
      )}</select></td>
      <td style="width:110px"><input type="number" step="0.01" data-p="cenaZaMj" value="${util.cislo(
        polozka.cenaZaMj
      )}"></td>
      ${
        plateceDph
          ? `<td style="width:88px"><select data-p="sazba">${ui.moznosti(
              sazby,
              polozka.sazba
            )}</select></td>`
          : ""
      }
      <td style="width:34px"><button type="button" class="hole" data-smaz-p="${index}">✕</button></td>
    </tr>`;
  }

  async function upravSablonu(id) {
    const data = Fx.stav.dej();
    const puvodni = id ? Fx.stav.sablona(id) : null;
    const sablona = puvodni ? util.kopie(puvodni) : Fx.model.novaSablona();
    const plateceDph = data.nastaveni.firma.plateceDph;
    const predloha = sablona.predloha || {
      polozky: [Fx.model.novaPolozka(data.nastaveni)],
      splatnostDni: data.nastaveni.faktura.splatnostDni,
      textPredPolozkami: data.nastaveni.faktura.textPredPolozkami,
      poznamka: "",
    };
    if (!predloha.polozky || !predloha.polozky.length) {
      predloha.polozky = [Fx.model.novaPolozka(data.nastaveni)];
    }

    const vysledek = await ui.dialog({
      nadpis: puvodni ? "Úprava šablony" : "Nová opakovaná faktura",
      sirka: "780px",
      telo: `
        <div class="mrizka">
          <div class="pole"><label>Název šablony</label>
            <input type="text" id="s-nazev" value="${util.esc(
              sablona.nazev
            )}" placeholder="např. Správa webu — Novák"></div>
          <div class="pole"><label>Odběratel</label>
            <select id="s-klient">${ui.moznosti(
              [
                { hodnota: "", nazev: "— vyberte klienta —" },
                ...data.klienti.map((k) => ({ hodnota: k.id, nazev: k.jmeno })),
              ],
              sablona.klientId
            )}</select>
            <div class="napoveda">Šablona pracuje jen s klientem z adresáře.</div></div>
        </div>
        <div class="mrizka uzka">
          <div class="pole"><label>Interval</label>
            <select id="s-interval">${ui.moznosti(
              Object.entries(Fx.model.INTERVALY).map(([hodnota, i]) => ({
                hodnota,
                nazev: i.nazev,
              })),
              sablona.interval
            )}</select></div>
          <div class="pole"><label>Další vystavení</label>
            <input type="date" id="s-dalsi" value="${util.esc(sablona.dalsiVystaveni)}"></div>
          <div class="pole"><label>Splatnost (dní)</label>
            <input type="number" id="s-splatnost" value="${util.cislo(
              predloha.splatnostDni,
              14
            )}"></div>
        </div>

        <div class="podnadpis">Položky faktury</div>
        <div class="tabulka-x">
          <table class="polozky" id="s-polozky">
            <thead><tr>
              <th>Popis</th><th>Množství</th><th>MJ</th><th>Cena za MJ</th>
              ${plateceDph ? "<th>DPH</th>" : ""}<th></th>
            </tr></thead>
            <tbody>${predloha.polozky
              .map((p, i) => polozkaHtml(p, i, plateceDph))
              .join("")}</tbody>
          </table>
        </div>
        <div class="pruh-tlacitek" style="margin-top:8px">
          <button type="button" id="s-pridat">Přidat položku</button>
        </div>

        <div class="pole" style="margin-top:14px"><label>Text nad položkami</label>
          <input type="text" id="s-text" value="${util.esc(predloha.textPredPolozkami || "")}"></div>
        <div class="pole"><label>Poznámka na faktuře</label>
          <textarea id="s-poznamka">${util.esc(predloha.poznamka || "")}</textarea></div>
        <label class="zaskrtavaci" style="margin-top:10px">
          <input type="checkbox" id="s-aktivni" ${sablona.aktivni ? "checked" : ""}>
          Šablona je aktivní
        </label>`,
      tlacitka: [
        { text: "Zrušit", hodnota: null },
        { text: "Uložit", hodnota: true, hlavni: true },
      ],
      poVykresleni: (dialog) => {
        const tabulka = ui.$("#s-polozky", dialog);
        ui.$("#s-pridat", dialog).addEventListener("click", () => {
          const telo = tabulka.querySelector("tbody");
          telo.insertAdjacentHTML(
            "beforeend",
            polozkaHtml(Fx.model.novaPolozka(data.nastaveni), telo.children.length, plateceDph)
          );
        });
        ui.naKlik(tabulka, "[data-smaz-p]", (u, tlacitko) => {
          const telo = tabulka.querySelector("tbody");
          if (telo.children.length <= 1) return;
          tlacitko.closest("tr").remove();
        });
      },
      predUzavrenim: (dialog) => {
        const nazev = ui.$("#s-nazev", dialog).value.trim();
        const klientId = ui.$("#s-klient", dialog).value;
        if (!nazev) {
          ui.hlaska("Vyplňte název šablony.", "chyba");
          return false;
        }
        if (!klientId) {
          ui.hlaska("Vyberte odběratele z adresáře.", "chyba");
          return false;
        }
        const polozky = ui.$$("#s-polozky tbody tr", dialog).map((radek) => ({
          id: util.id("p"),
          popis: radek.querySelector("[data-p='popis']").value,
          mnozstvi: util.cislo(radek.querySelector("[data-p='mnozstvi']").value, 1),
          jednotka: radek.querySelector("[data-p='jednotka']").value,
          cenaZaMj: util.cislo(radek.querySelector("[data-p='cenaZaMj']").value),
          slevaProc: 0,
          sazba: plateceDph
            ? util.cislo(radek.querySelector("[data-p='sazba']").value)
            : data.nastaveni.faktura.vychoziSazba,
        }));
        if (!polozky.some((p) => p.popis.trim())) {
          ui.hlaska("Vyplňte alespoň jednu položku.", "chyba");
          return false;
        }

        return Object.assign(sablona, {
          nazev,
          klientId,
          interval: ui.$("#s-interval", dialog).value,
          dalsiVystaveni: ui.$("#s-dalsi", dialog).value || util.dnesISO(),
          aktivni: ui.$("#s-aktivni", dialog).checked,
          predloha: {
            polozky,
            splatnostDni: util.cislo(ui.$("#s-splatnost", dialog).value, 14),
            textPredPolozkami: ui.$("#s-text", dialog).value,
            poznamka: ui.$("#s-poznamka", dialog).value,
            rezim: predloha.rezim || "bezny",
            cenyVcetneDph: !!predloha.cenyVcetneDph,
          },
        });
      },
    });

    if (!vysledek) return;
    Fx.stav.ulozSablonu(vysledek);
    vykresliSeznam();
    Fx.app.obnovNabidku();
    ui.hlaska("Šablona uložena.", "uspech");
  }

  pohledy.opakovane = { vykresli };
})(window);
