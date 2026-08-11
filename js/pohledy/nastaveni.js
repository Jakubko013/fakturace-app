/* Nastavení aplikace. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  const MAX_LOGO_BAJTU = 400 * 1024;

  function vykresli(kontejner) {
    const data = Fx.stav.dej();
    const n = data.nastaveni;

    Fx.app.zahlavi({
      nadpis: "Nastavení",
      podnadpis: "Údaje, které se tisknou na doklady",
    });

    kontejner.innerHTML = `
      <div class="panel">
        <h2>Moje firma</h2>
        <div class="telo">
          <div class="mrizka">
            <div class="pole" style="grid-column:1/-1"><label>Jméno nebo název firmy</label>
              <input type="text" data-n="firma.jmeno" value="${util.esc(n.firma.jmeno)}"></div>
            <div class="pole"><label>IČO</label>
              <div style="display:flex;gap:6px">
                <input type="text" data-n="firma.ico" value="${util.esc(n.firma.ico)}">
                <button data-akce="ares">ARES</button>
              </div></div>
            <div class="pole"><label>DIČ</label>
              <input type="text" data-n="firma.dic" value="${util.esc(n.firma.dic)}"></div>
            <div class="pole" style="grid-column:1/-1"><label>Ulice a číslo</label>
              <input type="text" data-n="firma.ulice" value="${util.esc(n.firma.ulice)}"></div>
            <div class="pole"><label>PSČ</label>
              <input type="text" data-n="firma.psc" value="${util.esc(n.firma.psc)}"></div>
            <div class="pole"><label>Město</label>
              <input type="text" data-n="firma.mesto" value="${util.esc(n.firma.mesto)}"></div>
            <div class="pole"><label>Země</label>
              <input type="text" data-n="firma.zeme" value="${util.esc(n.firma.zeme)}"></div>
            <div class="pole"><label>Telefon</label>
              <input type="text" data-n="firma.tel" value="${util.esc(n.firma.tel)}"></div>
            <div class="pole"><label>E-mail</label>
              <input type="text" data-n="firma.email" value="${util.esc(n.firma.email)}"></div>
            <div class="pole"><label>Web</label>
              <input type="text" data-n="firma.web" value="${util.esc(n.firma.web)}"></div>
          </div>
          <div class="pole" style="margin-top:14px"><label>Zápis v rejstříku</label>
            <input type="text" data-n="firma.rejstrik" value="${util.esc(n.firma.rejstrik)}">
            <div class="napoveda">Text v patičce dokladu, např. „Zapsáno v živnostenském rejstříku“.</div>
          </div>

          <div class="podnadpis">Logo na faktuře</div>
          <div class="pruh-tlacitek">
            ${
              n.firma.logo
                ? `<img src="${n.firma.logo}" alt="logo" style="max-height:60px;max-width:200px;border:1px solid var(--linka);border-radius:8px;padding:6px;background:#fff">
                   <button data-akce="smaz-logo">Odstranit logo</button>`
                : `<span class="slaby mala">Zatím není nahrané žádné logo — na dokladu se tiskne název firmy.</span>`
            }
            <input type="file" id="logo-soubor" accept="image/png,image/jpeg,image/svg+xml" style="display:none">
            <button data-akce="nahraj-logo">${n.firma.logo ? "Nahradit logo" : "Nahrát logo"}</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Bankovní spojení</h2>
        <div class="telo">
          <div class="mrizka">
            <div class="pole"><label>Číslo účtu</label>
              <input type="text" data-n="banka.ucet" value="${util.esc(
                n.banka.ucet
              )}" placeholder="19-2000145399/0800">
              <div class="napoveda" id="iban-nahled"></div></div>
            <div class="pole"><label>Banka</label>
              <input type="text" data-n="banka.banka" value="${util.esc(n.banka.banka)}"></div>
            <div class="pole"><label>IBAN</label>
              <input type="text" data-n="banka.iban" value="${util.esc(n.banka.iban)}"
                     placeholder="dopočítá se z čísla účtu"></div>
            <div class="pole"><label>SWIFT / BIC</label>
              <input type="text" data-n="banka.swift" value="${util.esc(n.banka.swift)}"></div>
          </div>
          <label class="zaskrtavaci" style="margin-top:12px">
            <input type="checkbox" data-n="faktura.qrPlatba" ${
              n.faktura.qrPlatba !== false ? "checked" : ""
            }>
            Tisknout na faktury QR platbu
          </label>
        </div>
      </div>

      <div class="panel">
        <h2>DPH</h2>
        <div class="telo">
          <label class="zaskrtavaci">
            <input type="checkbox" data-n="firma.plateceDph" ${n.firma.plateceDph ? "checked" : ""}>
            Jsem plátce DPH
          </label>
          ${
            n.firma.plateceDph
              ? `<div class="mrizka" style="margin-top:14px">
                   <div class="pole"><label>Zdaňovací období</label>
                     <select data-n="dph.obdobi">${ui.moznosti(
                       [
                         { hodnota: "mesic", nazev: "Měsíční" },
                         { hodnota: "ctvrtleti", nazev: "Čtvrtletní" },
                       ],
                       n.dph.obdobi
                     )}</select></div>
                   <div class="pole"><label>Výchozí sazba na nových položkách</label>
                     <select data-n="faktura.vychoziSazba">${ui.moznosti(
                       Fx.model.SAZBY_DPH.map((s) => ({ hodnota: s.hodnota, nazev: s.nazev })),
                       n.faktura.vychoziSazba
                     )}</select></div>
                 </div>`
              : `<div class="napoveda" style="margin-top:12px">
                   Na fakturách se neuvádí daň a tiskne se na nich poznámka
                   „Nejsem plátcem DPH“. Až se plátcem stanete, zaškrtněte políčko výše —
                   dosavadní doklady zůstanou beze změny.
                 </div>`
          }
        </div>
      </div>

      <div class="panel">
        <h2>Faktury</h2>
        <div class="telo">
          <div class="mrizka">
            <div class="pole"><label>Splatnost (dní)</label>
              <input type="number" data-n="faktura.splatnostDni" value="${util.cislo(
                n.faktura.splatnostDni,
                14
              )}"></div>
            <div class="pole"><label>Výchozí forma úhrady</label>
              <select data-n="faktura.formaUhrady">${ui.moznosti(
                Object.entries(Fx.model.FORMY_UHRADY).map(([hodnota, nazev]) => ({ hodnota, nazev })),
                n.faktura.formaUhrady
              )}</select></div>
            <div class="pole"><label>Výchozí jednotka</label>
              <select data-n="faktura.vychoziJednotka">${ui.moznosti(
                Fx.model.JEDNOTKY,
                n.faktura.vychoziJednotka
              )}</select></div>
          </div>
          <div class="pruh-tlacitek" style="margin-top:12px;flex-direction:column;align-items:flex-start;gap:10px">
            <label class="zaskrtavaci">
              <input type="checkbox" data-n="faktura.zaokrouhlit" ${
                n.faktura.zaokrouhlit !== false ? "checked" : ""
              }>
              Zaokrouhlovat celkovou částku na celé koruny
            </label>
            ${
              n.firma.plateceDph
                ? `<label class="zaskrtavaci">
                     <input type="checkbox" data-n="faktura.cenyVcetneDph" ${
                       n.faktura.cenyVcetneDph ? "checked" : ""
                     }>
                     Ceny na nových fakturách zadávám včetně DPH
                   </label>`
                : ""
            }
          </div>

          <div class="podnadpis">Číselné řady</div>
          <div class="mrizka">
            <div class="pole"><label>Faktury</label>
              <input type="text" data-n="cislovani.faktura" value="${util.esc(
                n.cislovani.faktura
              )}"></div>
            <div class="pole"><label>Zálohové faktury</label>
              <input type="text" data-n="cislovani.zaloha" value="${util.esc(
                n.cislovani.zaloha
              )}"></div>
            <div class="pole"><label>Dobropisy</label>
              <input type="text" data-n="cislovani.dobropis" value="${util.esc(
                n.cislovani.dobropis
              )}"></div>
          </div>
          <div class="napoveda" style="margin-top:8px">
            <b>{RRRR}</b> rok, <b>{RR}</b> rok dvojčíslím, <b>{MM}</b> měsíc,
            <b>{NNN}</b> pořadové číslo (počet písmen N určuje počet míst).
            Ukázka příštího čísla: <b id="ukazka-cisla"></b>
          </div>

          <div class="podnadpis">Texty na dokladu</div>
          <div class="pole"><label>Text nad položkami</label>
            <input type="text" data-n="faktura.textPredPolozkami" value="${util.esc(
              n.faktura.textPredPolozkami
            )}"></div>
          <div class="pole"><label>Patička faktury</label>
            <textarea data-n="faktura.patka">${util.esc(n.faktura.patka)}</textarea></div>
        </div>
      </div>

      <div class="panel">
        <h2>Upomínky</h2>
        <div class="telo">
          <div class="pole"><label>Text první upomínky</label>
            <textarea data-n="upominky.textPrvni" style="min-height:150px">${util.esc(
              n.upominky.textPrvni
            )}</textarea></div>
          <div class="pole"><label>Text druhé a další upomínky</label>
            <textarea data-n="upominky.textDruha" style="min-height:150px">${util.esc(
              n.upominky.textDruha
            )}</textarea></div>
          <div class="napoveda">
            Zástupné značky: <b>{CISLO}</b>, <b>{CASTKA}</b>, <b>{SPLATNOST}</b>, <b>{DNU}</b>,
            <b>{FIRMA}</b>, <b>{ODBERATEL}</b>, <b>{UCET}</b>, <b>{VS}</b>.
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Data a zálohy</h2>
        <div class="telo">
          <label class="zaskrtavaci">
            <input type="checkbox" data-n="zalohovani.automaticky" ${
              n.zalohovani.automaticky ? "checked" : ""
            }>
            Vytvořit zálohu automaticky při prvním spuštění v daný den
          </label>
          <div class="mrizka" style="margin-top:14px">
            <div class="pole"><label>Kolik záloh uchovávat</label>
              <input type="number" data-n="zalohovani.pocet" value="${util.cislo(
                n.zalohovani.pocet,
                30
              )}"></div>
          </div>
          <div class="pruh-tlacitek" style="margin-top:14px">
            <button data-akce="zaloha">Vytvořit zálohu teď</button>
            <button data-akce="export">Exportovat data do souboru</button>
            <button data-akce="import" class="nebezpecna">Obnovit data ze souboru</button>
            <button data-akce="slozka">Otevřít složku s daty</button>
          </div>
          <div id="seznam-zaloh" class="napoveda" style="margin-top:14px"></div>
        </div>
      </div>

      <div class="panel">
        <h2>O aplikaci</h2>
        <div class="telo" id="o-aplikaci"></div>
      </div>`;

    obnovIban();
    obnovUkazkuCisla();
    nactiZalohy();
    nactiInfo();

    ui.naVstup(kontejner, "[data-n]", (u, pole) => {
      nastav(pole.dataset.n, pole.type === "checkbox" ? pole.checked : pole.value);
      obnovIban();
      obnovUkazkuCisla();
    });
    ui.naZmenu(kontejner, "[data-n]", (u, pole) => {
      nastav(pole.dataset.n, pole.type === "checkbox" ? pole.checked : pole.value);
      // Přepnutí plátcovství DPH mění celé rozhraní, překreslíme.
      if (pole.dataset.n === "firma.plateceDph") {
        vykresli(kontejner);
        Fx.app.obnovNabidku();
      }
    });

    ui.naKlik(kontejner, "[data-akce='ares']", nactiFirmuZAres);
    ui.naKlik(kontejner, "[data-akce='nahraj-logo']", () => ui.$("#logo-soubor").click());
    ui.naKlik(kontejner, "[data-akce='smaz-logo']", () => {
      Fx.stav.dej().nastaveni.firma.logo = null;
      Fx.stav.uloz();
      vykresli(kontejner);
    });
    ui.naZmenu(kontejner, "#logo-soubor", (u, pole) => nactiLogo(pole, kontejner));

    ui.naKlik(kontejner, "[data-akce='zaloha']", vytvorZalohu);
    ui.naKlik(kontejner, "[data-akce='export']", exportDat);
    ui.naKlik(kontejner, "[data-akce='import']", importDat);
    ui.naKlik(kontejner, "[data-akce='slozka']", () => root.api.app.otevriSlozkuDat());
  }

  /* ---------------- ukládání hodnot ---------------- */

  function nastav(cesta, hodnota) {
    const data = Fx.stav.dej();
    const casti = cesta.split(".");
    let cil = data.nastaveni;
    for (let i = 0; i < casti.length - 1; i++) cil = cil[casti[i]];
    const klic = casti[casti.length - 1];

    const ciselne = ["faktura.splatnostDni", "faktura.vychoziSazba", "zalohovani.pocet"];
    cil[klic] = ciselne.includes(cesta) ? util.cislo(hodnota) : hodnota;
    Fx.stav.uloz();
  }

  function obnovIban() {
    const prvek = ui.$("#iban-nahled");
    if (!prvek) return;
    const banka = Fx.stav.dej().nastaveni.banka;
    if (!banka.ucet) {
      prvek.textContent = "";
      return;
    }
    if (!Fx.validace.platnyUcet(banka.ucet)) {
      prvek.innerHTML = `<span class="cervene">Číslo účtu neodpovídá tvaru předčíslí-číslo/kód banky.</span>`;
      return;
    }
    const iban = Fx.validace.ucetNaIban(banka.ucet);
    prvek.textContent = "IBAN: " + Fx.validace.formatIban(iban);
  }

  function obnovUkazkuCisla() {
    const prvek = ui.$("#ukazka-cisla");
    if (!prvek) return;
    const data = Fx.stav.dej();
    prvek.textContent = Fx.model.dalsiCislo(data, "faktura", util.dnesISO());
  }

  /* ---------------- logo ---------------- */

  function nactiLogo(pole, kontejner) {
    const soubor = pole.files && pole.files[0];
    if (!soubor) return;
    if (soubor.size > MAX_LOGO_BAJTU) {
      return ui.hlaska(
        `Obrázek je moc velký (${Math.round(soubor.size / 1024)} kB). Použijte logo do 400 kB.`,
        "chyba"
      );
    }
    const cteni = new FileReader();
    cteni.onload = () => {
      Fx.stav.dej().nastaveni.firma.logo = cteni.result;
      Fx.stav.uloz();
      ui.hlaska("Logo nahráno.", "uspech");
      vykresli(kontejner);
    };
    cteni.onerror = () => ui.hlaska("Obrázek se nepodařilo načíst.", "chyba");
    cteni.readAsDataURL(soubor);
  }

  /* ---------------- ARES ---------------- */

  async function nactiFirmuZAres() {
    const data = Fx.stav.dej();
    const ico = data.nastaveni.firma.ico;
    if (!ico) return ui.hlaska("Nejdřív vyplňte své IČO.", "chyba");
    ui.hlaska("Načítám z ARESu…");
    const odpoved = await root.api.ares(ico);
    if (!odpoved.ok) return ui.hlaska(odpoved.chyba, "chyba");
    Object.assign(data.nastaveni.firma, {
      jmeno: odpoved.firma.jmeno || data.nastaveni.firma.jmeno,
      dic: odpoved.firma.dic || data.nastaveni.firma.dic,
      ulice: odpoved.firma.ulice,
      mesto: odpoved.firma.mesto,
      psc: odpoved.firma.psc,
      zeme: odpoved.firma.zeme,
    });
    Fx.stav.uloz();
    ui.hlaska("Údaje doplněny z ARESu.", "uspech");
    vykresli(ui.$("#pohled"));
  }

  /* ---------------- zálohy a přenos dat ---------------- */

  async function nactiZalohy() {
    const prvek = ui.$("#seznam-zaloh");
    if (!prvek) return;
    const odpoved = await root.api.data.seznamZaloh();
    if (!odpoved.ok || !odpoved.zalohy.length) {
      prvek.textContent = "Zatím nejsou uložené žádné zálohy.";
      return;
    }
    const posledni = odpoved.zalohy[0];
    prvek.innerHTML = `Uloženo ${odpoved.zalohy.length} ${util.sklonuj(
      odpoved.zalohy.length,
      "záloha",
      "zálohy",
      "záloh"
    )}, poslední ${new Date(posledni.cas).toLocaleString("cs-CZ")}
    (${Math.round(posledni.velikost / 1024)} kB).`;
  }

  async function vytvorZalohu() {
    const data = Fx.stav.dej();
    await Fx.stav.ulozHned();
    const odpoved = await root.api.data.zaloha(data.nastaveni.zalohovani.pocet);
    if (odpoved.ok) {
      ui.hlaska("Záloha vytvořena.", "uspech");
      nactiZalohy();
    } else {
      ui.hlaska(odpoved.chyba, "chyba");
    }
  }

  async function exportDat() {
    await Fx.stav.ulozHned();
    const odpoved = await root.api.data.export(
      Fx.stav.dej(),
      `fakturace-data-${util.dnesISO()}.json`
    );
    if (odpoved.ok) ui.hlaska("Data uložena do " + odpoved.cesta, "uspech");
    else if (!odpoved.zruseno) ui.hlaska(odpoved.chyba, "chyba");
  }

  async function importDat() {
    const odpoved = await root.api.data.import();
    if (!odpoved.ok) {
      if (!odpoved.zruseno) ui.hlaska(odpoved.chyba, "chyba");
      return;
    }
    const nova = Fx.model.sjednotData(odpoved.data);
    const potvrzeno = await ui.potvrd("Opravdu nahradit všechna data ze souboru?", {
      nadpis: "Obnovit data",
      detail: `Soubor obsahuje ${nova.faktury.length} faktur, ${nova.vydaje.length} výdajů a ${nova.klienti.length} klientů. Současná data budou přepsána — před obnovením se vytvoří záloha.`,
      potvrzeni: "Nahradit data",
      nebezpecne: true,
    });
    if (!potvrzeno) return;

    await root.api.data.zaloha(Fx.stav.dej().nastaveni.zalohovani.pocet);
    const odpovedUlozeni = await root.api.data.uloz(nova);
    if (!odpovedUlozeni.ok) return ui.hlaska(odpovedUlozeni.chyba, "chyba");
    ui.hlaska("Data obnovena. Aplikace se načte znovu.", "uspech");
    setTimeout(() => root.location.reload(), 800);
  }

  async function nactiInfo() {
    const prvek = ui.$("#o-aplikaci");
    if (!prvek) return;
    const info = await root.api.app.info();
    prvek.innerHTML = `
      <div class="mrizka">
        <div><div class="titulek slaby mala">Verze aplikace</div><div class="tucne">${util.esc(
          info.verze
        )}</div></div>
        <div><div class="titulek slaby mala">Electron</div><div class="tucne">${util.esc(
          info.electron
        )}</div></div>
        <div style="grid-column:1/-1"><div class="titulek slaby mala">Složka s daty</div>
          <div class="mala">${util.esc(info.slozkaDat)}</div></div>
      </div>
      <div class="napoveda" style="margin-top:14px">
        Všechna data zůstávají v tomto počítači. Aplikace se připojuje k internetu jedině
        při ručním načtení firmy z registru ARES.
      </div>`;
  }

  pohledy.nastaveni = { vykresli };
})(window);
