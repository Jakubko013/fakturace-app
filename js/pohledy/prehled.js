/* Úvodní obrazovka — čísla, na která se člověk potřebuje podívat nejčastěji. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;
  const pohledy = (Fx.pohledy = Fx.pohledy || {});

  const MESICE_ZKRATKY = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];

  function vykresli(kontejner) {
    const data = Fx.stav.dej();
    const rok = new Date().getFullYear();
    const odRoku = `${rok}-01-01`;
    const doRoku = `${rok}-12-31`;

    const polozky = Fx.denik.polozkyDeniku(data, odRoku, doRoku);
    const souhrn = Fx.denik.souhrn(polozky);
    const pohledavky = Fx.denik.pohledavky(data);
    const poSplatnosti = pohledavky.filter((p) => p.poSplatnosti > 0);
    const nezaplaceno = pohledavky.reduce((s, p) => s + p.zbyva, 0);
    const dluhPoSplatnosti = poSplatnosti.reduce((s, p) => s + p.zbyva, 0);

    // Vyfakturováno za rok podle data vystavení (ne podle úhrad).
    let vyfakturovano = 0;
    for (const faktura of data.faktury) {
      if (faktura.typ === "zaloha") continue;
      if (faktura.stav === "koncept" || faktura.stav === "stornovana") continue;
      if (!util.vRozmezi(faktura.datumVystaveni, odRoku, doRoku)) continue;
      vyfakturovano += Fx.stav.vypocet(faktura).zakladCelkem;
    }

    Fx.app.zahlavi({
      nadpis: "Přehled",
      podnadpis: `Rok ${rok} · ${data.nastaveni.firma.jmeno || "firma není vyplněná"}`,
      akce: `<button class="hlavni" data-akce="nova-faktura">Nová faktura</button>
             <button data-akce="novy-vydaj">Nový výdaj</button>`,
    });

    kontejner.innerHTML = `
      ${varovaniHtml(data)}
      ${sablonyHtml(data)}

      <div class="dlazdice">
        <div class="karta">
          <div class="titulek">Vyfakturováno ${rok}</div>
          <div class="hodnota">${util.kc(vyfakturovano, 0)}</div>
          <div class="doplnek">${
            data.nastaveni.firma.plateceDph ? "bez DPH, " : ""
          }podle data vystavení</div>
        </div>
        <div class="karta">
          <div class="titulek">Přijaté platby</div>
          <div class="hodnota">${util.kc(souhrn.prijmyCelkem, 0)}</div>
          <div class="doplnek">${
            data.nastaveni.firma.plateceDph ? "včetně DPH, " : ""
          }podle data úhrady</div>
        </div>
        <div class="karta${nezaplaceno > 0 ? "" : " zvyrazneni-zelena"}">
          <div class="titulek">Neuhrazené faktury</div>
          <div class="hodnota">${util.kc(nezaplaceno, 0)}</div>
          <div class="doplnek">${pohledavky.length} ${util.sklonuj(
      pohledavky.length,
      "faktura",
      "faktury",
      "faktur"
    )}</div>
        </div>
        <div class="karta${dluhPoSplatnosti > 0 ? " zvyrazneni-cervena" : ""}">
          <div class="titulek">Po splatnosti</div>
          <div class="hodnota">${util.kc(dluhPoSplatnosti, 0)}</div>
          <div class="doplnek">${poSplatnosti.length} ${util.sklonuj(
      poSplatnosti.length,
      "faktura",
      "faktury",
      "faktur"
    )}</div>
        </div>
        <div class="karta">
          <div class="titulek">Základ daně ${rok}</div>
          <div class="hodnota">${util.kc(souhrn.zakladDane, 0)}</div>
          <div class="doplnek">příjmy ${util.kc(souhrn.prijmyDoZakladu, 0)} − výdaje ${util.kc(
      souhrn.vydajeDoZakladu,
      0
    )}</div>
        </div>
        ${dlazdiceDph(data)}
      </div>

      <div class="panel">
        <h2>Příjmy a výdaje v roce ${rok}
          <span class="vpravo"><a href="#denik">Peněžní deník</a></span>
        </h2>
        <div class="telo">
          ${grafHtml(Fx.denik.poMesicich(data, rok))}
        </div>
      </div>

      ${
        poSplatnosti.length
          ? `<div class="panel">
              <h2>Faktury po splatnosti
                <span class="vpravo"><a href="#upominky">Upomínky</a></span>
              </h2>
              <div class="telo bezodsazeni">${tabulkaPohledavek(poSplatnosti)}</div>
            </div>`
          : ""
      }

      <div class="panel">
        <h2>Poslední doklady <span class="vpravo"><a href="#faktury">Všechny faktury</a></span></h2>
        <div class="telo bezodsazeni">${posledniFaktury(data)}</div>
      </div>
    `;

    ui.naKlik(kontejner, "[data-akce='nova-faktura']", () => Fx.app.prejdi("faktura/nova"));
    ui.naKlik(kontejner, "[data-akce='novy-vydaj']", () => Fx.app.prejdi("vydaj/novy"));
    ui.naKlik(kontejner, "tr[data-faktura]", (u, radek) =>
      Fx.app.prejdi("faktura/" + radek.dataset.faktura)
    );
    ui.naKlik(kontejner, "[data-akce='vystavit-sablony']", () => Fx.app.prejdi("opakovane"));
    ui.naKlik(kontejner, "[data-akce='nastaveni']", () => Fx.app.prejdi("nastaveni"));
  }

  function dlazdiceDph(data) {
    if (!data.nastaveni.firma.plateceDph) return "";
    const dnes = new Date();
    const ctvrtletni = data.nastaveni.dph.obdobi === "ctvrtleti";
    // Přiznání se podává za období, které skončilo — ukážeme to minulé.
    let rok = dnes.getFullYear();
    let poradi = ctvrtletni ? Math.floor(dnes.getMonth() / 3) + 1 : dnes.getMonth() + 1;
    poradi -= 1;
    if (poradi < 1) {
      poradi = ctvrtletni ? 4 : 12;
      rok -= 1;
    }
    const obdobi = util.obdobi(rok, poradi, ctvrtletni ? "ctvrtleti" : "mesic");
    const prehled = Fx.dph.prehledDph(data, obdobi.od, obdobi.do);
    const nazev = ctvrtletni ? `${poradi}. čtvrtletí ${rok}` : `${poradi}/${rok}`;

    return `<div class="karta${prehled.vysledek > 0 ? " zvyrazneni-cervena" : ""}">
      <div class="titulek">DPH za ${nazev}</div>
      <div class="hodnota">${util.kc(Math.abs(prehled.vysledek), 0)}</div>
      <div class="doplnek">${
        prehled.jeNadmernyOdpocet ? "nadměrný odpočet" : "vlastní daňová povinnost"
      }</div>
    </div>`;
  }

  function varovaniHtml(data) {
    const potize = Fx.validace.zkontrolujFirmu(data.nastaveni.firma, data.nastaveni.banka);
    if (!potize.length) return "";
    return `<div class="upozorneni">
      <b>Než vystavíte první fakturu, doplňte údaje o firmě</b>
      <ul>${potize.map((p) => `<li>${util.esc(p)}</li>`).join("")}</ul>
      <div style="margin-top:10px"><button data-akce="nastaveni">Otevřít nastavení</button></div>
    </div>`;
  }

  function sablonyHtml(data) {
    const cekajici = Fx.stav.sablonyKVystaveni();
    if (!cekajici.length) return "";
    return `<div class="upozorneni info">
      <b>Čeká ${cekajici.length} ${util.sklonuj(
      cekajici.length,
      "opakovaná faktura",
      "opakované faktury",
      "opakovaných faktur"
    )} k vystavení</b>
      ${util.esc(cekajici.map((s) => s.nazev).join(", "))}
      <div style="margin-top:10px"><button data-akce="vystavit-sablony">Zobrazit</button></div>
    </div>`;
  }

  function grafHtml(mesice) {
    const nejvyssi = Math.max(1, ...mesice.map((m) => Math.max(m.prijmy, m.vydaje)));
    return `
      <div class="graf">
        ${mesice
          .map(
            (m) => `<div class="sloupec">
              <div class="dvojice">
                <div class="prijem" style="height:${(m.prijmy / nejvyssi) * 100}%" title="Příjmy ${util.kc(
              m.prijmy,
              0
            )}"></div>
                <div class="vydaj" style="height:${(m.vydaje / nejvyssi) * 100}%" title="Výdaje ${util.kc(
              m.vydaje,
              0
            )}"></div>
              </div>
              <div class="popis">${MESICE_ZKRATKY[m.mesic - 1]}</div>
            </div>`
          )
          .join("")}
      </div>
      <div class="legenda">
        <span><i style="background:var(--hlavni)"></i>Příjmy</span>
        <span><i style="background:var(--vydaj-barva)"></i>Výdaje</span>
      </div>`;
  }

  function tabulkaPohledavek(seznam) {
    return `<table class="seznam">
      <thead><tr>
        <th>Číslo</th><th>Odběratel</th><th>Splatnost</th>
        <th class="cislo">Po splatnosti</th><th class="cislo">Zbývá uhradit</th>
      </tr></thead>
      <tbody>
        ${seznam
          .map(
            (p) => `<tr class="klikaci" data-faktura="${util.esc(p.faktura.id)}">
              <td class="hlavni-sloupec">${util.esc(p.faktura.cislo)}</td>
              <td>${util.esc(p.faktura.odberatel.jmeno)}</td>
              <td>${util.datumCz(p.faktura.datumSplatnosti)}</td>
              <td class="cislo cervene">${p.poSplatnosti} ${util.sklonuj(
              p.poSplatnosti,
              "den",
              "dny",
              "dní"
            )}</td>
              <td class="cislo tucne">${util.kc(p.zbyva)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  }

  function posledniFaktury(data) {
    const seznam = [...data.faktury]
      .sort((a, b) => String(b.datumVystaveni).localeCompare(String(a.datumVystaveni)))
      .slice(0, 8);
    if (!seznam.length) {
      return ui.prazdno(
        "Zatím žádné faktury",
        "Vystavte první fakturu tlačítkem nahoře vpravo.",
        `<button class="hlavni" data-akce="nova-faktura">Nová faktura</button>`
      );
    }
    return `<table class="seznam">
      <thead><tr>
        <th>Číslo</th><th>Odběratel</th><th>Vystaveno</th><th>Stav</th><th class="cislo">Celkem</th>
      </tr></thead>
      <tbody>
        ${seznam
          .map((faktura) => {
            const vypocet = Fx.stav.vypocet(faktura);
            return `<tr class="klikaci" data-faktura="${util.esc(faktura.id)}">
              <td class="hlavni-sloupec">${util.esc(faktura.cislo || "koncept")}</td>
              <td>${util.esc(faktura.odberatel.jmeno || "—")}</td>
              <td>${util.datumCz(faktura.datumVystaveni)}</td>
              <td>${ui.odznakStavu(Fx.stav.stav(faktura))}</td>
              <td class="cislo tucne">${util.kc(vypocet.kUhrade)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
  }

  pohledy.prehled = { vykresli };
})(window);
