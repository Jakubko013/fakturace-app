/* Pomůcky pro rozhraní: hlášky, dialogy, opakující se kousky HTML. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;

  const $ = (selektor, kde) => (kde || document).querySelector(selektor);
  const $$ = (selektor, kde) => [...(kde || document).querySelectorAll(selektor)];

  /* ---------------- hlášky ---------------- */

  function hlaska(text, druh) {
    const prvek = document.createElement("div");
    prvek.className = "hlaska" + (druh ? " " + druh : "");
    prvek.textContent = text;
    $("#hlasky").appendChild(prvek);
    const trvani = druh === "chyba" ? 7000 : 3000;
    setTimeout(() => {
      prvek.style.opacity = "0";
    }, trvani);
    setTimeout(() => prvek.remove(), trvani + 400);
  }

  /* ---------------- dialog ---------------- */

  /**
   * Zobrazí dialog a vrátí příslib s hodnotou stisknutého tlačítka
   * (nebo null, když uživatel dialog zavřel).
   * @param {{nadpis:string, telo:string, tlacitka?:Array, poVykresleni?:Function,
   *          predUzavrenim?:Function, sirka?:string}} volby
   */
  function dialog(volby) {
    return new Promise((vrat) => {
      const zastineni = document.createElement("div");
      zastineni.className = "zastineni";
      const tlacitka = volby.tlacitka || [
        { text: "Zrušit", hodnota: null },
        { text: "Uložit", hodnota: true, hlavni: true },
      ];

      zastineni.innerHTML = `
        <div class="dialog" ${volby.sirka ? `style="max-width:${volby.sirka}"` : ""}>
          <h3>${util.esc(volby.nadpis)}</h3>
          <div class="telo">${volby.telo}</div>
          <div class="patka">
            ${tlacitka
              .map(
                (t, i) =>
                  `<button data-index="${i}" class="${t.hlavni ? "hlavni" : ""}${
                    t.nebezpecna ? " nebezpecna" : ""
                  }">${util.esc(t.text)}</button>`
              )
              .join("")}
          </div>
        </div>`;

      const zavri = (hodnota) => {
        document.removeEventListener("keydown", naKlavesu);
        zastineni.remove();
        vrat(hodnota);
      };

      const naKlavesu = (u) => {
        if (u.key === "Escape") zavri(null);
      };

      zastineni.addEventListener("click", (u) => {
        if (u.target === zastineni) zavri(null);
      });

      $$("button[data-index]", zastineni).forEach((tlacitko) => {
        tlacitko.addEventListener("click", async () => {
          const volba = tlacitka[Number(tlacitko.dataset.index)];
          if (volba.hodnota === null) return zavri(null);
          if (volby.predUzavrenim) {
            const vysledek = await volby.predUzavrenim(zastineni, volba);
            if (vysledek === false) return; // dialog zůstane otevřený
            return zavri(vysledek === undefined ? volba.hodnota : vysledek);
          }
          zavri(volba.hodnota);
        });
      });

      document.addEventListener("keydown", naKlavesu);
      $("#dialogy").appendChild(zastineni);
      if (volby.poVykresleni) volby.poVykresleni(zastineni);
      const prvniPole = $("input, select, textarea", zastineni);
      if (prvniPole) prvniPole.focus();
    });
  }

  /** Potvrzení přes systémový dialog — u mazání je nepřehlédnutelné. */
  async function potvrd(zprava, volby) {
    const odpoved = await root.api.potvrd(
      Object.assign({ zprava }, volby || {})
    );
    return odpoved.potvrzeno;
  }

  /* ---------------- opakující se HTML ---------------- */

  function odznak(text, barva) {
    return `<span class="odznak ${barva || "seda"}">${util.esc(text)}</span>`;
  }

  function odznakStavu(stav) {
    const popis = Fx.vypocet.STAVY[stav] || { nazev: stav, barva: "seda" };
    return odznak(popis.nazev, popis.barva);
  }

  function moznosti(polozky, vybrano) {
    return polozky
      .map((p) => {
        const hodnota = typeof p === "object" ? p.hodnota : p;
        const nazev = typeof p === "object" ? p.nazev : p;
        const vybrana = String(hodnota) === String(vybrano) ? " selected" : "";
        return `<option value="${util.esc(hodnota)}"${vybrana}>${util.esc(nazev)}</option>`;
      })
      .join("");
  }

  function prazdno(nadpis, popis, tlacitkoHtml) {
    return `<div class="prazdno">
      <div class="velky">—</div>
      <div class="tucne">${util.esc(nadpis)}</div>
      <div class="mala" style="margin:6px 0 14px">${util.esc(popis || "")}</div>
      ${tlacitkoHtml || ""}
    </div>`;
  }

  /* ---------------- události ---------------- */

  /** Delegované kliknutí — přežije překreslení obsahu. */
  function naKlik(kontejner, selektor, obsluha) {
    kontejner.addEventListener("click", (udalost) => {
      const cil = udalost.target.closest(selektor);
      if (cil && kontejner.contains(cil)) obsluha(udalost, cil);
    });
  }

  function naZmenu(kontejner, selektor, obsluha) {
    kontejner.addEventListener("change", (udalost) => {
      const cil = udalost.target.closest(selektor);
      if (cil && kontejner.contains(cil)) obsluha(udalost, cil);
    });
  }

  function naVstup(kontejner, selektor, obsluha) {
    kontejner.addEventListener("input", (udalost) => {
      const cil = udalost.target.closest(selektor);
      if (cil && kontejner.contains(cil)) obsluha(udalost, cil);
    });
  }

  /* ---------------- ukládání souborů ---------------- */

  async function ulozCsv(obsah, nazev) {
    const vysledek = await root.api.soubor.ulozText(
      obsah,
      util.nazevSouboru(nazev) + ".csv",
      "Tabulka CSV",
      "csv"
    );
    if (vysledek.ok) hlaska("Uloženo do " + vysledek.cesta, "uspech");
    else if (!vysledek.zruseno) hlaska(vysledek.chyba, "chyba");
    return vysledek;
  }

  async function ulozTextovySoubor(obsah, nazev) {
    const vysledek = await root.api.soubor.ulozText(
      obsah,
      util.nazevSouboru(nazev) + ".txt",
      "Textový soubor",
      "txt"
    );
    if (vysledek.ok) hlaska("Uloženo do " + vysledek.cesta, "uspech");
    else if (!vysledek.zruseno) hlaska(vysledek.chyba, "chyba");
    return vysledek;
  }

  /** Zkopíruje text do schránky (pro upomínky a čísla účtu). */
  async function doSchranky(text) {
    try {
      await navigator.clipboard.writeText(text);
      hlaska("Zkopírováno do schránky", "uspech");
      return true;
    } catch (chyba) {
      hlaska("Zkopírování se nepodařilo: " + chyba.message, "chyba");
      return false;
    }
  }

  Fx.ui = {
    $,
    $$,
    hlaska,
    dialog,
    potvrd,
    odznak,
    odznakStavu,
    moznosti,
    prazdno,
    naKlik,
    naZmenu,
    naVstup,
    ulozCsv,
    ulozTextovySoubor,
    doSchranky,
  };
})(window);
