# SBAQ, testialusta

Työkalu jääkiekkoilijoiden (ja muiden urheilijoiden) testitulosten syöttöön,
tallennukseen, seurantaan ja vertailuun. **SBAQ = Speed · Balance · Agility · Quickness.**

Selaimessa toimiva, riippumaton kaikista kirjastoista. Kaksi osaa: julkinen
esittelysivu ja sen takana varsinainen työkalu.

## Käynnistys

```bash
python3 -m http.server 8199
# esittelysivu:  http://localhost:8199/
# työkalu:       http://localhost:8199/app/
```

## Tiedostot

| Tiedosto | Rooli |
|---|---|
| `index.html`, `site.css`, `site.js` | Julkinen esittelysivu (etusivu). `site.js` pyörittää kuvasarjat |
| `img/` | Harjoituskuvat mustavalkoisina ja rajattuina niin, ettei kasvoja näy (landmine-sarjassa pää on häivytetty). Nimetty harjoitteen mukaan, ei pelaajien nimiä. `tyokalu-kehityskaari.webp` on kuvakaappaus osoitteesta `app/#p1` |
| `app/kirjaudu.html` | Esittelykirjautuminen: tunnukset valmiiksi täytettynä (Timo Salo), salasanaa ei tarkisteta, mitään ei lähetetä. Merkitsee istunnon avatuksi (`sessionStorage`), `app/index.html` ohjaa tänne ilman sitä |
| `app/index.html`, `app/styles.css`, `app/main.js` | Dashboard (lista, pelaajanäkymä, vertailu, raportti). Suorat linkit: `app/#p1`, `app/#vertailu` |
| `app/data.js` | **Käytössä oleva aineisto** (`window.SBAQ_DATA`). Generoitu tiedostosta `build-real-data.mjs` |
| `app/build-real-data.mjs` | Oikeat mittaustulokset -> `app/data.js`. Aja `node app/build-real-data.mjs` |
| `app/generate.mjs` | Synteettisen demodatan generaattori -> `app/data-demo.js` (ei käytössä oletuksena) |

## Data

Aineisto on **oikeita mittaustuloksia** kevään ja kesän 2026 testijaksolta:
kaksi pelaajaa, 20 testikertaa. **Pelaajien nimet on pseudonymisoitu**,
mittausarvot ovat alkuperäisiä.

Lähde on kaksi kehitysraporttia, joiden kuvaajat ovat rasterikuvia. Arvot on
otettu kuvaajiin merkityistä lukuarvoista, ja merkitsemättömät sarjat on purettu
pikselianalyysillä. Lukija validoitiin merkittyjä sarjoja vasten, ja poikkeama
oli alle 0,03 cm / 1 W.

**Mitä lähteessä ei ole**, eikä siis ole täällä keksittynä: syntymäaika, ikä,
pituus, pelipaikka, sarjataso per testikerta, sekä painot muualta kuin niistä
kohdista joissa raportti ne kertoo. Sovellus tunnistaa nämä puutteet
(`meta.hasAges`, `meta.hasLeagues`) ja piilottaa ikään ja sarjatasoon nojaavat
näkymät sen sijaan että näyttäisi tyhjiä tai harhaanjohtavia lukuja.

Demodataan voi vaihtaa ajamalla `node app/generate.mjs` ja osoittamalla
`app/index.html`:n script-tagi tiedostoon `data-demo.js`.

## Testipatteristo

| Testi | Yksikkö | Puolet |
|---|---|---|
| CMJ (kahdella ja yhdellä) | cm | kyllä |
| Squat Jump (kahdella ja yhdellä) | cm | kyllä |
| Single Leg Snap Drive, tehohuippu | W | kyllä |
| Snap Drive, vakiokuorma | W | kyllä |
| Keiser-jalkaprässi (2 jalkaa) | W ja W/kg | ei |
| Leg press | indeksi | ei |

