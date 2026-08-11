(function (root, tovarna) {
  if (typeof module === "object" && module.exports) module.exports = tovarna();
  else {
    root.Fx = root.Fx || {};
    root.Fx.util = tovarna();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---------------- čísla ---------------- */

  /** Číslo z uživatelského vstupu — bere i "1 234,50". */
  function cislo(hodnota, vychozi = 0) {
    if (typeof hodnota === "number") return Number.isFinite(hodnota) ? hodnota : vychozi;
    // \s pokrývá i pevnou mezeru U+00A0, kterou používá české formátování tisíců.
    const text = String(hodnota ?? "")
      .replace(/\s/g, "")
      .replace(",", ".");
    const n = Number(text);
    return Number.isFinite(n) ? n : vychozi;
  }

  /* Účetní zaokrouhlení: půlka vždy nahoru co do absolutní hodnoty,
     aby -2,225 dalo -2,23 stejně jako 2,225 dá 2,23. Prostý Math.round
     zaokrouhluje záporná čísla k nule a u dobropisů by to dělalo haléřové
     rozdíly proti vydané faktuře. */
  function zaokrouhli(hodnota, desetinnychMist = 2) {
    const n = cislo(hodnota);
    if (!Number.isFinite(n)) return 0;
    const nasobek = Math.pow(10, desetinnychMist);
    // 1e-9 srovná drobné nepřesnosti dvojkové aritmetiky (0,145 * 100 = 14,499…)
    const posunute = Math.abs(n) * nasobek;
    const vysledek = Math.round(posunute + 1e-9) / nasobek;
    return n < 0 ? -vysledek : vysledek;
  }

  /** Zaokrouhlení na celé koruny (pro celkovou částku dokladu). */
  function naKoruny(hodnota) {
    return zaokrouhli(hodnota, 0);
  }

  /* ---------------- formátování ---------------- */

  function formatCislo(hodnota, desetinnychMist = 2) {
    return cislo(hodnota).toLocaleString("cs-CZ", {
      minimumFractionDigits: desetinnychMist,
      maximumFractionDigits: desetinnychMist,
    });
  }

  /** Množství se zobrazuje bez zbytečných nul: 2 ks, 2,5 hod. */
  function formatMnozstvi(hodnota) {
    return cislo(hodnota).toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
  }

  function kc(hodnota, desetinnychMist = 2) {
    return formatCislo(hodnota, desetinnychMist) + " Kč";
  }

  /* ---------------- datumy ---------------- */

  function dnesISO() {
    return doISO(new Date());
  }

  function doISO(datum) {
    const d = datum instanceof Date ? datum : new Date(datum);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /* Datum držíme jako "YYYY-MM-DD" a při počítání ho vždy stavíme v poledne.
     Kdyby se použila půlnoc, posun letního času by ve výsledku ubral den. */
  function zISO(iso) {
    if (!iso) return null;
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function datumCz(iso) {
    const d = zISO(iso);
    return d ? d.toLocaleDateString("cs-CZ") : "";
  }

  function pridejDny(iso, dny) {
    const d = zISO(iso);
    if (!d) return "";
    d.setDate(d.getDate() + Number(dny || 0));
    return doISO(d);
  }

  function pridejMesice(iso, mesice) {
    const d = zISO(iso);
    if (!d) return "";
    const den = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + Number(mesice || 0));
    // Když cílový měsíc nemá tolik dní (31. leden + měsíc), vezmi jeho konec.
    const posledniDen = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(den, posledniDen));
    return doISO(d);
  }

  /** Kolik dní uplynulo od data do dneška (kladné = je to v minulosti). */
  function dnuOd(iso, kDatu) {
    const a = zISO(iso);
    const b = zISO(kDatu || dnesISO());
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function vRozmezi(iso, od, doData) {
    if (!iso) return false;
    const d = String(iso).slice(0, 10);
    if (od && d < od) return false;
    if (doData && d > doData) return false;
    return true;
  }

  /** První a poslední den měsíce nebo čtvrtletí — pro přehledy DPH. */
  function obdobi(rok, cislo1az12, typ) {
    if (typ === "ctvrtleti") {
      const prvniMesic = (cislo1az12 - 1) * 3;
      const od = new Date(rok, prvniMesic, 1);
      const doData = new Date(rok, prvniMesic + 3, 0);
      return { od: doISO(od), do: doISO(doData) };
    }
    const od = new Date(rok, cislo1az12 - 1, 1);
    const doData = new Date(rok, cislo1az12, 0);
    return { od: doISO(od), do: doISO(doData) };
  }

  /* ---------------- text ---------------- */

  function esc(text) {
    return String(text ?? "").replace(
      /[&<>"']/g,
      (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[z]
    );
  }

  /** Odřádkování v uživatelském textu na <br> (text je předtím escapovaný). */
  function escViceradkove(text) {
    return esc(text).replace(/\r?\n/g, "<br>");
  }

  function id(prefix = "x") {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function kopie(objekt) {
    return JSON.parse(JSON.stringify(objekt));
  }

  /** Odstraní diakritiku — pro vyhledávání a názvy souborů. */
  function bezDiakritiky(text) {
    return String(text ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function nazevSouboru(text) {
    return bezDiakritiky(text)
      .replace(/[^\w\-. ]+/g, "_")
      .replace(/\s+/g, "-")
      .replace(/_+/g, "_")
      .slice(0, 80);
  }

  /** Skloňování: 1 den, 2 dny, 5 dní. */
  function sklonuj(pocet, jedna, dva, pet) {
    const n = Math.abs(Number(pocet));
    if (n === 1) return jedna;
    if (Number.isInteger(n) && n >= 2 && n <= 4) return dva;
    return pet;
  }

  return {
    cislo,
    zaokrouhli,
    naKoruny,
    formatCislo,
    formatMnozstvi,
    kc,
    dnesISO,
    doISO,
    zISO,
    datumCz,
    pridejDny,
    pridejMesice,
    dnuOd,
    vRozmezi,
    obdobi,
    esc,
    escViceradkove,
    id,
    kopie,
    bezDiakritiky,
    nazevSouboru,
    sklonuj,
  };
});
