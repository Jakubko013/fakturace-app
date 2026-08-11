# fakturace-app

Mobilní/webová verze appky pro fakturaci a daňovou evidenci OSVČ.

Tenhle repozitář je jen **nasazovaný výstup** — zdrojový kód (a desktopová
Electron verze) žije v jiném repozitáři. Sem se generuje skriptem
`mobile/build-pages.js` pokaždé, když se zdroj změní, a nahrazuje celý
obsah kromě `.github/`.

**Živá appka:** https://jakubko013.github.io/fakturace-app/

Otevřít na telefonu a přes „Přidat na plochu“ (iOS Safari) nebo „Instalovat
aplikaci“ (Android Chrome) si appku nainstalovat jako běžnou appku. Data
zůstávají jen v tomto telefonu/prohlížeči (localStorage), nikam se
neposílají.

## Google Play

Appka se dá zabalit i jako opravdová Android appka pro Google Play (TWA) —
postup je v [README-android.md](README-android.md).
