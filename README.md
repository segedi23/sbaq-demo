# SBAQ, testialusta (demo)

Prototyyppi jääkiekkoilijoiden (ja muiden urheilijoiden) testitulosten syöttöön,
tallennukseen, seurantaan ja vertailuun. **SBAQ = Speed · Balance · Agility · Quickness.**

Tämä on selaimessa toimiva demo synteettisellä datalla. Tarkoitus on näyttää,
miltä valmis työkalu käytännössä näyttäisi. Numerot lasketaan datasta; pelaajat
eivät ole oikeita henkilöitä.

## Käynnistys

Riippumaton kaikista kirjastoista. Palvele kansio staattisesti:

```bash
cd app
python3 -m http.server 8199
# avaa http://localhost:8199
```

(Claude Code: käynnistyy myös `launch.json` konfiguraatiolla `sbaq-demo`.)

## Tiedostot

| Tiedosto | Rooli |
|---|---|
| `generate.mjs` | Synteettisen datan generaattori (Node). Aja `node generate.mjs`, syntyy `data.js` |
| `data.js` | Generoitu aineisto (`window.SBAQ_DATA`), 50 pelaajaa, 375 testiä |
| `index.html`, `styles.css`, `main.js` | Dashboard (lista, pelaajanäkymä, vertailu) |

## Mitä demo näyttää

- **Pelaajalista.** Suodatus iän, sarjan ja tilanteen mukaan, lajittelu, haku.
- **Pelaajanäkymä.** Kehityskaari yli ajan (pisteet väritetty sen sarjan mukaan
  jossa pelaaja kunakin testinä pelasi, ja katkoviivana oman sarjan keskitaso
  joka vaihtuu sarjanousun myötä), merkinnät ja loukkaantumiset aikajanalla,
  testikerrat päivämäärittäin (auki klikkaamalla näkee kaikki tulokset sekä
  pituuden, painon ja sarjatason kyseisen testin aikaan), sarjakohtainen
  vertailu (jokainen testi verrattuna siihen sarjaan jossa silloin pelasi),
  Keiser FVP-profiili, kokoava taulukko ja SBAQ-suhdeluvut. Jokaisella sarjalla
  on oma erottuva värinsä läpi sovelluksen.
- **Uusien tulosten lisäys.** Nappi "Lisää testitulokset" avaa lomakkeen. Uusi
  testi tallentuu selaimen localStorageen ja päivittyy heti näkymiin.
- **Tulostettava analyysi.** Jokaisesta testistä saa "Analyysi ja tulostus"
  -napista (tai testikerran "Raportti"-linkistä) HTML-raportin, joka vertaa
  edelliseen ja lähtötasoon, huomioi loukkaantumisten vaikutuksen ja antaa
  suositukset. Tulostettavissa PDF:ksi selaimen tulostustoiminnolla. Tämä on
  demossa deterministinen luonnos; lopullisessa versiossa AI täydentää narratiivin.
- **Vertailu (pelaajakohtainen).** Valitaan fokuspelaaja, pelipaikka ja sarja.
  Kaksi tilaa:
  - *Hajonta vertailuikänä:* jokaisesta pelaajasta se testi joka on lähimpänä
    valittua vertailuikää, joten esim. 22-vuotiaasta näkyy tulos jonka hän teki
    18-vuotiaana. Väri on sarjataso kyseisen testin aikaan.
  - *Kehityskaari yli ajan:* usean pelaajan kehityskäyrät samassa diagrammissa,
    fokuspelaaja korostettuna.
  Datapistettä tai käyrää klikkaamalla avautuu kyseinen pelaaja. Pelipaikka on
  suodatin (esim. maalivahdit, U20-SM, ikä 18).
- **Roolit.** "Ylläpitäjä näkee kaiken ja voi lisätä" vs. "Pelaaja näkee vain
  omansa" (demo-valitsin ylhäällä).

## Datamalli (ydin)

```
player      : id, nimi, syntymäaika, pelipaikka, currentLeague, annotations[], sessions[]
session     : pvm, ikä, pituus, paino, sarja+taso, measurements{}   (ikä, pituus, paino JOKA testissä)
annotation  : tyyppi (injury/growth/illness/position/...), aikajakso, vakavuus, kuvaus
measurement : cmj/sj (both+O/V), sprint30/10, agility505, ybalance, ankle(O/V), keiser[{load,watts}]
```

## Realismimalli (generaattori)

Testitulokset syntyvät funktiona: **ikä (maturaatio) + sarjataso + yksilöllinen
lahjakkuus + kehitystrendi + kohina.** Lisäksi jokaisella pelaajalla on yksi
kehityskaari-skenaario (steady, plateau, late_bloomer, early_plateau, breakout,
injury_dip, setback), joka taivuttaa dataa. Loukkaantumisjaksot näkyvät
notkahduksina. Tulokset paranevat iän ja sarjatason myötä, mutta hajonta on
tarkoituksellista.

**Sarjataso ei määräydy iästä.** Se valitaan per testi pelaajan lahjakkuuden ja
iän mukaan, junnusarjojen yläikärajoja noudattaen (U15 max 15, U16 max 16,
U18-SM max 18, U20-SM max 20; Liigaan 16-vuotiaasta). Lahjakas nuori voi pelata
Mestiksessä, Liigassa, AHL:ssä tai NHL:ssä. Testihistorian pituus vaihtelee:
osa pelaajista on aloittanut testauksen vasta hiljattain (1 testi), osalla on
pitkä historia (jopa 11 testiä).

Sarjat (taso järjestyksessä): U15-SM, U16-SM, U18-SM, U20-SM, Mestis, OHL,
NCAA, Liiga, AHL, NHL.

## Seuraavat vaiheet (ei vielä toteutettu)

1. **AI-raporttiputki.** Laske numerot datasta, Claude API kirjoittaa tulkinnan,
   renderöi näytekuvien tyylinen deck tai PDF.
2. **Viitearvot.** Julkaistut normit ja kokemusarvot `benchmarks`-tauluun.
3. **Tallennus ja kirjautuminen.** Supabase (Postgres, Auth, roolit), deploy verkkoon.
