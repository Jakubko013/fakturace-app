/* Editor vydaného dokladu.

   Doklad se ukládá průběžně. Aby psaní v poli nepřerušovalo překreslení,
   přepočítávají se při psaní jen součty — celá obrazovka se staví znovu
   až při změně struktury (přidání položky, výměna odběratele). */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  let doklad = null;
  let kontejnerPohledu = null;

  function vykresli(kontejner, parametr) {
    kontejnerPohledu = kontejner;
    const data = Fx.stav.dej();

    if (parametr && parametr.startsWith("nova")) {
      const typ = parametr.split("/")[1] || "faktura";
      doklad = Fx.model.novaFaktura(data, typ);
      Fx.stav.ulozFakturu(doklad);
      // Adresu přepíšeme, aby obnovení stránky neotevřelo další nový doklad.
      root.location.hash = "#faktura/" + doklad.id;
      return;
    }

    doklad = Fx.stav.faktura(parametr);
    if (!doklad) {
      kontejner.innerHTML = ui.prazdno("Doklad nenalezen", "Možná byl smazán.");
      Fx.app.zahlavi({ nadpis: "Doklad", podnadpis: "" });
      return;
    }

    postavStranku();
  }

  function postavStranku() {
    const data = Fx.stav.dej();
    const stav = Fx.stav.stav(doklad);
    const nazevTypu = Fx.model.NAZVY_TYPU_KRATCE[doklad.typ] || "Faktura";

    Fx.app.zahlavi({
      nadpis: `${nazevTypu} ${doklad.cislo || "(koncept)"}`,
      podnadpis: `${ui.odznakStavu(stav)}`,
      akce: `
        ${
          doklad.stav === "koncept"
            ? `<button class="hlavni" data-akce="vystavit">Vystavit doklad</button>`
            : `<button data-akce="uhrada">Zaznamenat úhradu</button>`
        }
        <button data-akce="pdf">Uložit PDF</button>
        <button data-akce="tisk">Tisk</button>
        <button data-akce="vice">Další…</button>`,
      podnadpisJeHtml: true,
    });

    kontejnerPohledu.innerHTML = `
      <div class="panel">
        <h2>Odběratel</h2>
        <div class="telo">${odberatelHtml(data)}</div>
      </div>

      <div class="panel">
        <h2>Údaje dokladu</h2>
        <div class="telo">${udajeHtml(data)}</div>
      </div>

      <div class="panel">
        <h2>Položky
          ${
            data.nastaveni.firma.plateceDph
              ? `<span class="vpravo">
                   <label class="zaskrtavaci">
                     <input type="checkbox" data-prepinac="cenyVcetneDph" ${
                       doklad.cenyVcetneDph ? "checked" : ""
                     }>
                     Ceny zadávám včetně DPH
                   </label>
                 </span>`
              : ""
          }
        </h2>
        <div class="telo">
          ${polozkyHtml(data)}
          <div class="pruh-tlacitek" style="margin-top:12px">
            <button data-akce="pridat-polozku">Přidat položku</button>
            <button data-akce="z-ceniku">Vložit z ceníku</button>
            ${
              doklad.typ !== "zaloha"
                ? `<button data-akce="odpocet-zalohy">Odečíst zálohu</button>`
                : ""
            }
          </div>
          <div class="rozestup"></div>
          <div id="souhrn"></div>
        </div>
      </div>

      <div class="panel">
        <h2>Text a poznámky</h2>
        <div class="telo">
          <div class="pole">
            <label>Text nad položkami</label>
            <input type="text" data-pole="textPredPolozkami" value="${util.esc(
              doklad.textPredPolozkami || ""
            )}">
          </div>
          <div class="mrizka">
            <div class="pole">
              <label>Číslo objednávky</label>
              <input type="text" data-pole="objednavka" value="${util.esc(doklad.objednavka || "")}">
            </div>
            ${
              doklad.typ === "dobropis"
                ? `<div class="pole">
                     <label>Opravovaný doklad</label>
                     <input type="text" data-pole="opravovanyDoklad" value="${util.esc(
                       doklad.opravovanyDoklad || ""
                     )}" placeholder="číslo původní faktury">
                   </div>`
                : ""
            }
          </div>
          <div class="pole">
            <label>Poznámka na dokladu</label>
            <textarea data-pole="poznamka">${util.esc(doklad.poznamka || "")}</textarea>
          </div>
        </div>
      </div>

      ${uhradyHtml()}
    `;

    prepocti();
    navazUdalosti();
  }

  /* ---------------- části formuláře ---------------- */

  function odberatelHtml(data) {
    const odberatel = doklad.odberatel || {};
    const klienti = [
      { hodnota: "", nazev: "— vyplnit ručně —" },
      ...data.klienti.map((k) => ({ hodnota: k.id, nazev: k.jmeno })),
    ];

    return `
      <div class="mrizka">
        <div class="pole" style="grid-column:1/-1">
          <label>Vybrat z adresáře</label>
          <div style="display:flex;gap:8px">
            <select data-pole="klientId" style="flex:1">${ui.moznosti(klienti, doklad.klientId)}</select>
            <button data-akce="ulozit-klienta" title="Uložit vyplněné údaje do adresáře">Uložit do adresáře</button>
          </div>
        </div>
      </div>
      <div class="mrizka">
        <div class="pole" style="grid-column:1/-1">
          <label>Jméno nebo název firmy</label>
          <input type="text" data-odberatel="jmeno" value="${util.esc(odberatel.jmeno || "")}">
        </div>
        <div class="pole">
          <label>IČO</label>
          <div style="display:flex;gap:6px">
            <input type="text" data-odberatel="ico" value="${util.esc(odberatel.ico || "")}">
            <button data-akce="ares" title="Načíst údaje z registru ARES">ARES</button>
          </div>
        </div>
        <div class="pole">
          <label>DIČ</label>
          <input type="text" data-odberatel="dic" value="${util.esc(odberatel.dic || "")}">
        </div>
        <div class="pole">
          <label>Ulice a číslo</label>
          <input type="text" data-odberatel="ulice" value="${util.esc(odberatel.ulice || "")}">
        </div>
        <div class="pole">
          <label>PSČ</label>
          <input type="text" data-odberatel="psc" value="${util.esc(odberatel.psc || "")}">
        </div>
        <div class="pole">
          <label>Město</label>
          <input type="text" data-odberatel="mesto" value="${util.esc(odberatel.mesto || "")}">
        </div>
        <div class="pole">
          <label>E-mail</label>
          <input type="text" data-odberatel="email" value="${util.esc(odberatel.email || "")}">
        </div>
      </div>`;
  }

  function udajeHtml(data) {
    const plateceDph = data.nastaveni.firma.plateceDph;
    return `
      <div class="mrizka">
        <div class="pole">
          <label>Číslo dokladu</label>
          <input type="text" data-pole="cislo" value="${util.esc(doklad.cislo || "")}"
                 placeholder="${util.esc(Fx.model.dalsiCislo(data, doklad.typ, doklad.datumVystaveni))}">
        </div>
        <div class="pole">
          <label>Variabilní symbol</label>
          <input type="text" data-pole="vs" value="${util.esc(doklad.vs || "")}"
                 placeholder="${util.esc(Fx.validace.vsZCisla(doklad.cislo))}">
        </div>
        <div class="pole">
          <label>Datum vystavení</label>
          <input type="date" data-pole="datumVystaveni" value="${util.esc(doklad.datumVystaveni)}">
        </div>
        ${
          doklad.typ !== "zaloha" && plateceDph
            ? `<div class="pole">
                 <label>Datum zdanitelného plnění</label>
                 <input type="date" data-pole="duzp" value="${util.esc(doklad.duzp || "")}">
               </div>`
            : ""
        }
        <div class="pole">
          <label>Datum splatnosti</label>
          <input type="date" data-pole="datumSplatnosti" value="${util.esc(doklad.datumSplatnosti)}">
        </div>
        <div class="pole">
          <label>Forma úhrady</label>
          <select data-pole="formaUhrady">${ui.moznosti(
            Object.entries(Fx.model.FORMY_UHRADY).map(([hodnota, nazev]) => ({ hodnota, nazev })),
            doklad.formaUhrady
          )}</select>
        </div>
        ${
          plateceDph
            ? `<div class="pole">
                 <label>Režim DPH</label>
                 <select data-pole="rezim">${ui.moznosti(
                   Object.entries(Fx.vypocet.REZIMY).map(([hodnota, r]) => ({
                     hodnota,
                     nazev: r.nazev,
                   })),
                   doklad.rezim
                 )}</select>
               </div>`
            : ""
        }
        <div class="pole">
          <label>Sleva na celý doklad (%)</label>
          <input type="number" step="0.01" data-pole="slevaProc" value="${util.cislo(
            doklad.slevaProc
          )}">
        </div>
      </div>
      <div class="pruh-tlacitek" style="margin-top:6px">
        <label class="zaskrtavaci">
          <input type="checkbox" data-prepinac="zaokrouhlit" ${doklad.zaokrouhlit !== false ? "checked" : ""}>
          Zaokrouhlit celkovou částku na celé koruny
        </label>
      </div>`;
  }

  function polozkyHtml(data) {
    const plateceDph = data.nastaveni.firma.plateceDph && !Fx.vypocet.rezimBezDane(doklad, data.nastaveni);
    const sazby = Fx.model.SAZBY_DPH.map((s) => ({ hodnota: s.hodnota, nazev: s.hodnota + " %" }));

    const radky = (doklad.polozky || [])
      .map(
        (polozka) => `
        <tr data-radek="${util.esc(polozka.id)}">
          <td><input type="text" data-polozka="popis" value="${util.esc(polozka.popis || "")}"
                     list="ceniknapovda" placeholder="Popis položky"></td>
          <td style="width:90px"><input type="number" step="0.001" data-polozka="mnozstvi" value="${util.cislo(
            polozka.mnozstvi
          )}"></td>
          <td style="width:92px">
            <select data-polozka="jednotka">${ui.moznosti(Fx.model.JEDNOTKY, polozka.jednotka)}</select>
          </td>
          <td style="width:120px"><input type="number" step="0.01" data-polozka="cenaZaMj" value="${util.cislo(
            polozka.cenaZaMj
          )}"></td>
          <td style="width:80px"><input type="number" step="1" data-polozka="slevaProc" value="${util.cislo(
            polozka.slevaProc
          )}" title="Sleva na řádek v %"></td>
          ${
            plateceDph
              ? `<td style="width:90px"><select data-polozka="sazba">${ui.moznosti(
                  sazby,
                  polozka.sazba
                )}</select></td>`
              : ""
          }
          <td class="soucet" data-soucet="${util.esc(polozka.id)}"></td>
          <td style="width:34px"><button class="hole" data-smaz-polozku="${util.esc(
            polozka.id
          )}" title="Odebrat položku">✕</button></td>
        </tr>`
      )
      .join("");

    return `
      <datalist id="ceniknapovda">
        ${data.cenik.map((c) => `<option value="${util.esc(c.popis)}"></option>`).join("")}
      </datalist>
      <div class="tabulka-x">
        <table class="polozky">
          <thead><tr>
            <th>Popis</th><th>Množství</th><th>MJ</th><th>Cena za MJ</th><th>Sleva %</th>
            ${plateceDph ? "<th>DPH</th>" : ""}<th style="text-align:right">Celkem</th><th></th>
          </tr></thead>
          <tbody>${radky}</tbody>
        </table>
      </div>`;
  }

  function uhradyHtml() {
    if (!doklad.uhrady || !doklad.uhrady.length) return "";
    return `<div class="panel">
      <h2>Úhrady</h2>
      <div class="telo bezodsazeni">
        <table class="seznam">
          <thead><tr><th>Datum</th><th>Způsob</th><th class="cislo">Částka</th><th></th></tr></thead>
          <tbody>
            ${doklad.uhrady
              .map(
                (uhrada, index) => `<tr>
                  <td>${util.datumCz(uhrada.datum)}</td>
                  <td>${util.esc(Fx.model.FORMY_UHRADY[uhrada.zpusob] || uhrada.zpusob || "")}</td>
                  <td class="cislo tucne">${util.kc(uhrada.castka)}</td>
                  <td class="akce"><button class="drobne nebezpecna" data-smaz-uhradu="${index}">Odebrat</button></td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  /* ---------------- přepočet ---------------- */

  function prepocti() {
    const vypocet = Fx.stav.vypocet(doklad);
    const mena = (doklad.mena || "CZK") === "CZK" ? "Kč" : doklad.mena;

    // Součty řádků se párují podle pořadí — popisy se mohou opakovat.
    doklad.polozky.forEach((polozka, index) => {
      const bunka = kontejnerPohledu.querySelector(`[data-soucet="${CSS.escape(polozka.id)}"]`);
      if (bunka && vypocet.radky[index]) {
        bunka.textContent = util.formatCislo(vypocet.radky[index].zaklad);
      }
    });

    const radky = [];
    if (!vypocet.bezDane) {
      radky.push(["Základ daně", vypocet.zakladCelkem]);
      for (const sazba of vypocet.sazby) {
        if (!sazba.sazba) continue;
        radky.push([`DPH ${util.formatMnozstvi(sazba.sazba)} % ze ${util.formatCislo(sazba.zaklad)}`, sazba.dph]);
      }
    } else {
      radky.push(["Celkem", vypocet.zakladCelkem]);
    }
    for (const odpocet of vypocet.odpocty) {
      radky.push([
        (odpocet.popis || "Odpočet zálohy") + (odpocet.cislo ? ` ${odpocet.cislo}` : ""),
        -odpocet.castka,
      ]);
    }
    if (vypocet.zaokrouhleni) radky.push(["Zaokrouhlení", vypocet.zaokrouhleni]);

    const souhrn = ui.$("#souhrn", kontejnerPohledu);
    if (!souhrn) return;
    souhrn.innerHTML = `
      <div class="souhrn">
        ${radky
          .map(
            ([nazev, hodnota]) =>
              `<div class="radek"><span>${util.esc(nazev)}</span><span>${util.formatCislo(
                hodnota
              )} ${util.esc(mena)}</span></div>`
          )
          .join("")}
        ${
          vypocet.zaplaceno
            ? `<div class="radek tlumeny"><span>Uhrazeno</span><span>${util.formatCislo(
                vypocet.zaplaceno
              )} ${util.esc(mena)}</span></div>`
            : ""
        }
        <div class="radek celkem">
          <span>${vypocet.zaplaceno ? "Zbývá uhradit" : "Celkem k úhradě"}</span>
          <span>${util.formatCislo(
            vypocet.zaplaceno ? vypocet.zbyvaUhradit : vypocet.kUhrade
          )} ${util.esc(mena)}</span>
        </div>
      </div>`;
  }

  function ulozZmenu() {
    doklad.zmeneno = Date.now();
    Fx.stav.uloz();
  }

  /* ---------------- události ---------------- */

  function navazUdalosti() {
    const kontejner = kontejnerPohledu;

    // Prostá pole dokladu
    ui.naVstup(kontejner, "[data-pole]", (u, pole) => {
      nastavPole(pole.dataset.pole, pole.value);
      prepocti();
    });
    ui.naZmenu(kontejner, "[data-pole]", (u, pole) => {
      nastavPole(pole.dataset.pole, pole.value);
      if (pole.dataset.pole === "klientId") return postavStranku();
      if (pole.dataset.pole === "rezim") return postavStranku();
      prepocti();
    });

    // Adresa odběratele
    ui.naVstup(kontejner, "[data-odberatel]", (u, pole) => {
      doklad.odberatel[pole.dataset.odberatel] = pole.value;
      ulozZmenu();
    });

    // Přepínače
    ui.naZmenu(kontejner, "[data-prepinac]", (u, pole) => {
      doklad[pole.dataset.prepinac] = pole.checked;
      ulozZmenu();
      prepocti();
    });

    // Položky
    ui.naVstup(kontejner, "[data-polozka]", (u, pole) => zmenPolozku(pole));
    ui.naZmenu(kontejner, "[data-polozka]", (u, pole) => zmenPolozku(pole));

    ui.naKlik(kontejner, "[data-smaz-polozku]", (u, tlacitko) => {
      doklad.polozky = doklad.polozky.filter((p) => p.id !== tlacitko.dataset.smazPolozku);
      if (!doklad.polozky.length) doklad.polozky.push(Fx.model.novaPolozka(Fx.stav.dej().nastaveni));
      ulozZmenu();
      postavStranku();
    });

    ui.naKlik(kontejner, "[data-akce='pridat-polozku']", () => {
      doklad.polozky.push(Fx.model.novaPolozka(Fx.stav.dej().nastaveni));
      ulozZmenu();
      postavStranku();
      const posledni = [...kontejner.querySelectorAll("[data-polozka='popis']")].pop();
      if (posledni) posledni.focus();
    });

    ui.naKlik(kontejner, "[data-akce='z-ceniku']", vlozZCeniku);
    ui.naKlik(kontejner, "[data-akce='odpocet-zalohy']", odpocetZalohy);
    ui.naKlik(kontejner, "[data-akce='ares']", nactiZAres);
    ui.naKlik(kontejner, "[data-akce='ulozit-klienta']", ulozKlientaDoAdresare);

    ui.naKlik(kontejner, "[data-smaz-uhradu]", (u, tlacitko) => {
      doklad.uhrady.splice(Number(tlacitko.dataset.smazUhradu), 1);
      Fx.stav.ulozFakturu(doklad);
      postavStranku();
      Fx.app.obnovNabidku();
    });

    // Tlačítka v záhlaví stránky
    const zahlavi = ui.$("#akce-zahlavi");
    zahlavi.onclick = async (udalost) => {
      const tlacitko = udalost.target.closest("[data-akce]");
      if (!tlacitko) return;
      const akce = tlacitko.dataset.akce;
      if (akce === "vystavit") await vystav();
      else if (akce === "pdf") await Fx.doklad.ulozPdf(doklad, Fx.stav.dej());
      else if (akce === "tisk") await Fx.doklad.tisk(doklad, Fx.stav.dej());
      else if (akce === "uhrada") await zaznamenejUhradu();
      else if (akce === "vice") await dalsiAkce();
    };
  }

  function nastavPole(nazev, hodnota) {
    if (nazev === "slevaProc") {
      doklad.slevaProc = util.cislo(hodnota);
    } else if (nazev === "klientId") {
      doklad.klientId = hodnota;
      const klient = Fx.stav.klient(hodnota);
      if (klient) {
        doklad.odberatel = util.kopie(klient);
        if (klient.vychoziSplatnost) {
          doklad.datumSplatnosti = util.pridejDny(doklad.datumVystaveni, klient.vychoziSplatnost);
        }
      }
    } else if (nazev === "datumVystaveni") {
      const data = Fx.stav.dej();
      const puvodni = doklad.datumVystaveni;
      doklad.datumVystaveni = hodnota;
      // Splatnost i DUZP posuneme s datem vystavení, pokud je uživatel neměnil.
      if (doklad.duzp === puvodni) doklad.duzp = hodnota;
      const dni = util.cislo(data.nastaveni.faktura.splatnostDni, 14);
      if (doklad.datumSplatnosti === util.pridejDny(puvodni, dni)) {
        doklad.datumSplatnosti = util.pridejDny(hodnota, dni);
      }
    } else {
      doklad[nazev] = hodnota;
    }
    ulozZmenu();
  }

  function zmenPolozku(pole) {
    const radek = pole.closest("[data-radek]");
    if (!radek) return;
    const polozka = doklad.polozky.find((p) => p.id === radek.dataset.radek);
    if (!polozka) return;
    const nazev = pole.dataset.polozka;
    const ciselne = ["mnozstvi", "cenaZaMj", "slevaProc", "sazba"];
    polozka[nazev] = ciselne.includes(nazev) ? util.cislo(pole.value) : pole.value;

    // Doplnění ceny podle ceníku, když uživatel napsal známý popis.
    if (nazev === "popis") {
      const znama = Fx.stav
        .dej()
        .cenik.find((c) => c.popis.toLowerCase() === String(pole.value).trim().toLowerCase());
      if (znama && !util.cislo(polozka.cenaZaMj)) {
        polozka.cenaZaMj = znama.cenaZaMj;
        polozka.jednotka = znama.jednotka;
        polozka.sazba = znama.sazba;
        const poleCeny = radek.querySelector("[data-polozka='cenaZaMj']");
        if (poleCeny) poleCeny.value = znama.cenaZaMj;
      }
    }
    ulozZmenu();
    prepocti();
  }

  /* ---------------- akce nad dokladem ---------------- */

  async function vystav() {
    const data = Fx.stav.dej();
    const potize = zkontrolujDoklad(data);
    if (potize.length) {
      const pokracovat = await ui.dialog({
        nadpis: "Doklad není úplný",
        telo: `<div class="upozorneni"><ul>${potize
          .map((p) => `<li>${util.esc(p)}</li>`)
          .join("")}</ul></div>
          <div class="napoveda">Doklad můžete vystavit i tak, ale zkontrolujte si údaje.</div>`,
        tlacitka: [
          { text: "Vrátit se k úpravám", hodnota: null },
          { text: "Přesto vystavit", hodnota: true },
        ],
      });
      if (!pokracovat) return;
    }

    if (!doklad.cislo) doklad.cislo = Fx.model.dalsiCislo(data, doklad.typ, doklad.datumVystaveni);
    if (!doklad.vs) doklad.vs = Fx.validace.vsZCisla(doklad.cislo);
    doklad.stav = "vystavena";
    Fx.stav.zapamatujPolozky(doklad.polozky);
    Fx.stav.ulozFakturu(doklad);
    await Fx.stav.ulozHned();
    ui.hlaska(`Doklad ${doklad.cislo} vystaven.`, "uspech");
    postavStranku();
    Fx.app.obnovNabidku();
  }

  function zkontrolujDoklad(data) {
    const potize = [];
    if (!doklad.odberatel.jmeno) potize.push("Není vyplněný odběratel.");
    if (!doklad.polozky.some((p) => p.popis && util.cislo(p.cenaZaMj) !== 0))
      potize.push("Doklad nemá žádnou vyplněnou položku s cenou.");
    if (!doklad.datumSplatnosti) potize.push("Chybí datum splatnosti.");
    potize.push(...Fx.validace.zkontrolujFirmu(data.nastaveni.firma, data.nastaveni.banka));
    return potize;
  }

  async function zaznamenejUhradu() {
    const vypocet = Fx.stav.vypocet(doklad);
    const odpoved = await ui.dialog({
      nadpis: "Zaznamenat úhradu",
      telo: `<div class="mrizka">
        <div class="pole"><label>Datum úhrady</label>
          <input type="date" id="u-datum" value="${util.dnesISO()}"></div>
        <div class="pole"><label>Částka</label>
          <input type="number" step="0.01" id="u-castka" value="${vypocet.zbyvaUhradit}"></div>
        <div class="pole"><label>Způsob</label>
          <select id="u-zpusob">${ui.moznosti(
            Object.entries(Fx.model.FORMY_UHRADY).map(([hodnota, nazev]) => ({ hodnota, nazev })),
            doklad.formaUhrady
          )}</select></div>
      </div>`,
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
    if (!odpoved || !odpoved.castka) return;
    doklad.uhrady.push(odpoved);
    Fx.stav.ulozFakturu(doklad);
    postavStranku();
    Fx.app.obnovNabidku();
    ui.hlaska("Úhrada zaznamenána.", "uspech");
  }

  async function dalsiAkce() {
    const volba = await ui.dialog({
      nadpis: "Další akce",
      telo: `<div class="pruh-tlacitek" style="flex-direction:column;align-items:stretch;gap:8px">
        <button data-volba="kopie">Vytvořit kopii dokladu</button>
        ${
          doklad.typ === "faktura"
            ? `<button data-volba="dobropis">Vystavit dobropis k tomuto dokladu</button>`
            : ""
        }
        ${
          doklad.stav !== "koncept"
            ? `<button data-volba="storno">Stornovat doklad</button>`
            : `<button data-volba="cislo">Přidělit číslo bez vystavení</button>`
        }
        <button data-volba="smazat" class="nebezpecna">Smazat doklad</button>
      </div>`,
      tlacitka: [{ text: "Zavřít", hodnota: null }],
      poVykresleni: (dialog) => {
        ui.$$("[data-volba]", dialog).forEach((tlacitko) => {
          tlacitko.addEventListener("click", () => {
            dialog.dataset.volba = tlacitko.dataset.volba;
            dialog.querySelector("button[data-index]").click();
          });
        });
      },
      predUzavrenim: (dialog) => dialog.dataset.volba || null,
    });

    if (volba === "kopie") return kopiruj();
    if (volba === "dobropis") return vystavDobropis();
    if (volba === "storno") return stornuj();
    if (volba === "smazat") return smaz();
    if (volba === "cislo") {
      const data = Fx.stav.dej();
      doklad.cislo = Fx.model.dalsiCislo(data, doklad.typ, doklad.datumVystaveni);
      Fx.stav.ulozFakturu(doklad);
      postavStranku();
    }
  }

  function kopiruj() {
    const data = Fx.stav.dej();
    const kopie = util.kopie(doklad);
    kopie.id = util.id("f");
    kopie.cislo = "";
    kopie.vs = "";
    kopie.stav = "koncept";
    kopie.uhrady = [];
    kopie.upominky = [];
    kopie.datumVystaveni = util.dnesISO();
    kopie.duzp = util.dnesISO();
    kopie.datumSplatnosti = util.pridejDny(
      util.dnesISO(),
      util.cislo(data.nastaveni.faktura.splatnostDni, 14)
    );
    kopie.polozky = kopie.polozky.map((p) => Object.assign({}, p, { id: util.id("p") }));
    Fx.stav.ulozFakturu(kopie);
    Fx.app.prejdi("faktura/" + kopie.id);
    ui.hlaska("Vytvořena kopie.", "uspech");
  }

  function vystavDobropis() {
    const dobropis = util.kopie(doklad);
    dobropis.id = util.id("f");
    dobropis.typ = "dobropis";
    dobropis.cislo = "";
    dobropis.vs = "";
    dobropis.stav = "koncept";
    dobropis.uhrady = [];
    dobropis.odpocty = [];
    dobropis.opravovanyDoklad = doklad.cislo;
    dobropis.datumVystaveni = util.dnesISO();
    dobropis.duzp = util.dnesISO();
    dobropis.polozky = dobropis.polozky.map((p) => Object.assign({}, p, { id: util.id("p") }));
    Fx.stav.ulozFakturu(dobropis);
    Fx.app.prejdi("faktura/" + dobropis.id);
    ui.hlaska("Dobropis připraven jako koncept.", "uspech");
  }

  async function stornuj() {
    const potvrzeno = await ui.potvrd(
      `Opravdu stornovat doklad ${doklad.cislo}?`,
      {
        nadpis: "Storno dokladu",
        detail:
          "Doklad zůstane v seznamu s příznakem storno, ale nebude se počítat do DPH ani do deníku.",
        potvrzeni: "Stornovat",
        nebezpecne: true,
      }
    );
    if (!potvrzeno) return;
    doklad.stav = "stornovana";
    Fx.stav.ulozFakturu(doklad);
    postavStranku();
    Fx.app.obnovNabidku();
  }

  async function smaz() {
    const potvrzeno = await ui.potvrd(`Opravdu smazat doklad ${doklad.cislo || "(koncept)"}?`, {
      nadpis: "Smazat doklad",
      detail:
        "Tato akce je nevratná. U už vystavených dokladů je správnější použít storno, aby v číselné řadě nevznikla díra.",
      potvrzeni: "Smazat",
      nebezpecne: true,
    });
    if (!potvrzeno) return;
    Fx.stav.smazFakturu(doklad.id);
    await Fx.stav.ulozHned();
    Fx.app.prejdi("faktury");
    Fx.app.obnovNabidku();
  }

  /* ---------------- pomocné dialogy ---------------- */

  async function nactiZAres() {
    const ico = doklad.odberatel.ico;
    if (!ico) return ui.hlaska("Nejdřív vyplňte IČO odběratele.", "chyba");
    ui.hlaska("Načítám údaje z ARESu…");
    const odpoved = await root.api.ares(ico);
    if (!odpoved.ok) return ui.hlaska(odpoved.chyba, "chyba");
    Object.assign(doklad.odberatel, odpoved.firma);
    ulozZmenu();
    postavStranku();
    ui.hlaska("Údaje z ARESu doplněny.", "uspech");
  }

  function ulozKlientaDoAdresare() {
    if (!doklad.odberatel.jmeno) return ui.hlaska("Vyplňte alespoň jméno odběratele.", "chyba");
    const existujici = doklad.klientId ? Fx.stav.klient(doklad.klientId) : null;
    if (existujici) {
      Object.assign(existujici, doklad.odberatel, { id: existujici.id });
      Fx.stav.ulozKlienta(existujici);
      ui.hlaska("Údaje klienta v adresáři aktualizovány.", "uspech");
    } else {
      const novy = Fx.stav.pridejKlienta(Object.assign({}, doklad.odberatel, { id: undefined }));
      doklad.klientId = novy.id;
      Fx.stav.ulozFakturu(doklad);
      ui.hlaska("Klient uložen do adresáře.", "uspech");
    }
    postavStranku();
  }

  async function vlozZCeniku() {
    const data = Fx.stav.dej();
    if (!data.cenik.length) {
      return ui.hlaska("Ceník je zatím prázdný. Naplní se položkami z vystavených faktur.", "chyba");
    }
    const vybrano = await ui.dialog({
      nadpis: "Vložit z ceníku",
      telo: `<table class="seznam">
        <thead><tr><th>Popis</th><th class="cislo">Cena</th><th></th></tr></thead>
        <tbody>${data.cenik
          .slice(0, 60)
          .map(
            (c) => `<tr>
              <td>${util.esc(c.popis)}</td>
              <td class="cislo">${util.kc(c.cenaZaMj)}</td>
              <td class="akce"><button class="drobne" data-cenik="${util.esc(c.id)}">Vložit</button></td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`,
      sirka: "620px",
      tlacitka: [{ text: "Zavřít", hodnota: null }],
      poVykresleni: (dialog) => {
        ui.$$("[data-cenik]", dialog).forEach((tlacitko) =>
          tlacitko.addEventListener("click", () => {
            dialog.dataset.vybrano = tlacitko.dataset.cenik;
            dialog.querySelector("button[data-index]").click();
          })
        );
      },
      predUzavrenim: (dialog) => dialog.dataset.vybrano || null,
    });

    if (!vybrano) return;
    const polozkaCeniku = data.cenik.find((c) => c.id === vybrano);
    if (!polozkaCeniku) return;
    doklad.polozky.push(
      Fx.model.novaPolozka(data.nastaveni, {
        popis: polozkaCeniku.popis,
        jednotka: polozkaCeniku.jednotka,
        cenaZaMj: polozkaCeniku.cenaZaMj,
        sazba: polozkaCeniku.sazba,
      })
    );
    ulozZmenu();
    postavStranku();
  }

  async function odpocetZalohy() {
    const data = Fx.stav.dej();
    const zalohy = data.faktury.filter(
      (f) =>
        f.typ === "zaloha" &&
        f.stav !== "koncept" &&
        f.stav !== "stornovana" &&
        (!doklad.klientId || f.klientId === doklad.klientId)
    );

    const vybrano = await ui.dialog({
      nadpis: "Odečíst zaplacenou zálohu",
      telo: zalohy.length
        ? `<table class="seznam">
            <thead><tr><th>Číslo</th><th>Odběratel</th><th class="cislo">Uhrazeno</th><th></th></tr></thead>
            <tbody>${zalohy
              .map((z) => {
                const v = Fx.stav.vypocet(z);
                return `<tr>
                  <td>${util.esc(z.cislo)}</td>
                  <td>${util.esc(z.odberatel.jmeno)}</td>
                  <td class="cislo">${util.kc(v.zaplaceno || v.kUhrade)}</td>
                  <td class="akce"><button class="drobne" data-zaloha="${util.esc(
                    z.id
                  )}">Odečíst</button></td>
                </tr>`;
              })
              .join("")}</tbody>
          </table>
          <div class="napoveda" style="margin-top:10px">Nebo zadejte částku ručně:</div>
          <div class="mrizka" style="margin-top:6px">
            <div class="pole"><label>Popis</label><input type="text" id="z-popis" value="Uhrazená záloha"></div>
            <div class="pole"><label>Částka</label><input type="number" step="0.01" id="z-castka" value="0"></div>
          </div>`
        : `<div class="mrizka">
            <div class="pole"><label>Popis</label><input type="text" id="z-popis" value="Uhrazená záloha"></div>
            <div class="pole"><label>Číslo dokladu</label><input type="text" id="z-cislo"></div>
            <div class="pole"><label>Částka</label><input type="number" step="0.01" id="z-castka" value="0"></div>
          </div>`,
      sirka: "640px",
      tlacitka: [
        { text: "Zrušit", hodnota: null },
        { text: "Přidat ruční odpočet", hodnota: "rucne", hlavni: true },
      ],
      poVykresleni: (dialog) => {
        ui.$$("[data-zaloha]", dialog).forEach((tlacitko) =>
          tlacitko.addEventListener("click", () => {
            dialog.dataset.zaloha = tlacitko.dataset.zaloha;
            dialog.querySelector("button[data-index]").click();
          })
        );
      },
      predUzavrenim: (dialog, volba) => {
        if (dialog.dataset.zaloha) return { zalohaId: dialog.dataset.zaloha };
        if (volba.hodnota !== "rucne") return null;
        const poleCastka = ui.$("#z-castka", dialog);
        return {
          popis: ui.$("#z-popis", dialog).value,
          cislo: ui.$("#z-cislo", dialog) ? ui.$("#z-cislo", dialog).value : "",
          castka: util.cislo(poleCastka.value),
        };
      },
    });

    if (!vybrano) return;
    if (vybrano.zalohaId) {
      const zaloha = Fx.stav.faktura(vybrano.zalohaId);
      const vypocetZalohy = Fx.stav.vypocet(zaloha);
      doklad.odpocty.push({
        popis: "Odpočet zálohy",
        cislo: zaloha.cislo,
        castka: vypocetZalohy.zaplaceno || vypocetZalohy.kUhrade,
      });
    } else {
      if (!vybrano.castka) return;
      doklad.odpocty.push(vybrano);
    }
    ulozZmenu();
    postavStranku();
  }

  pohledy.faktura = { vykresli };
})(window);
