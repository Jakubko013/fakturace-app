/* Prohlížečová náhrada za Electron preload most.

   Zbytek aplikace (core/*, ui.js, stav.js, doklad.js, pohledy/*, app.js) volá
   všude jen `window.api.*` a o to, jestli běží v Electronu nebo v prohlížeči,
   se nestará. Tenhle soubor je jediné místo, které ví, že tu žádný Node.js
   ani souborový systém není — data žijí v localStorage tohoto prohlížeče
   a tisk jde přes tiskový dialog prohlížeče, ne přes uložení souboru. */
(function (root) {
  "use strict";

  const KLIC_DAT = "fakturace:data";
  const PREDPONA_ZALOHY = "fakturace:zaloha:";
  const URL_ARES = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/";

  /* ---------------- data ---------------- */

  async function nacti() {
    try {
      const surova = localStorage.getItem(KLIC_DAT);
      return { ok: true, data: surova ? JSON.parse(surova) : null };
    } catch (err) {
      return { ok: false, chyba: "Data v prohlížeči se nepodařilo přečíst: " + err.message };
    }
  }

  async function uloz(data) {
    try {
      localStorage.setItem(KLIC_DAT, JSON.stringify(data));
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        chyba:
          "Data se nepodařilo uložit — úložiště prohlížeče je pravděpodobně plné: " + err.message,
      };
    }
  }

  /* ---------------- zálohy ----------------
     Skutečný soubor tu není, tak zálohy žijí jako další klíče v localStorage.
     Zápis je tím pádem taky atomický (jeden setItem), jen ho v mobilu prohlížeč
     může smazat, pokud dojde úložiště — proto export do souboru zůstává
     jediná spolehlivá dlouhodobá záloha (viz nastaveni.js). */

  function razitko() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
  }

  function seznamKlicuZaloh() {
    const klice = [];
    for (let i = 0; i < localStorage.length; i++) {
      const klic = localStorage.key(i);
      if (klic && klic.startsWith(PREDPONA_ZALOHY)) klice.push(klic);
    }
    return klice.sort();
  }

  async function zaloha(maxPocet) {
    const surova = localStorage.getItem(KLIC_DAT);
    if (!surova) return { ok: true, cesta: null };
    try {
      localStorage.setItem(PREDPONA_ZALOHY + razitko(), surova);
    } catch (err) {
      return { ok: false, chyba: "Zálohu se nepodařilo uložit: " + err.message };
    }
    const klice = seznamKlicuZaloh();
    const kSmazani = klice.slice(0, Math.max(0, klice.length - (Number(maxPocet) || 30)));
    kSmazani.forEach((k) => localStorage.removeItem(k));
    return { ok: true, cesta: "úložiště prohlížeče" };
  }

  async function seznamZaloh() {
    return {
      ok: true,
      zalohy: seznamKlicuZaloh()
        .reverse()
        .map((klic) => {
          const obsah = localStorage.getItem(klic) || "";
          const razitkoTextu = klic.slice(PREDPONA_ZALOHY.length);
          const cas = casZeRazitka(razitkoTextu);
          return { nazev: razitkoTextu, cesta: klic, velikost: new Blob([obsah]).size, cas };
        }),
    };
  }

  function casZeRazitka(razitkoTextu) {
    const shoda = razitkoTextu.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/);
    if (!shoda) return Date.now();
    const [, r, m, d, h, mi, s] = shoda.map(Number);
    return new Date(r, m - 1, d, h, mi, s).getTime();
  }

  /* ---------------- export / import ---------------- */

  function stahniSoubor(obsah, nazev, typ) {
    const blob = new Blob([obsah], { type: typ || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const odkaz = document.createElement("a");
    odkaz.href = url;
    odkaz.download = nazev;
    document.body.appendChild(odkaz);
    odkaz.click();
    odkaz.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Otevře výběr souboru a vrátí vybraný File, nebo null při zrušení. */
  function vyberSoubor(accept) {
    return new Promise((vrat) => {
      const vstup = document.createElement("input");
      vstup.type = "file";
      vstup.accept = accept || "";
      vstup.style.position = "fixed";
      vstup.style.left = "-9999px";
      document.body.appendChild(vstup);

      let vyreseno = false;
      const uklid = () => vstup.remove();
      const dokonci = (soubor) => {
        if (vyreseno) return;
        vyreseno = true;
        uklid();
        vrat(soubor);
      };

      vstup.addEventListener("change", () => dokonci((vstup.files && vstup.files[0]) || null));
      // Ne všechny prohlížeče (zejména starší Safari) posílají "cancel" —
      // náhradou je, že se okno po zavření dialogu vrátí do popředí.
      vstup.addEventListener("cancel", () => dokonci(null));
      window.addEventListener(
        "focus",
        function naFokus() {
          window.removeEventListener("focus", naFokus);
          setTimeout(() => dokonci(null), 700);
        },
        { once: true }
      );
      vstup.click();
    });
  }

  async function exportDat(data, nazev) {
    stahniSoubor(JSON.stringify(data, null, 2), nazev || "fakturace-data.json", "application/json");
    return { ok: true, cesta: nazev || "fakturace-data.json" };
  }

  async function importDat() {
    const soubor = await vyberSoubor("application/json,.json");
    if (!soubor) return { ok: false, zruseno: true };
    try {
      const text = await soubor.text();
      return { ok: true, data: JSON.parse(text), cesta: soubor.name };
    } catch (err) {
      return { ok: false, chyba: "Soubor se nepodařilo přečíst: " + err.message };
    }
  }

  async function ulozText(obsah, nazev, popisTypu, pripona) {
    const typy = { csv: "text/csv;charset=utf-8", json: "application/json", txt: "text/plain;charset=utf-8" };
    stahniSoubor(obsah, nazev, typy[pripona] || "text/plain;charset=utf-8");
    return { ok: true, cesta: nazev };
  }

  /* ---------------- tisk a PDF ----------------
     Žádné okno na pozadí jako v Electronu — doklad se vykreslí do skrytého
     rámce uvnitř stránky a zavolá se na něj window.print(). Tím se otevře
     systémový tiskový dialog, kde si uživatel zvolí "Uložit jako PDF". */

  function ziskejTiskovyRamec() {
    let ramec = document.getElementById("fx-tisk-ramec");
    if (!ramec) {
      ramec = document.createElement("iframe");
      ramec.id = "fx-tisk-ramec";
      ramec.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;height:1120px;border:0;";
      document.body.appendChild(ramec);
    }
    return ramec;
  }

  async function vytisknout(html) {
    let ramec;
    try {
      ramec = ziskejTiskovyRamec();
      const doc = ramec.contentDocument || ramec.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
    } catch (err) {
      return { ok: false, chyba: "Náhled dokladu se nepodařilo vykreslit: " + err.message };
    }
    // Krátká pauza na vykreslení QR obrázku a fontů, než se otevře tisk.
    await new Promise((hotovo) => setTimeout(hotovo, 400));
    try {
      ramec.contentWindow.focus();
      ramec.contentWindow.print();
    } catch (err) {
      return { ok: false, chyba: "Tisk se nepodařilo spustit: " + err.message };
    }
    return { ok: true };
  }

  /* ---------------- QR platba ---------------- */

  function vytvorQr(text) {
    return new Promise((vrat) => {
      if (!root.QRCodeLib) {
        vrat({ ok: false, chyba: "Knihovna pro QR kód se nenačetla." });
        return;
      }
      root.QRCodeLib.toDataURL(
        String(text),
        { errorCorrectionLevel: "M", margin: 1, width: 320, color: { dark: "#111827", light: "#ffffff" } },
        (chyba, dataUrl) => {
          if (chyba) vrat({ ok: false, chyba: chyba.message });
          else vrat({ ok: true, dataUrl });
        }
      );
    });
  }

  /* ---------------- ARES ----------------
     Jediné místo, kde appka chodí na síť, a jen na výslovné kliknutí.
     Prohlížeč může přístup na jinou doménu zablokovat (CORS) — pak appka
     jen řekne, ať se údaje vyplní ručně, nic se nerozbije. */

  async function najdiIco(ico) {
    const cisteIco = String(ico || "").replace(/\D/g, "");
    if (cisteIco.length !== 8) return { ok: false, chyba: "IČO musí mít 8 číslic." };

    const prerus = new AbortController();
    const casovac = setTimeout(() => prerus.abort(), 12000);
    try {
      const odpoved = await fetch(URL_ARES + cisteIco, {
        signal: prerus.signal,
        headers: { accept: "application/json" },
      });
      if (odpoved.status === 404) {
        return { ok: false, chyba: `Subjekt s IČO ${cisteIco} nebyl v ARESu nalezen.` };
      }
      if (!odpoved.ok) return { ok: false, chyba: `ARES odpověděl chybou ${odpoved.status}.` };
      const data = await odpoved.json();
      return { ok: true, firma: prevedSubjektAres(data) };
    } catch (err) {
      return {
        ok: false,
        chyba:
          err.name === "AbortError"
            ? "ARES neodpověděl včas. Zkuste to znovu, nebo údaje vyplňte ručně."
            : "Z tohoto prohlížeče se nepodařilo spojit s ARESem. Vyplňte prosím údaje ručně.",
      };
    } finally {
      clearTimeout(casovac);
    }
  }

  function prevedSubjektAres(data) {
    const sidlo = data.sidlo || {};
    return {
      jmeno: data.obchodniJmeno || "",
      ico: data.ico || "",
      dic: data.dic || "",
      ulice: sestavUlici(sidlo),
      mesto: sidlo.nazevObce || "",
      psc: sidlo.psc ? formatPsc(sidlo.psc) : "",
      zeme: sidlo.nazevStatu || "Česká republika",
    };
  }

  function sestavUlici(sidlo) {
    const ulice = sidlo.nazevUlice || sidlo.nazevCastiObce || sidlo.nazevObce || "";
    const cisloDomovni = sidlo.cisloDomovni != null ? String(sidlo.cisloDomovni) : "";
    const cisloOrientacni =
      sidlo.cisloOrientacni != null
        ? String(sidlo.cisloOrientacni) + (sidlo.cisloOrientacniPismeno || "")
        : "";
    let cislo = cisloDomovni;
    if (cisloDomovni && cisloOrientacni) cislo = `${cisloDomovni}/${cisloOrientacni}`;
    else if (!cisloDomovni && cisloOrientacni) cislo = cisloOrientacni;
    return [ulice, cislo].filter(Boolean).join(" ").trim();
  }

  function formatPsc(psc) {
    const c = String(psc).replace(/\D/g, "");
    return c.length === 5 ? `${c.slice(0, 3)} ${c.slice(3)}` : String(psc);
  }

  /* ---------------- potvrzovací dialog ----------------
     Elektron má nativní systémový dialog; v prohlížeči použijeme stejný
     styl dialogu jako zbytek appky (Fx.ui.dialog), aby to vypadalo jednotně. */

  function potvrd(volby) {
    const util = root.Fx.util;
    const telo =
      `<div>${util.escViceradkove(volby.zprava || "")}</div>` +
      (volby.detail
        ? `<div class="napoveda" style="margin-top:10px">${util.escViceradkove(volby.detail)}</div>`
        : "");
    return root.Fx.ui
      .dialog({
        nadpis: volby.nadpis || "Potvrzení",
        telo,
        tlacitka: [
          { text: "Zrušit", hodnota: null },
          {
            text: volby.potvrzeni || "Pokračovat",
            hodnota: true,
            hlavni: !volby.nebezpecne,
            nebezpecna: !!volby.nebezpecne,
          },
        ],
      })
      .then((vysledek) => ({ potvrzeno: !!vysledek }));
  }

  /* ---------------- o aplikaci a menu ---------------- */

  async function info() {
    return {
      verze: "1.0.0",
      slozkaDat: "Tento prohlížeč — data zůstávají jen na tomto zařízení (localStorage), nikam se neposílají.",
      electron: "web",
      node: navigator.userAgent,
    };
  }

  async function otevriSlozkuDat() {
    root.Fx.ui.hlaska("Na mobilu nejsou data v souborech — použijte Export a Import v nastavení.", "chyba");
    return { ok: false };
  }

  root.api = {
    platforma: "web",
    data: { nacti, uloz, zaloha, seznamZaloh, export: exportDat, import: importDat },
    soubor: { ulozText, otevri: async () => ({ ok: true }) },
    pdf: { uloz: (html) => vytisknout(html), tisk: (html) => vytisknout(html) },
    qr: (text) => vytvorQr(text),
    ares: (ico) => najdiIco(ico),
    app: { info, otevriSlozkuDat },
    potvrd: (volby) => potvrd(volby),
    naAkciMenu: () => {
      /* Mobil nemá nativní nabídku aplikace — zkratky z desktopu tu nejsou. */
    },
  };
})(window);
