/* Adresář odběratelů. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  let hledane = "";

  function vykresli(kontejner) {
    Fx.app.zahlavi({
      nadpis: "Klienti",
      podnadpis: "Adresář odběratelů",
      akce: `<button class="hlavni" data-akce="novy">Nový klient</button>`,
    });

    kontejner.innerHTML = `<div class="panel">
      <div class="nastroje">
        <input type="text" id="hledani" placeholder="Hledat jméno, IČO, město…" value="${util.esc(
          hledane
        )}">
        <span class="oddelovac"></span>
        <button data-akce="export">Export do CSV</button>
      </div>
      <div class="telo bezodsazeni" id="seznam"></div>
    </div>`;

    vykresliSeznam();

    ui.naVstup(kontejner, "#hledani", (u, pole) => {
      hledane = pole.value;
      vykresliSeznam();
    });
    ui.naKlik(kontejner, "[data-akce='novy']", () => upravKlienta(null));
    ui.naKlik(kontejner, "[data-akce='export']", exportCsv);
    ui.naKlik(kontejner, "[data-uprav]", (u, prvek) => upravKlienta(prvek.dataset.uprav));
    ui.naKlik(kontejner, "[data-fakturuj]", (u, prvek) => {
      u.stopPropagation();
      novaFakturaProKlienta(prvek.dataset.fakturuj);
    });
    ui.naKlik(kontejner, "[data-smaz]", (u, prvek) => {
      u.stopPropagation();
      smazKlienta(prvek.dataset.smaz);
    });

    const zahlavi = ui.$("#akce-zahlavi");
    zahlavi.onclick = (udalost) => {
      if (udalost.target.closest("[data-akce='novy']")) upravKlienta(null);
    };
  }

  function vyfiltrovani() {
    const data = Fx.stav.dej();
    const hledat = util.bezDiakritiky(hledane.trim().toLowerCase());
    return data.klienti
      .filter((klient) => {
        if (!hledat) return true;
        const kupa = util.bezDiakritiky(
          [klient.jmeno, klient.ico, klient.dic, klient.mesto, klient.email]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        );
        return kupa.includes(hledat);
      })
      .sort((a, b) => String(a.jmeno).localeCompare(String(b.jmeno), "cs"));
  }

  function vykresliSeznam() {
    const cil = ui.$("#seznam");
    if (!cil) return;
    const seznam = vyfiltrovani();
    const data = Fx.stav.dej();

    if (!seznam.length) {
      cil.innerHTML = ui.prazdno(
        "Adresář je prázdný",
        "Klienti se sem přidají sami, když je uložíte při vystavování faktury.",
        `<button class="hlavni" data-akce="novy">Nový klient</button>`
      );
      return;
    }

    cil.innerHTML = `<table class="seznam">
      <thead><tr>
        <th>Jméno</th><th>IČO / DIČ</th><th>Sídlo</th><th>Kontakt</th>
        <th class="cislo">Vyfakturováno</th><th></th>
      </tr></thead>
      <tbody>
        ${seznam
          .map((klient) => {
            const faktury = data.faktury.filter(
              (f) => f.klientId === klient.id && f.stav !== "stornovana" && f.stav !== "koncept"
            );
            const celkem = faktury.reduce((s, f) => s + Fx.stav.vypocet(f).zakladCelkem, 0);
            const dluh = faktury.reduce((s, f) => s + Math.max(0, Fx.stav.vypocet(f).zbyvaUhradit), 0);
            return `<tr class="klikaci" data-uprav="${util.esc(klient.id)}">
              <td class="hlavni-sloupec">${util.esc(klient.jmeno)}</td>
              <td class="mala">${util.esc(klient.ico || "—")}${
              klient.dic ? `<div class="slaby">${util.esc(klient.dic)}</div>` : ""
            }</td>
              <td class="mala">${util.esc(
                [klient.ulice, klient.mesto].filter(Boolean).join(", ") || "—"
              )}</td>
              <td class="mala">${util.esc(klient.email || klient.tel || "—")}</td>
              <td class="cislo">${util.kc(celkem, 0)}
                ${dluh > 0 ? `<div class="mala cervene">dluží ${util.kc(dluh, 0)}</div>` : ""}
              </td>
              <td class="akce">
                <button class="drobne" data-fakturuj="${util.esc(klient.id)}">Fakturovat</button>
                <button class="drobne nebezpecna" data-smaz="${util.esc(klient.id)}">Smazat</button>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
  }

  /* ---------------- úpravy ---------------- */

  async function upravKlienta(id) {
    const puvodni = id ? Fx.stav.klient(id) : null;
    const klient = puvodni ? util.kopie(puvodni) : Fx.model.novyKlient();

    const vysledek = await ui.dialog({
      nadpis: puvodni ? "Úprava klienta" : "Nový klient",
      sirka: "620px",
      telo: `
        <div class="mrizka">
          <div class="pole" style="grid-column:1/-1">
            <label>Jméno nebo název firmy</label>
            <input type="text" id="k-jmeno" value="${util.esc(klient.jmeno)}">
          </div>
          <div class="pole">
            <label>IČO</label>
            <div style="display:flex;gap:6px">
              <input type="text" id="k-ico" value="${util.esc(klient.ico)}">
              <button id="k-ares" type="button">ARES</button>
            </div>
          </div>
          <div class="pole"><label>DIČ</label><input type="text" id="k-dic" value="${util.esc(
            klient.dic
          )}"></div>
          <div class="pole" style="grid-column:1/-1"><label>Ulice a číslo</label>
            <input type="text" id="k-ulice" value="${util.esc(klient.ulice)}"></div>
          <div class="pole"><label>PSČ</label><input type="text" id="k-psc" value="${util.esc(
            klient.psc
          )}"></div>
          <div class="pole"><label>Město</label><input type="text" id="k-mesto" value="${util.esc(
            klient.mesto
          )}"></div>
          <div class="pole"><label>Země</label><input type="text" id="k-zeme" value="${util.esc(
            klient.zeme
          )}"></div>
          <div class="pole"><label>E-mail</label><input type="text" id="k-email" value="${util.esc(
            klient.email
          )}"></div>
          <div class="pole"><label>Telefon</label><input type="text" id="k-tel" value="${util.esc(
            klient.tel
          )}"></div>
          <div class="pole"><label>Splatnost faktur (dní)</label>
            <input type="number" id="k-splatnost" value="${
              klient.vychoziSplatnost != null ? klient.vychoziSplatnost : ""
            }" placeholder="podle nastavení"></div>
        </div>
        <div class="pole"><label>Poznámka</label><textarea id="k-poznamka">${util.esc(
          klient.poznamka
        )}</textarea></div>`,
      tlacitka: [
        { text: "Zrušit", hodnota: null },
        { text: "Uložit", hodnota: true, hlavni: true },
      ],
      poVykresleni: (dialog) => {
        ui.$("#k-ares", dialog).addEventListener("click", async () => {
          const ico = ui.$("#k-ico", dialog).value;
          if (!ico) return ui.hlaska("Vyplňte IČO.", "chyba");
          ui.hlaska("Načítám z ARESu…");
          const odpoved = await root.api.ares(ico);
          if (!odpoved.ok) return ui.hlaska(odpoved.chyba, "chyba");
          ui.$("#k-jmeno", dialog).value = odpoved.firma.jmeno;
          ui.$("#k-dic", dialog).value = odpoved.firma.dic;
          ui.$("#k-ulice", dialog).value = odpoved.firma.ulice;
          ui.$("#k-psc", dialog).value = odpoved.firma.psc;
          ui.$("#k-mesto", dialog).value = odpoved.firma.mesto;
          ui.$("#k-zeme", dialog).value = odpoved.firma.zeme;
          ui.hlaska("Údaje doplněny.", "uspech");
        });
      },
      predUzavrenim: (dialog) => {
        const jmeno = ui.$("#k-jmeno", dialog).value.trim();
        if (!jmeno) {
          ui.hlaska("Vyplňte jméno klienta.", "chyba");
          return false;
        }
        const splatnost = ui.$("#k-splatnost", dialog).value;
        return Object.assign(klient, {
          jmeno,
          ico: ui.$("#k-ico", dialog).value.trim(),
          dic: Fx.validace.normalizujDic(ui.$("#k-dic", dialog).value),
          ulice: ui.$("#k-ulice", dialog).value.trim(),
          psc: ui.$("#k-psc", dialog).value.trim(),
          mesto: ui.$("#k-mesto", dialog).value.trim(),
          zeme: ui.$("#k-zeme", dialog).value.trim(),
          email: ui.$("#k-email", dialog).value.trim(),
          tel: ui.$("#k-tel", dialog).value.trim(),
          poznamka: ui.$("#k-poznamka", dialog).value,
          vychoziSplatnost: splatnost === "" ? null : util.cislo(splatnost),
        });
      },
    });

    if (!vysledek) return;
    if (vysledek.ico && !Fx.validace.platneIco(vysledek.ico)) {
      ui.hlaska("Pozor: IČO nemá platnou kontrolní číslici. Uložil jsem ho tak, jak je.", "chyba");
    }
    if (puvodni) Fx.stav.ulozKlienta(vysledek);
    else Fx.stav.pridejKlienta(vysledek);
    vykresliSeznam();
    ui.hlaska("Klient uložen.", "uspech");
  }

  async function smazKlienta(id) {
    const klient = Fx.stav.klient(id);
    if (!klient) return;
    const pocet = Fx.stav.pocetDokladuKlienta(id);
    const potvrzeno = await ui.potvrd(`Smazat klienta ${klient.jmeno}?`, {
      nadpis: "Smazat klienta",
      detail: pocet
        ? `Klient má ${pocet} ${util.sklonuj(
            pocet,
            "doklad",
            "doklady",
            "dokladů"
          )}. Doklady zůstanou zachované, jen ztratí odkaz do adresáře.`
        : "Klient nemá žádné doklady.",
      potvrzeni: "Smazat",
      nebezpecne: true,
    });
    if (!potvrzeno) return;
    Fx.stav.smazKlienta(id);
    vykresliSeznam();
  }

  function novaFakturaProKlienta(id) {
    const data = Fx.stav.dej();
    const klient = Fx.stav.klient(id);
    const faktura = Fx.model.novaFaktura(data, "faktura");
    faktura.klientId = id;
    faktura.odberatel = util.kopie(klient);
    if (klient.vychoziSplatnost) {
      faktura.datumSplatnosti = util.pridejDny(faktura.datumVystaveni, klient.vychoziSplatnost);
    }
    Fx.stav.ulozFakturu(faktura);
    Fx.app.prejdi("faktura/" + faktura.id);
  }

  async function exportCsv() {
    const seznam = vyfiltrovani();
    const hlavicka = ["Jméno", "IČO", "DIČ", "Ulice", "PSČ", "Město", "Země", "E-mail", "Telefon"];
    const radky = seznam.map((k) => [
      k.jmeno,
      k.ico,
      k.dic,
      k.ulice,
      k.psc,
      k.mesto,
      k.zeme,
      k.email,
      k.tel,
    ]);
    await ui.ulozCsv(Fx.csv.sestav(hlavicka, radky), "klienti-" + util.dnesISO());
  }

  pohledy.klienti = { vykresli };
})(window);
