(function (root, tovarna) {
  if (typeof module === "object" && module.exports)
    module.exports = tovarna(require("./util.js"), require("./vypocet.js"));
  else {
    root.Fx = root.Fx || {};
    root.Fx.dph = tovarna(root.Fx.util, root.Fx.vypocet);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (util, vypocetModul) {
  "use strict";

  const { zaokrouhli, cislo, vRozmezi } = util;

  /* Podklady pro přiznání k DPH a kontrolní hlášení.

     Doklady se do období zařazují podle data uskutečnění zdanitelného plnění
     (DUZP) — ne podle data úhrady. Daňová evidence příjmů a výdajů naproti
     tomu jede podle skutečných plateb, proto jsou to dva oddělené přehledy.

     Zálohová faktura se do DPH nepočítá vůbec: není daňový doklad. Daň
     z přijaté zálohy vzniká až daňovým dokladem k přijaté platbě. */

  const LIMIT_KH = 10000; // hranice pro jmenovitý zápis v kontrolním hlášení (vč. daně)

  function prazdnyRadek() {
    return { zaklad: 0, dan: 0 };
  }

  function pricti(radek, zaklad, dan) {
    radek.zaklad = zaokrouhli(radek.zaklad + cislo(zaklad), 2);
    radek.dan = zaokrouhli(radek.dan + cislo(dan), 2);
  }

  function zapocitatFakturu(faktura) {
    if (faktura.typ === "zaloha") return false;
    if (faktura.stav === "koncept" || faktura.stav === "stornovana") return false;
    return true;
  }

  /**
   * Přehled DPH za období. Čísla řádků odpovídají tiskopisu přiznání k DPH.
   */
  function prehledDph(data, od, doData) {
    const vystup = {
      r1: prazdnyRadek(), // dodání zboží / poskytnutí služby v tuzemsku — základní sazba
      r2: prazdnyRadek(), // ...snížená sazba
      r10: prazdnyRadek(), // přijatá plnění v režimu přenesení — základní sazba
      r11: prazdnyRadek(), // ...snížená sazba
      r20: prazdnyRadek(), // dodání zboží do jiného členského státu
      r21: prazdnyRadek(), // poskytnutí služeb s místem plnění v jiném státě EU
      r25: prazdnyRadek(), // režim přenesení daňové povinnosti — dodavatel
      r26: prazdnyRadek(), // ostatní uskutečněná plnění s nárokem na odpočet
    };
    const vstup = {
      r40: prazdnyRadek(), // přijatá zdanitelná plnění — základní sazba
      r41: prazdnyRadek(), // ...snížená sazba
      r43: prazdnyRadek(), // odpočet u plnění podle ř. 10 a 11
      r44: prazdnyRadek(),
    };

    const vydane = [];
    const prijate = [];

    for (const faktura of data.faktury) {
      if (!zapocitatFakturu(faktura)) continue;
      if (!vRozmezi(faktura.duzp || faktura.datumVystaveni, od, doData)) continue;

      const vypocet = vypocetModul.vypocetDokladu(faktura, data.nastaveni);
      vydane.push({ faktura, vypocet });

      if (faktura.rezim === "prenesena") {
        pricti(vystup.r25, vypocet.zakladCelkem, 0);
        continue;
      }
      if (faktura.rezim === "dodaniEu") {
        pricti(vystup.r20, vypocet.zakladCelkem, 0);
        continue;
      }
      if (faktura.rezim === "mimoEu" || faktura.rezim === "osvobozeno") {
        pricti(vystup.r26, vypocet.zakladCelkem, 0);
        continue;
      }
      for (const sazba of vypocet.sazby) {
        if (sazba.sazba >= 20) pricti(vystup.r1, sazba.zaklad, sazba.dph);
        else if (sazba.sazba > 0) pricti(vystup.r2, sazba.zaklad, sazba.dph);
        else pricti(vystup.r26, sazba.zaklad, 0);
      }
    }

    for (const vydaj of data.vydaje) {
      if (!vRozmezi(vydaj.duzp || vydaj.datumVystaveni, od, doData)) continue;
      const rozpis = rozpisVydaje(vydaj);
      if (!rozpis.sazby.length) continue;
      prijate.push({ vydaj, rozpis });

      for (const radek of rozpis.sazby) {
        const zakladni = radek.sazba >= 20;
        if (vydaj.rezim === "prenesena") {
          // Příjemce daň sám přizná (ř. 10/11) a zároveň si ji nárokuje (ř. 43/44).
          pricti(zakladni ? vystup.r10 : vystup.r11, radek.zaklad, radek.dph);
          if (rozpis.odpocetDph) {
            pricti(zakladni ? vstup.r43 : vstup.r44, radek.zaklad, radek.odpocet);
          }
        } else if (rozpis.odpocetDph && radek.sazba > 0) {
          pricti(zakladni ? vstup.r40 : vstup.r41, radek.zaklad, radek.odpocet);
        }
      }
    }

    const danNaVystupu = zaokrouhli(
      vystup.r1.dan + vystup.r2.dan + vystup.r10.dan + vystup.r11.dan,
      2
    );
    const odpocet = zaokrouhli(
      vstup.r40.dan + vstup.r41.dan + vstup.r43.dan + vstup.r44.dan,
      2
    );
    // Výsledek přiznání se uvádí v celých korunách.
    const vysledek = util.naKoruny(danNaVystupu - odpocet);

    return {
      obdobi: { od, do: doData },
      vystup,
      vstup,
      danNaVystupu,
      odpocet,
      vysledek,
      jeNadmernyOdpocet: vysledek < 0,
      doklady: { vydane, prijate },
    };
  }

  /**
   * Rozpis přijatého dokladu po sazbách včetně kráceného nároku na odpočet.
   * Uživatel může u výdaje nastavit poměr (např. auto používané i soukromě).
   */
  function rozpisVydaje(vydaj) {
    const pomer = Math.min(100, Math.max(0, cislo(vydaj.pomerOdpoctu, 100)));
    const odpocetDph = vydaj.odpocetDph !== false && vydaj.rezim !== "bezDph";
    const sazby = (vydaj.zaklady || [])
      .map((radek) => {
        const zaklad = zaokrouhli(cislo(radek.zaklad), 2);
        const sazba = cislo(radek.sazba);
        // Daň buď uživatel opsal z dokladu, nebo se dopočítá ze základu.
        const dph =
          radek.dph !== "" && radek.dph != null
            ? zaokrouhli(cislo(radek.dph), 2)
            : zaokrouhli((zaklad * sazba) / 100, 2);
        return {
          sazba,
          zaklad,
          dph,
          odpocet: odpocetDph ? zaokrouhli((dph * pomer) / 100, 2) : 0,
        };
      })
      .filter((radek) => radek.zaklad !== 0 || radek.dph !== 0);

    const zakladCelkem = zaokrouhli(
      sazby.reduce((s, r) => s + r.zaklad, 0),
      2
    );
    const dphCelkem = zaokrouhli(
      sazby.reduce((s, r) => s + r.dph, 0),
      2
    );
    const odpocetCelkem = zaokrouhli(
      sazby.reduce((s, r) => s + r.odpocet, 0),
      2
    );

    return {
      sazby,
      zakladCelkem,
      dphCelkem,
      celkem: zaokrouhli(zakladCelkem + dphCelkem, 2),
      odpocetDph,
      pomer,
      odpocetCelkem,
      /* Do daňových výdajů patří částka bez nárokované daně — DPH, kterou si
         plátce nárokuje, není jeho náklad. */
      danovyNaklad: zaokrouhli(zakladCelkem + dphCelkem - odpocetCelkem, 2),
    };
  }

  /* ---------------- kontrolní hlášení ---------------- */

  function jeTuzemskyPlatce(dic) {
    return /^CZ\d{8,10}$/.test(String(dic || "").replace(/\s/g, "").toUpperCase());
  }

  /**
   * Rozdělí doklady do oddílů kontrolního hlášení. Jmenovitě se uvádějí
   * doklady nad 10 000 Kč včetně daně, zbytek jen souhrnně.
   */
  function kontrolniHlaseni(data, od, doData) {
    const A1 = [];
    const A4 = [];
    const A5 = { zaklad21: 0, dan21: 0, zaklad12: 0, dan12: 0 };
    const B1 = [];
    const B2 = [];
    const B3 = { zaklad21: 0, dan21: 0, zaklad12: 0, dan12: 0 };

    for (const faktura of data.faktury) {
      if (!zapocitatFakturu(faktura)) continue;
      if (!vRozmezi(faktura.duzp || faktura.datumVystaveni, od, doData)) continue;
      const vypocet = vypocetModul.vypocetDokladu(faktura, data.nastaveni);
      const dic = (faktura.odberatel && faktura.odberatel.dic) || "";

      if (faktura.rezim === "prenesena") {
        A1.push({
          cislo: faktura.cislo,
          dic,
          odberatel: faktura.odberatel.jmeno,
          duzp: faktura.duzp,
          zaklad: vypocet.zakladCelkem,
        });
        continue;
      }
      if (vypocet.dphCelkem === 0) continue; // osvobozená plnění se do KH neuvádějí

      const zaklad21 = soucetSazby(vypocet, 20, 100);
      const zaklad12 = soucetSazby(vypocet, 1, 20);

      if (jeTuzemskyPlatce(dic) && Math.abs(vypocet.kUhrade) > LIMIT_KH) {
        A4.push({
          cislo: faktura.cislo,
          dic,
          odberatel: faktura.odberatel.jmeno,
          duzp: faktura.duzp,
          zaklad21: zaklad21.zaklad,
          dan21: zaklad21.dph,
          zaklad12: zaklad12.zaklad,
          dan12: zaklad12.dph,
          celkem: vypocet.kUhrade,
        });
      } else {
        A5.zaklad21 = zaokrouhli(A5.zaklad21 + zaklad21.zaklad, 2);
        A5.dan21 = zaokrouhli(A5.dan21 + zaklad21.dph, 2);
        A5.zaklad12 = zaokrouhli(A5.zaklad12 + zaklad12.zaklad, 2);
        A5.dan12 = zaokrouhli(A5.dan12 + zaklad12.dph, 2);
      }
    }

    for (const vydaj of data.vydaje) {
      if (!vRozmezi(vydaj.duzp || vydaj.datumVystaveni, od, doData)) continue;
      const rozpis = rozpisVydaje(vydaj);
      if (!rozpis.odpocetDph || !rozpis.sazby.length) continue;
      const dic = (vydaj.dodavatel && vydaj.dodavatel.dic) || "";

      if (vydaj.rezim === "prenesena") {
        B1.push({
          cislo: vydaj.cisloDokladu,
          dic,
          dodavatel: vydaj.dodavatel.jmeno,
          duzp: vydaj.duzp,
          zaklad: rozpis.zakladCelkem,
          dan: rozpis.dphCelkem,
        });
        continue;
      }
      if (rozpis.dphCelkem === 0) continue;

      const r21 = soucetSazbyVydaje(rozpis, 20, 100);
      const r12 = soucetSazbyVydaje(rozpis, 1, 20);

      if (jeTuzemskyPlatce(dic) && Math.abs(rozpis.celkem) > LIMIT_KH) {
        B2.push({
          cislo: vydaj.cisloDokladu,
          dic,
          dodavatel: vydaj.dodavatel.jmeno,
          duzp: vydaj.duzp,
          zaklad21: r21.zaklad,
          dan21: r21.dph,
          zaklad12: r12.zaklad,
          dan12: r12.dph,
          celkem: rozpis.celkem,
        });
      } else {
        B3.zaklad21 = zaokrouhli(B3.zaklad21 + r21.zaklad, 2);
        B3.dan21 = zaokrouhli(B3.dan21 + r21.dph, 2);
        B3.zaklad12 = zaokrouhli(B3.zaklad12 + r12.zaklad, 2);
        B3.dan12 = zaokrouhli(B3.dan12 + r12.dph, 2);
      }
    }

    return { obdobi: { od, do: doData }, A1, A4, A5, B1, B2, B3, limit: LIMIT_KH };
  }

  function soucetSazby(vypocet, odVcetne, doVyloucene) {
    let zaklad = 0;
    let dph = 0;
    for (const s of vypocet.sazby) {
      if (s.sazba >= odVcetne && s.sazba < doVyloucene) {
        zaklad += s.zaklad;
        dph += s.dph;
      }
    }
    return { zaklad: zaokrouhli(zaklad, 2), dph: zaokrouhli(dph, 2) };
  }

  function soucetSazbyVydaje(rozpis, odVcetne, doVyloucene) {
    let zaklad = 0;
    let dph = 0;
    for (const r of rozpis.sazby) {
      if (r.sazba >= odVcetne && r.sazba < doVyloucene) {
        zaklad += r.zaklad;
        dph += r.odpocet ? r.odpocet : 0;
      }
    }
    return { zaklad: zaokrouhli(zaklad, 2), dph: zaokrouhli(dph, 2) };
  }

  /** Období pro přiznání podle nastavení firmy (měsíční / čtvrtletní plátce). */
  function obdobiPrizani(nastaveni, rok, poradi) {
    const ctvrtletni = nastaveni.dph && nastaveni.dph.obdobi === "ctvrtleti";
    return util.obdobi(rok, poradi, ctvrtletni ? "ctvrtleti" : "mesic");
  }

  return {
    LIMIT_KH,
    prehledDph,
    rozpisVydaje,
    kontrolniHlaseni,
    obdobiPrizani,
    jeTuzemskyPlatce,
  };
});