Sport Labin täysi patteristo kattaa lisäksi hapenottotestin, valokennomittaukset
salilla ja jäällä sekä valoreaktiotestit. Ne tulevat mukaan, kun aineistoa on.

## Mitä työkalu näyttää

- **Pelaajalista.** Haku, suodatus ja lajittelu. Ikä- ja sarjasuodattimet
  näkyvät vain jos aineistossa on ne tiedot.
- **Pelaajanäkymä.** Kehityskaari yli ajan, vertailutasona pelaajan oma
  edellisen kauden taso (tai sarjan keskitaso, jos vertailujoukko on olemassa).
  Merkinnät aikajanalla, testikerrat päivämäärittäin, puolierot ja niiden
  kehitys, kokoava taulukko ja SBAQ-suhdeluvut.
- **Uusien tulosten lisäys.** Tyhjä kenttä tarkoittaa "ei mitattu", ei nollaa.
  Uusi testi tallentuu selaimen localStorageen.
- **Tulostettava analyysi.** Raportti vertaa edelliseen kertaan ja lähtötasoon,
  huomioi merkinnät ja antaa suositukset. Deterministinen luonnos; lopullisessa
  versiossa AI täydentää narratiivin.
- **Vertailu.** Usean pelaajan kehityskäyrät samassa diagrammissa. Ikä-täsmätty
  hajontanäkymä vaatii ikätiedot, ja piiloutuu ilman niitä.
- **Roolit.** Ylläpitäjä näkee kaiken ja voi lisätä, pelaaja näkee vain omansa.

## Datamalli (ydin)

```
player      : id, nimi, syntymäaika?, pelipaikka?, currentLeague?, baseline2025?,
              notes[], annotations[], sessions[]
session     : pvm, ikä?, pituus?, paino?, sarja+taso?, measurements{}
annotation  : tyyppi (injury/growth/illness/position/training/...), aikajakso, title, note
measurement : cmj/sj {both,right,left}, snap {right,left},
              snapFixed {right,left,loadKg}, keiser {watts,wattsPerKg}, legPress
```

`?` = voi olla `null`. Puuttuva mittaus on `null`, ei nolla.

## Synteettinen demodata (generate.mjs)

Vanha demogeneraattori on tallella. Se tuottaa 50 pelaajaa, joilla on ikä ja
sarjataso jokaisessa testissä, ja jotka käyttävät demon alkuperäistä
patteristoa (30 m juoksu, Y-tasapaino, nilkan liikkuvuus, Keiser-kuormaprofiili).
Nykyinen `main.js` on kirjoitettu oikean patteriston mukaan, joten demodata
vaatisi generaattorin päivittämisen samaan mittausmalliin ennen kuin se toimii.

## Seuraavat vaiheet (ei vielä toteutettu)

1. **Taustatiedot testikertoihin.** Ikä, pituus, paino ja sarjataso jokaiselle
   testikerralle. Ne avaavat ikä- ja sarjavertailut, jotka ovat nyt piilossa.
2. **Loput Sport Labin patteristosta.** Hapenottotesti, valokennot salilla ja
   jäällä, valoreaktiotestit.
3. **Viitearvot.** Julkaistut normit ja kokemusarvot `benchmarks`-tauluun.
   Huom: eri testiprotokollien W/kg-lukuja ei voi verrata keskenään.
4. **AI-raporttiputki.** Laske numerot datasta, Claude API kirjoittaa tulkinnan.
5. **Tallennus ja kirjautuminen.** Supabase (Postgres, Auth, roolit).

## Tietosuoja

Repo on julkinen. Aineistossa on oikeita mittaustuloksia, joten **nimet on
pseudonymisoitu** eikä tunnistavia taustatietoja (seura, joukkue, leirit,
turnaukset) ole viety mukaan. Jos aineistoon lisätään syntymäajat tai muuta
yksilöivää tietoa, repo on syytä muuttaa privaatiksi ensin.
