/* Upomínky — neuhrazené faktury a text, který se dá poslat odběrateli. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  function vykresli(kontejner) {
    const data = Fx.stav.dej();
    const pohledavky = Fx.denik.pohledavky(data);
    const poSplatnosti = pohledavky.filter((p) => p.poSplatnosti > 0);
    const pred = pohledavky.filter((p) => p.poSplatnosti <= 0);

    Fx.app.zahlavi({
      nadpis: "Upomínky",
      podnadpis: `${poSplatnosti.length} ${util.sklonuj(
        poSplatnosti.length,
        "faktura",
        "faktury",
        "faktur"
      )} po splatnosti`,
    });

    kontejner.innerHTML = `
      ${
        poSplatnosti.length
          ? `<div class="panel">
              <h2>Po splatnosti
                <span class="vpravo tucne cervene">${util.kc(
                  poSplatnosti.reduce((s, p) => s + p.zbyva, 0),
                  0
                )}</span>
              </h2>
              <div class="telo bezodsazeni">${tabulka(poSplatnosti, true)}</div>
            </div>`
          : `<div class="panel"><div class="telo">${ui.prazdno(
              "Nikdo vám nedluží po splatnosti",
              "Všechny vystavené faktury jsou uhrazené nebo ještě běží lhůta splatnosti."
            )}</div></div>`
      }
      ${
        pred.length
          ? `<div class="panel">
              <h2>Ještě neuhrazené, ve lhůtě splatnosti
                <span class="vpravo tucne">${util.kc(
                  pred.reduce((s, p) => s + p.zbyva, 0),
                  0
                )}</span>
              </h2>
              <div class="telo bezodsazeni">${tabulka(pred, false)}</div>
            </div>`
          : ""
      }`;

    ui.naKlik(kontejner, "[data-otevri]", (u, prvek) =>
      Fx.app.prejdi("faktura/" + prvek.dataset.otevri)
    );
    ui.naKlik(kontejner, "[data-upominka]", (u, prvek) => {
      u.stopPropagation();
      pripravUpominku(prvek.dataset.upominka);
    });
    ui.naKlik(kontejner, "[data-uhrada]", (u, prvek) => {
      u.stopPropagation();
      zaznamenejUhradu(prvek.dataset.uhrada);
    });
  }

  function tabulka(seznam, sUpominkou) {
    return `<table class="seznam">
      <thead><tr>
        <th>Číslo</th><th>Odběratel</th><th>Splatnost</th>
        ${sUpominkou ? '<th class="cislo">Po splatnosti</th>' : ""}
        <th>Upomínky</th><th class="cislo">Zbývá</th><th></th>
      </tr></thead>
      <tbody>
        ${seznam
          .map((p) => {
            const poslano = (p.faktura.upominky || []).length;
            return `<tr class="klikaci" data-otevri="${util.esc(p.faktura.id)}">
              <td class="hlavni-sloupec">${util.esc(p.faktura.cislo)}</td>
              <td>${util.esc(p.faktura.odberatel.jmeno)}
                <div class="mala slaby">${util.esc(p.faktura.odberatel.email || "")}</div>
              </td>
              <td class="nowrap">${util.datumCz(p.faktura.datumSplatnosti)}</td>
              ${
                sUpominkou
                  ? `<td class="cislo cervene">${p.poSplatnosti} ${util.sklonuj(
                      p.poSplatnosti,
                      "den",
                      "dny",
                      "dní"
                    )}</td>`
                  : ""
              }
              <td class="mala">${
                poslano
                  ? `${poslano}× · naposledy ${util.datumCz(
                      p.faktura.upominky[poslano - 1].datum
                    )}`
                  : "—"
              }</td>
              <td class="cislo tucne">${util.kc(p.zbyva)}</td>
              <td class="akce">
                <button class="drobne" data-upominka="${util.esc(p.faktura.id)}">Upomínka</button>
                <button class="drobne" data-uhrada="${util.esc(p.faktura.id)}">Zaplaceno</button>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
  }

  /** Do textu upomínky doplní údaje konkrétní faktury. */
  function sestavText(sablona, faktura, vypocet, data) {
    const banka = data.nastaveni.banka;
    const nahrady = {
      "{CISLO}": faktura.cislo || "",
      "{CASTKA}": util.kc(vypocet.zbyvaUhradit),
      "{SPLATNOST}": util.datumCz(faktura.datumSplatnosti),
      "{DNU}": String(Fx.vypocet.dnuPoSplatnosti(faktura)),
      "{FIRMA}": data.nastaveni.firma.jmeno || "",
      "{ODBERATEL}": faktura.odberatel.jmeno || "",
      "{UCET}": banka.ucet || banka.iban || "",
      "{VS}": faktura.vs || Fx.validace.vsZCisla(faktura.cislo),
    };
    return Object.entries(nahrady).reduce(
      (text, [klic, hodnota]) => text.split(klic).join(hodnota),
      String(sablona || "")
    );
  }

  async function pripravUpominku(id) {
    const data = Fx.stav.dej();
    const faktura = Fx.stav.faktura(id);
    if (!faktura) return;
    const vypocet = Fx.stav.vypocet(faktura);
    const poradi = (faktura.upominky || []).length + 1;
    const sablona =
      poradi === 1 ? data.nastaveni.upominky.textPrvni : data.nastaveni.upominky.textDruha;
    const text = sestavText(sablona, faktura, vypocet, data);

    const vysledek = await ui.dialog({
      nadpis: `${poradi}. upomínka k faktuře ${faktura.cislo}`,
      sirka: "640px",
      telo: `
        <div class="pole">
          <label>Text upomínky</label>
          <textarea id="up-text" style="min-height:220px">${util.esc(text)}</textarea>
          <div class="napoveda">
            Text vychází ze šablony v nastavení. Můžete ho tady upravit — změny se použijí jen pro tuhle upomínku.
          </div>
        </div>
        ${
          faktura.odberatel.email
            ? `<div class="napoveda">E-mail odběratele: <b>${util.esc(
                faktura.odberatel.email
              )}</b></div>`
            : `<div class="napoveda">Odběratel nemá v adresáři e-mail.</div>`
        }`,
      tlacitka: [
        { text: "Zavřít", hodnota: null },
        { text: "Uložit do souboru", hodnota: "soubor" },
        { text: "Zkopírovat a zaznamenat", hodnota: "schranka", hlavni: true },
      ],
      predUzavrenim: (dialog, volba) => ({
        akce: volba.hodnota,
        text: ui.$("#up-text", dialog).value,
      }),
    });

    if (!vysledek) return;

    if (vysledek.akce === "soubor") {
      await ui.ulozTextovySoubor(vysledek.text, `upominka-${faktura.cislo}`);
    } else {
      const zkopirovano = await ui.doSchranky(vysledek.text);
      if (!zkopirovano) return;
    }

    if (!Array.isArray(faktura.upominky)) faktura.upominky = [];
    faktura.upominky.push({ datum: util.dnesISO(), poradi, text: vysledek.text });
    Fx.stav.ulozFakturu(faktura);
    vykresli(ui.$("#pohled"));
  }

  async function zaznamenejUhradu(id) {
    const faktura = Fx.stav.faktura(id);
    if (!faktura) return;
    const vypocet = Fx.stav.vypocet(faktura);

    const odpoved = await ui.dialog({
      nadpis: "Zaznamenat úhradu",
      telo: `<div class="mrizka">
        <div class="pole"><label>Datum úhrady</label>
          <input type="date" id="u-datum" value="${util.dnesISO()}"></div>
        <div class="pole"><label>Částka</label>
          <input type="number" step="0.01" id="u-castka" value="${vypocet.zbyvaUhradit}"></div>
      </div>
      <div class="napoveda">Faktura ${util.esc(faktura.cislo)} — ${util.esc(
        faktura.odberatel.jmeno
      )}</div>`,
      tlacitka: [
        { text: "Zrušit", hodnota: null },
        { text: "Zaznamenat", hodnota: true, hlavni: true },
      ],
      predUzavrenim: (dialog) => ({
        datum: ui.$("#u-datum", dialog).value,
        castka: util.cislo(ui.$("#u-castka", dialog).value),
        zpusob: faktura.formaUhrady,
      }),
    });

    if (!odpoved || !odpoved.castka) return;
    faktura.uhrady.push(odpoved);
    Fx.stav.ulozFakturu(faktura);
    ui.hlaska("Úhrada zaznamenána.", "uspech");
    Fx.app.obnovNabidku();
    vykresli(ui.$("#pohled"));
  }

  pohledy.upominky = { vykresli };
})(window);
