# Sestavení pro Google Play (Android)

Appka se pro Android balí jako **TWA (Trusted Web Activity)** — oficiální
způsob, jak Google doporučuje publikovat webovou appku do Play Storu. Android
appka jen otevře tuhle stránku (`https://jakubko013.github.io/fakturace-app/`)
v prohlížeči bez adresního řádku; appka i web jsou tak pořád ta samá appka,
jedno místo, kde se opravují chyby.

## Co je potřeba udělat jednou

### 1. Přidat dva secrets do repozitáře

**Settings → Secrets and variables → Actions → New repository secret**

| Název | Hodnota |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | obsah souboru `fakturace-upload.keystore.b64`, který jste dostali |
| `ANDROID_KEYSTORE_PASSWORD` | heslo z `keystore-heslo.txt` |

Podpisový klíč (`fakturace-upload.keystore`) je citlivý — je to jediná věc,
kterou Google Play používá k ověření, že aktualizace appky vydává pořád
tentýž vydavatel. **Uložte si soubor a heslo bezpečně** (např. do správce
hesel). Když se ztratí, dá se u Google Play požádat o reset uploadovacího
klíče (appka používá Play App Signing, takže to naštěstí není nevratná
ztráta appky, jen administrativní krok navíc).

### 2. Spustit sestavení

**Actions → Sestavení Android appky (TWA) → Run workflow**

Sestavení trvá pár minut. Výsledek (`app-release-bundle.aab`) se objeví
dole v sekci **Artifacts** běhu — to je soubor, který se nahrává do Play
Console.

## Co je potřeba udělat při každé další verzi appky

Než appku znovu sestavíte, zvyšte v zadání workflow **versionCode** o 1
(Google Play stejné číslo verze podruhé odmítne) a nastavte **versionName**
na novou verzi (např. „1.0.1“).

## Ověření vlastnictví domény (Digital Asset Links)

Aby appka běžela bez adresního řádku prohlížeče (ne jako obyčejná webová
stránka v Chromu), Android musí ověřit, že appka a web `jakubko013.github.io`
patří ke stejnému vydavateli. K tomu slouží `.well-known/assetlinks.json`
v tomhle repozitáři — obsahuje otisk (SHA-256 fingerprint) podpisového
klíče appky a je už nastavený. Pokud byste v budoucnu appku podepsali
jiným klíčem, je potřeba tenhle soubor aktualizovat.

## Co zbývá udělat v Google Play Console (tohle appka/skript neudělá)

1. Založit účet vývojáře na [play.google.com/console](https://play.google.com/console/) —
   jednorázově 25 $, na vaše jméno/firmu.
2. Vytvořit novou appku, nahrát `app-release-bundle.aab`.
3. Vyplnit popis, ikony/screenshoty, zásady ochrany osobních údajů
   (appka žádná osobní data neodesílá nikam — jen ARES na výslovné
   kliknutí — stačí to tak napsat), dotazník o obsahu appky a
   „Data safety“ formulář.
4. Odeslat appku k Google review — u finančních/business appek to
   obvykle trvá pár dní.
