/* Sestavení tisknutelného dokladu.

   Výsledkem je samostatná HTML stránka, která se posílá hlavnímu procesu
   k tisku nebo k uložení do PDF. Nesmí odkazovat na nic zvenčí — logo
   i QR kód jsou vložené jako data URL, styly přímo v dokumentu. */
(function (root) {
  "use strict";
  const Fx = (root.Fx = root.Fx || {});
  const util = Fx.util;
  const esc = util.esc;

  const STYL = `
  @page { size: A4; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.45; color: #16223a;
    background: #eef1f6;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .list {
    width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff;
    padding: 14mm 15mm 12mm; position: relative;
  }
  @media print { body { background:#fff; } .list { margin:0; box-shadow:none; } }
  @media screen { .list { box-shadow: 0 4px 24px rgba(0,0,0,.18); margin: 12px auto; } }
  /* Náhled na telefonu: dokument musí zůstat přesně A4 kvůli tisku, tak se
     na obrazovce jen zmenší, ať se do širokého displeje vejde celý. "zoom"
     na rozdíl od transform:scale přepočítá i výšku, takže pod dokladem
     nezbyde prázdné místo — v Chromu a Safari (iOS/Android) funguje. */
  @media screen and (max-width: 480px) { body { overflow-x: hidden; } .list { zoom: 0.42; margin: 8px auto; } }
  @media screen and (min-width: 481px) and (max-width: 820px) { body { overflow-x: hidden; } .list { zoom: 0.62; margin: 8px auto; } }

  .zahlavi { display:flex; align-items:flex-start; gap:16mm; border-bottom:2px solid #16223a; padding-bottom:6mm; }
  .zahlavi .logo img { max-height:22mm; max-width:60mm; display:block; }
  .zahlavi .logo .jmeno { font-size:15pt; font-weight:700; letter-spacing:-.01em; }
  .zahlavi .nazev { margin-left:auto; text-align:right; }
  .zahlavi .nazev h1 { font-size:16pt; font-weight:700; letter-spacing:-.01em; }
  .zahlavi .nazev .cislo { font-size:13pt; font-weight:600; color:#2563eb; margin-top:1mm; }
  .zahlavi .nazev .podtitul { font-size:8.5pt; color:#6b7a90; margin-top:1mm; }

  .strany { display:flex; gap:10mm; margin-top:7mm; }
  .strana { flex:1; }
  .strana .stitek { font-size:8pt; text-transform:uppercase; letter-spacing:.08em; color:#7d8aa3; font-weight:700; margin-bottom:2mm; }
  .strana .jmeno { font-size:11.5pt; font-weight:700; }
  .strana .radek { font-size:9.5pt; color:#3c4a63; }
  .strana .ic { margin-top:2mm; font-size:9.5pt; }

  .udaje { display:flex; gap:0; margin-top:7mm; border:1px solid #dbe2ee; border-radius:2mm; overflow:hidden; }
  .udaje .bunka { flex:1; padding:2.5mm 3mm; border-right:1px solid #dbe2ee; }
  .udaje .bunka:last-child { border-right:none; }
  .udaje .stitek { font-size:7.5pt; text-transform:uppercase; letter-spacing:.06em; color:#7d8aa3; font-weight:700; }
  .udaje .hodnota { font-size:10pt; font-weight:600; margin-top:.5mm; }
  .udaje .hodnota.duraz { color:#2563eb; }

  .uvod { margin-top:6mm; font-size:10pt; color:#3c4a63; }

  table.polozky { width:100%; border-collapse:collapse; margin-top:3mm; }
  table.polozky th {
    font-size:7.5pt; text-transform:uppercase; letter-spacing:.06em; color:#7d8aa3;
    text-align:left; padding:2mm 2mm; border-bottom:1.5px solid #16223a; font-weight:700;
  }
  table.polozky td { padding:2mm 2mm; border-bottom:1px solid #e8edf5; font-size:9.5pt; vertical-align:top; }
  table.polozky .cislo { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  table.polozky .popis { font-weight:600; }
  table.polozky tr.bezokraje td { border-bottom:none; }

  .spodek { display:flex; gap:8mm; margin-top:6mm; align-items:flex-start; }
  .spodek .vlevo { flex:1; }
  .spodek .vpravo { width:78mm; flex:0 0 78mm; }

  table.rekapitulace { width:100%; border-collapse:collapse; font-size:9pt; }
  table.rekapitulace th { font-size:7.5pt; text-transform:uppercase; letter-spacing:.05em; color:#7d8aa3; text-align:right; padding:1.5mm 2mm; border-bottom:1px solid #dbe2ee; font-weight:700; }
  table.rekapitulace th:first-child { text-align:left; }
  table.rekapitulace td { padding:1.5mm 2mm; text-align:right; border-bottom:1px solid #eef1f6; font-variant-numeric:tabular-nums; }
  table.rekapitulace td:first-child { text-align:left; }

  .souhrn .radek { display:flex; justify-content:space-between; gap:6mm; padding:1.2mm 0; font-size:10pt; font-variant-numeric:tabular-nums; }
  .souhrn .radek.tlumeny { color:#6b7a90; font-size:9pt; }
  .souhrn .celkem {
    display:flex; justify-content:space-between; gap:6mm; align-items:baseline;
    margin-top:2mm; padding:3mm; background:#16223a; color:#fff; border-radius:2mm;
    font-size:11pt; font-weight:600;
  }
  .souhrn .celkem span { white-space:nowrap; }
  .souhrn .celkem b { font-size:15pt; font-variant-numeric:tabular-nums; white-space:nowrap; }

  .platba { border:1px solid #dbe2ee; border-radius:2mm; padding:3mm; display:flex; gap:4mm; align-items:center; }
  .platba .qr img { width:30mm; height:30mm; display:block; }
  .platba .qr .stitek { font-size:7pt; text-align:center; color:#7d8aa3; margin-top:1mm; }
  .platba .udaje-platby { font-size:9.5pt; }
  .platba .udaje-platby div { padding:.4mm 0; }
  .platba .udaje-platby .stitek { color:#7d8aa3; font-size:8pt; text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
  .platba .udaje-platby b { font-variant-numeric:tabular-nums; }

  .poznamka { margin-top:6mm; font-size:9.5pt; color:#3c4a63; }
  .poznamka .stitek { font-size:7.5pt; text-transform:uppercase; letter-spacing:.06em; color:#7d8aa3; font-weight:700; margin-bottom:1mm; }
  .rezim-text { margin-top:4mm; padding:2.5mm 3mm; background:#f3f6fc; border-left:3px solid #2563eb; font-size:9.5pt; }
  .vystraha { margin-top:4mm; padding:2.5mm 3mm; background:#fdf3e0; border-left:3px solid #b7791f; font-size:9.5pt; }

  .podpisy { display:flex; gap:20mm; margin-top:12mm; }
  .podpisy div { flex:1; text-align:center; font-size:8.5pt; color:#7d8aa3; }
  .podpisy .cara { border-top:1px solid #b9c3d4; padding-top:1.5mm; }

  .patka {
    position:absolute; left:15mm; right:15mm; bottom:8mm;
    border-top:1px solid #e8edf5; padding-top:2.5mm;
    font-size:8pt; color:#7d8aa3; display:flex; justify-content:space-between; gap:6mm;
  }
  `;

  /* ---------------- části dokumentu ---------------- */

  function adresaHtml(strana) {
    const radky = [];
    if (strana.ulice) radky.push(esc(strana.ulice));
    const mesto = [strana.psc, strana.mesto].filter(Boolean).join(" ");
    if (mesto) radky.push(esc(mesto));
    if (strana.zeme && strana.zeme !== "Česká republika") radky.push(esc(strana.zeme));
    return radky.map((r) => `<div class="radek">${r}</div>`).join("");
  }

  function identifikaceHtml(strana) {
    const casti = [];
    if (strana.ico) casti.push(`IČO: <b>${esc(strana.ico)}</b>`);
    if (strana.dic) casti.push(`DIČ: <b>${esc(strana.dic)}</b>`);
    if (!casti.length) return "";
    return `<div class="ic">${casti.join("&nbsp;&nbsp;·&nbsp;&nbsp; ")}</div>`;
  }

  function udajeHtml(faktura, nastaveni) {
    const bunky = [
      { stitek: "Datum vystavení", hodnota: util.datumCz(faktura.datumVystaveni) },
    ];
    // Zdanitelné plnění se uvádí jen na daňovém dokladu.
    if (faktura.typ !== "zaloha" && nastaveni.firma.plateceDph) {
      bunky.push({ stitek: "Datum zdanitelného plnění", hodnota: util.datumCz(faktura.duzp) });
    }
    bunky.push({
      stitek: "Datum splatnosti",
      hodnota: util.datumCz(faktura.datumSplatnosti),
      duraz: true,
    });
    bunky.push({
      stitek: "Forma úhrady",
      hodnota: Fx.model.FORMY_UHRADY[faktura.formaUhrady] || faktura.formaUhrady,
    });
    return `<div class="udaje">${bunky
      .map(
        (b) => `<div class="bunka">
          <div class="stitek">${esc(b.stitek)}</div>
          <div class="hodnota${b.duraz ? " duraz" : ""}">${esc(b.hodnota || "—")}</div>
        </div>`
      )
      .join("")}</div>`;
  }

  function polozkyHtml(vypocet, bezDane) {
    const sloupceDph = !bezDane;
    const hlavicka = `
      <tr>
        <th style="width:44%">Označení dodávky</th>
        <th class="cislo">Množství</th>
        <th class="cislo">Cena za MJ</th>
        ${sloupceDph ? '<th class="cislo">DPH</th>' : ""}
        <th class="cislo">${sloupceDph ? "Celkem bez DPH" : "Celkem"}</th>
      </tr>`;

    const radky = vypocet.radky
      .map((radek) => {
        const sleva = radek.slevaProc
          ? `<div style="font-size:8.5pt;color:#7d8aa3">sleva ${util.formatMnozstvi(
              radek.slevaProc
            )} %</div>`
          : "";
        return `<tr>
          <td><div class="popis">${util.escViceradkove(radek.popis || "—")}</div>${sleva}</td>
          <td class="cislo">${util.formatMnozstvi(radek.mnozstvi)} ${esc(radek.jednotka || "")}</td>
          <td class="cislo">${util.formatCislo(radek.cenaZaMj)}</td>
          ${sloupceDph ? `<td class="cislo">${util.formatMnozstvi(radek.sazba)} %</td>` : ""}
          <td class="cislo">${util.formatCislo(radek.zaklad)}</td>
        </tr>`;
      })
      .join("");

    return `<table class="polozky"><thead>${hlavicka}</thead><tbody>${radky}</tbody></table>`;
  }

  function rekapitulaceHtml(vypocet) {
    if (vypocet.bezDane || !vypocet.sazby.length) return "";
    return `
      <div style="font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#7d8aa3;font-weight:700;margin-bottom:1.5mm">
        Rekapitulace DPH
      </div>
      <table class="rekapitulace">
        <thead><tr><th>Sazba</th><th>Základ</th><th>DPH</th><th>Celkem</th></tr></thead>
        <tbody>
          ${vypocet.sazby
            .map(
              (s) => `<tr>
                <td>${util.formatMnozstvi(s.sazba)} %</td>
                <td>${util.formatCislo(s.zaklad)}</td>
                <td>${util.formatCislo(s.dph)}</td>
                <td>${util.formatCislo(s.celkem)}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function souhrnHtml(faktura, vypocet, mena) {
    const radky = [];
    if (!vypocet.bezDane) {
      radky.push({ nazev: "Základ daně", hodnota: vypocet.zakladCelkem });
      radky.push({ nazev: "DPH celkem", hodnota: vypocet.dphCelkem });
    } else {
      radky.push({ nazev: "Celkem", hodnota: vypocet.zakladCelkem });
    }
    for (const odpocet of vypocet.odpocty) {
      radky.push({
        nazev: (odpocet.popis || "Odpočet zálohy") + (odpocet.cislo ? ` ${odpocet.cislo}` : ""),
        hodnota: -odpocet.castka,
      });
    }
    if (vypocet.zaokrouhleni) {
      radky.push({ nazev: "Zaokrouhlení", hodnota: vypocet.zaokrouhleni, tlumeny: true });
    }

    const uhrazeno =
      vypocet.zaplaceno > 0
        ? `<div class="radek tlumeny"><span>Již uhrazeno</span><span>${util.formatCislo(
            vypocet.zaplaceno
          )} ${esc(mena)}</span></div>`
        : "";

    return `<div class="souhrn">
      ${radky
        .map(
          (r) => `<div class="radek${r.tlumeny ? " tlumeny" : ""}">
            <span>${esc(r.nazev)}</span><span>${util.formatCislo(r.hodnota)} ${esc(mena)}</span>
          </div>`
        )
        .join("")}
      ${uhrazeno}
      <div class="celkem">
        <span>${vypocet.zaplaceno > 0 ? "Zbývá uhradit" : "Celkem k úhradě"}</span>
        <b>${util.formatCislo(
          vypocet.zaplaceno > 0 ? vypocet.zbyvaUhradit : vypocet.kUhrade
        )} ${esc(mena)}</b>
      </div>
    </div>`;
  }

  function platbaHtml(faktura, nastaveni, qrDataUrl) {
    const banka = nastaveni.banka || {};
    const ucet = banka.ucet || "";
    const iban = banka.iban || Fx.validace.ucetNaIban(ucet);
    if (!ucet && !iban) return "";
    if (faktura.formaUhrady === "hotove") return "";

    const radky = [];
    if (ucet) radky.push({ stitek: "Číslo účtu", hodnota: ucet });
    if (iban) radky.push({ stitek: "IBAN", hodnota: Fx.validace.formatIban(iban) });
    if (banka.swift) radky.push({ stitek: "SWIFT / BIC", hodnota: banka.swift });
    const vs = faktura.vs || Fx.validace.vsZCisla(faktura.cislo);
    if (vs) radky.push({ stitek: "Variabilní symbol", hodnota: vs });

    const qr = qrDataUrl
      ? `<div class="qr">
           <img src="${qrDataUrl}" alt="QR platba">
           <div class="stitek">QR platba</div>
         </div>`
      : "";

    return `<div class="platba">
      ${qr}
      <div class="udaje-platby">
        ${radky
          .map(
            (r) => `<div><span class="stitek">${esc(r.stitek)}</span><br><b>${esc(
              r.hodnota
            )}</b></div>`
          )
          .join("")}
      </div>
    </div>`;
  }

  function poznamkyHtml(faktura, nastaveni, vypocet) {
    const casti = [];

    const rezim = Fx.vypocet.REZIMY[faktura.rezim];
    if (rezim && rezim.bezDane && rezim.text && nastaveni.firma.plateceDph) {
      casti.push(`<div class="rezim-text">${esc(rezim.text)}</div>`);
    }
    if (!nastaveni.firma.plateceDph) {
      casti.push(`<div class="rezim-text">Nejsem plátcem DPH.</div>`);
    }
    if (faktura.typ === "zaloha") {
      casti.push(
        `<div class="vystraha">Zálohová faktura není daňový doklad. Daňový doklad bude vystaven po přijetí platby.</div>`
      );
    }
    if (faktura.typ === "dobropis" && faktura.opravovanyDoklad) {
      casti.push(
        `<div class="rezim-text">Opravný daňový doklad k faktuře ${esc(
          faktura.opravovanyDoklad
        )}.</div>`
      );
    }
    if (faktura.objednavka) {
      casti.push(
        `<div class="poznamka"><div class="stitek">Objednávka</div>${esc(faktura.objednavka)}</div>`
      );
    }
    if (faktura.poznamka) {
      casti.push(
        `<div class="poznamka"><div class="stitek">Poznámka</div>${util.escViceradkove(
          faktura.poznamka
        )}</div>`
      );
    }
    return casti.join("");
  }

  function patkaHtml(nastaveni) {
    const firma = nastaveni.firma;
    const vlevo = [firma.jmeno, firma.rejstrik].filter(Boolean).join(" · ");
    const vpravo = [firma.tel, firma.email, firma.web].filter(Boolean).join(" · ");
    return `<div class="patka"><span>${esc(vlevo)}</span><span>${esc(vpravo)}</span></div>`;
  }

  /* ---------------- celý doklad ---------------- */

  /**
   * Sestaví HTML dokladu. QR kód se generuje v hlavním procesu, proto async.
   */
  async function htmlDokladu(faktura, data) {
    const nastaveni = data.nastaveni;
    const vypocet = Fx.vypocet.vypocetDokladu(faktura, nastaveni);
    const firma = nastaveni.firma;
    const odberatel = faktura.odberatel || {};
    // Na tištěném dokladu se česká měna uvádí zkratkou Kč.
    const mena = (faktura.mena || "CZK") === "CZK" ? "Kč" : faktura.mena;

    let qrDataUrl = "";
    if (nastaveni.faktura.qrPlatba !== false) {
      const platba = Fx.platba.platbaKFakture(faktura, vypocet, nastaveni);
      if (platba) {
        const odpoved = await root.api.qr(Fx.platba.retezecSpd(platba));
        if (odpoved.ok) qrDataUrl = odpoved.dataUrl;
      }
    }

    const logo = firma.logo
      ? `<img src="${firma.logo}" alt="">`
      : `<div class="jmeno">${esc(firma.jmeno || "")}</div>`;

    const nazevTypu = Fx.model.nazevDokladu(faktura.typ, firma.plateceDph);

    return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>${esc(nazevTypu)} ${esc(faktura.cislo || "")}</title>
<style>${STYL}</style>
</head>
<body>
<div class="list">
  <div class="zahlavi">
    <div class="logo">${logo}</div>
    <div class="nazev">
      <h1>${esc(nazevTypu)}</h1>
      <div class="cislo">č. ${esc(faktura.cislo || "—")}</div>
      ${
        faktura.vs || Fx.validace.vsZCisla(faktura.cislo)
          ? `<div class="podtitul">Variabilní symbol ${esc(
              faktura.vs || Fx.validace.vsZCisla(faktura.cislo)
            )}</div>`
          : ""
      }
    </div>
  </div>

  <div class="strany">
    <div class="strana">
      <div class="stitek">Dodavatel</div>
      <div class="jmeno">${esc(firma.jmeno || "")}</div>
      ${adresaHtml(firma)}
      ${identifikaceHtml(firma)}
    </div>
    <div class="strana">
      <div class="stitek">Odběratel</div>
      <div class="jmeno">${esc(odberatel.jmeno || "")}</div>
      ${adresaHtml(odberatel)}
      ${identifikaceHtml(odberatel)}
    </div>
  </div>

  ${udajeHtml(faktura, nastaveni)}

  ${
    faktura.textPredPolozkami
      ? `<div class="uvod">${util.escViceradkove(faktura.textPredPolozkami)}</div>`
      : ""
  }

  ${polozkyHtml(vypocet, vypocet.bezDane)}

  <div class="spodek">
    <div class="vlevo">
      ${rekapitulaceHtml(vypocet)}
      <div style="margin-top:4mm">${platbaHtml(faktura, nastaveni, qrDataUrl)}</div>
    </div>
    <div class="vpravo">${souhrnHtml(faktura, vypocet, mena)}</div>
  </div>

  ${poznamkyHtml(faktura, nastaveni, vypocet)}

  ${
    nastaveni.faktura.patka
      ? `<div class="poznamka">${util.escViceradkove(nastaveni.faktura.patka)}</div>`
      : ""
  }

  <div class="podpisy">
    <div><div class="cara">Vystavil</div></div>
    <div><div class="cara">Převzal</div></div>
  </div>

  ${patkaHtml(nastaveni)}
</div>
</body>
</html>`;
  }

  /* ---------------- tisk a uložení ---------------- */

  async function ulozPdf(faktura, data) {
    const html = await htmlDokladu(faktura, data);
    const nazev =
      util.nazevSouboru(
        `${Fx.model.NAZVY_TYPU_KRATCE[faktura.typ] || "Faktura"}-${faktura.cislo || "koncept"}-${
          (faktura.odberatel && faktura.odberatel.jmeno) || ""
        }`
      ) + ".pdf";
    const odpoved = await root.api.pdf.uloz(html, nazev);
    if (odpoved.ok) {
      Fx.ui.hlaska(
        root.api.platforma === "web"
          ? "Otevřel se tiskový dialog — zvolte Uložit jako PDF."
          : "PDF uloženo do " + odpoved.cesta,
        "uspech"
      );
    } else if (!odpoved.zruseno) {
      Fx.ui.hlaska("PDF se nepodařilo uložit: " + odpoved.chyba, "chyba");
    }
    return odpoved;
  }

  async function tisk(faktura, data) {
    const html = await htmlDokladu(faktura, data);
    return root.api.pdf.tisk(html);
  }

  Fx.doklad = { htmlDokladu, ulozPdf, tisk };
})(window);
