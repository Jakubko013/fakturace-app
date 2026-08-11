/* Spuštění aplikace, boční nabídka a přepínání obrazovek. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const ui = Fx.ui;

  const NABIDKA = [
    { skupina: "Přehled" },
    { cesta: "prehled", nazev: "Přehled", ikona: "▦" },
    { skupina: "Doklady" },
    { cesta: "faktury", nazev: "Faktury", ikona: "▤" },
    { cesta: "vydaje", nazev: "Výdaje", ikona: "▥" },
    { cesta: "klienti", nazev: "Klienti", ikona: "◫" },
    { cesta: "opakovane", nazev: "Opakované faktury", ikona: "↻" },
    { cesta: "upominky", nazev: "Upomínky", ikona: "!", odznacek: "poSplatnosti" },
    { skupina: "Účetnictví" },
    { cesta: "denik", nazev: "Peněžní deník", ikona: "≡" },
    { cesta: "dph", nazev: "DPH", ikona: "%", jenPlatceDph: true },
    { skupina: "" },
    { cesta: "nastaveni", nazev: "Nastavení", ikona: "⚙" },
  ];

  /* ---------------- záhlaví stránky ---------------- */

  /** Podnadpis i akce jsou HTML — sestavují je jednotlivé obrazovky. */
  function zahlavi({ nadpis, podnadpis, akce }) {
    ui.$("#nadpis").textContent = nadpis || "";
    ui.$("#podnadpis").innerHTML = podnadpis || "";
    ui.$("#akce-zahlavi").innerHTML = akce || "";
  }

  /* ---------------- boční nabídka ---------------- */

  function vykresliNabidku() {
    const aktualni = cestaZAdresy().pohled;
    const poSplatnosti = Fx.stav.poSplatnosti().length;
    const cekajiciSablony = Fx.stav.sablonyKVystaveni().length;

    const plateceDph = Fx.stav.dej().nastaveni.firma.plateceDph;

    ui.$("#nabidka").innerHTML = NABIDKA.map((polozka) => {
      if (polozka.skupina !== undefined) {
        return polozka.skupina ? `<div class="skupina">${util.esc(polozka.skupina)}</div>` : "";
      }
      // Neplátci DPH se přehled daně nenabízí.
      if (polozka.jenPlatceDph && !plateceDph) return "";
      let odznacek = "";
      if (polozka.odznacek === "poSplatnosti" && poSplatnosti) {
        odznacek = `<span class="odznacek">${poSplatnosti}</span>`;
      }
      if (polozka.cesta === "opakovane" && cekajiciSablony) {
        odznacek = `<span class="odznacek">${cekajiciSablony}</span>`;
      }
      return `<a href="#${polozka.cesta}" class="${aktualni === polozka.cesta ? "aktivni" : ""}">
        <span class="ikona">${polozka.ikona}</span>${util.esc(polozka.nazev)}${odznacek}
      </a>`;
    }).join("");

    const data = Fx.stav.dej();
    ui.$("#znacka-jmeno").textContent = data.nastaveni.firma.jmeno || "Fakturace";
    ui.$("#znacka-popis").textContent = plateceDph
      ? "daňová evidence · plátce DPH"
      : "daňová evidence · neplátce";
    ui.$("#patka-panelu").textContent = `${data.faktury.length} ${util.sklonuj(
      data.faktury.length,
      "doklad",
      "doklady",
      "dokladů"
    )} · ${data.klienti.length} ${util.sklonuj(
      data.klienti.length,
      "klient",
      "klienti",
      "klientů"
    )}`;
  }

  /* ---------------- směrování ---------------- */

  function cestaZAdresy() {
    const cela = String(root.location.hash || "").replace(/^#/, "");
    if (!cela) return { pohled: "prehled", parametr: "" };
    const lomitko = cela.indexOf("/");
    if (lomitko < 0) return { pohled: cela, parametr: "" };
    return { pohled: cela.slice(0, lomitko), parametr: cela.slice(lomitko + 1) };
  }

  function prejdi(cesta) {
    if (root.location.hash === "#" + cesta) zobraz();
    else root.location.hash = "#" + cesta;
  }

  function zobraz() {
    const { pohled, parametr } = cestaZAdresy();
    const kontejner = ui.$("#pohled");
    const obrazovka = Fx.pohledy[pohled];

    if (!obrazovka) {
      zahlavi({ nadpis: "Stránka nenalezena", podnadpis: "" });
      kontejner.innerHTML = ui.prazdno(
        "Tuhle stránku neznám",
        "Vyberte si prosím něco z nabídky vlevo."
      );
      return;
    }

    // Posluchače na tlačítkách v záhlaví si každá obrazovka nastavuje sama.
    ui.$("#akce-zahlavi").onclick = null;
    kontejner.scrollTop = 0;
    ui.$("#obsah").scrollTop = 0;

    try {
      obrazovka.vykresli(kontejner, parametr);
    } catch (chyba) {
      console.error(chyba);
      zahlavi({ nadpis: "Něco se pokazilo", podnadpis: "" });
      kontejner.innerHTML = `<div class="upozorneni">
        <b>Obrazovku se nepodařilo zobrazit</b>
        ${util.esc(chyba.message)}
        <div class="napoveda" style="margin-top:8px">
          Data jsou v pořádku uložená. Zkuste přejít jinam, nebo aplikaci restartovat.
        </div>
      </div>`;
    }
    vykresliNabidku();
  }

  /* ---------------- akce z hlavní nabídky okna ---------------- */

  function naAkciMenu(akce) {
    const cesty = {
      "nova-faktura": "faktura/nova",
      "novy-vydaj": "vydaj/novy",
      faktury: "faktury",
      vydaje: "vydaje",
      denik: "denik",
      dph: "dph",
      nastaveni: "nastaveni",
    };
    if (cesty[akce]) return prejdi(cesty[akce]);
    if (akce === "zaloha") {
      return Fx.stav.ulozHned().then(async () => {
        const data = Fx.stav.dej();
        const odpoved = await root.api.data.zaloha(data.nastaveni.zalohovani.pocet);
        ui.hlaska(odpoved.ok ? "Záloha vytvořena." : odpoved.chyba, odpoved.ok ? "uspech" : "chyba");
      });
    }
    if (akce === "export" || akce === "import" || akce === "o-aplikaci") {
      return prejdi("nastaveni");
    }
  }

  /* ---------------- start ---------------- */

  async function start() {
    await Fx.stav.nacti();

    // Krátká cesta pro nový výdaj z hlavní nabídky okna.
    Fx.pohledy.vydaj = {
      vykresli(kontejner, parametr) {
        root.location.hash = parametr === "novy" ? "#vydaje/novy" : "#vydaje";
      },
    };

    root.addEventListener("hashchange", zobraz);
    root.api.naAkciMenu(naAkciMenu);

    // Rozepsané změny uložíme dřív, než se okno zavře.
    root.addEventListener("beforeunload", () => {
      if (Fx.stav.dej()) Fx.stav.ulozHned();
    });

    vykresliNabidku();
    zobraz();
    upozorniNaSablony();
  }

  function upozorniNaSablony() {
    const cekajici = Fx.stav.sablonyKVystaveni();
    if (!cekajici.length) return;
    ui.hlaska(
      `Čeká ${cekajici.length} ${util.sklonuj(
        cekajici.length,
        "opakovaná faktura",
        "opakované faktury",
        "opakovaných faktur"
      )} k vystavení.`
    );
  }

  Fx.app = { zahlavi, prejdi, zobraz, obnovNabidku: vykresliNabidku };

  document.addEventListener("DOMContentLoaded", start);
})(window);
