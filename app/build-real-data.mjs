// SBAQ, real measurement set -> app/data.js
//
// Source: the two player development reports in Google Drive (SBAQ/testidat).
// Their charts are raster images, so the values below were taken from the data
// labels printed on the charts, and the unlabelled series were recovered by
// pixel analysis of the plotted markers. That reader was validated against the
// labelled series and agreed to within 0.03 cm / 1 W.
//
// Player names are pseudonyms. Everything else is the real measurement.
//
// Not present in the source, therefore null here rather than invented:
// birth date, age, height, playing position, league level per session, and
// per-session body mass except where a report states it.
//
// Run: node app/build-real-data.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTS = [
  { code: 'cmj',        name: 'CMJ (kahdella)',              category: 'Power',    unit: 'cm',   higherBetter: true, sides: true },
  { code: 'sj',         name: 'Squat Jump (kahdella)',       category: 'Power',    unit: 'cm',   higherBetter: true, sides: true },
  { code: 'snap',       name: 'Single Leg Snap Drive',       category: 'Power',    unit: 'W',    higherBetter: true, sides: true },
  { code: 'snapFixed',  name: 'Snap Drive, vakiokuorma',     category: 'Power',    unit: 'W',    higherBetter: true, sides: true },
  { code: 'keiser',     name: 'Keiser-jalkaprässi (2 jalkaa)', category: 'Strength', unit: 'W',   higherBetter: true, sides: false },
  { code: 'keiserRel',  name: 'Keiser, teho / paino',        category: 'Strength', unit: 'W/kg', higherBetter: true, sides: false },
  { code: 'legPress',   name: 'Leg press (indeksi)',         category: 'Strength', unit: 'idx',  higherBetter: true, sides: false },
];

/* ---------- helpers ---------- */
const d = (dd, mm) => `2026-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

/** Fold a dated series into the per-date session map. */
function put(map, dates, build) {
  dates.forEach((date, i) => {
    const s = (map[date] = map[date] || {});
    Object.assign(s, build(i));
  });
}

function sessionsFrom(map, pid) {
  return Object.keys(map).sort().map((date, i) => {
    const m = map[date];
    return {
      id: `${pid}-s${i + 1}`,
      date,
      ageYears: null,
      heightCm: null,
      weightKg: m.weightKg ?? null,
      league: null,
      leagueLevel: null,
      flagged: false,
      measurements: {
        cmj:       m.cmj       || { both: null, right: null, left: null },
        sj:        m.sj        || { both: null, right: null, left: null },
        snap:      m.snap      || { right: null, left: null },
        snapFixed: m.snapFixed || { right: null, left: null, loadKg: null },
        keiser:    m.keiser    || { watts: null, wattsPerKg: null },
        legPress:  m.legPress ?? null,
      },
    };
  });
}

/* =======================================================================
   Player 1  (source: "onninkehitys 1307.pdf")
   ======================================================================= */
const p1 = {};
{
  const jump = [d(15,4), d(23,4), d(25,5), d(1,6), d(8,6), d(15,6), d(22,6), d(6,7), d(13,7)];
  const cmjB = [48.9, 49.9, 50.0, 53.3, 52.1, 47.4, 54.1, 54.9, 58.3];
  const sjB  = [47.1, 47.2, 46.4, 47.5, 48.3, 46.4, 48.7, 49.1, 50.0];
  const cmjL = [28.1, 28.3, 31.1, 29.1, 28.8, 25.0, 27.4, 30.9, 28.8];
  const cmjR = [29.4, 26.7, 30.0, 28.9, 29.5, 27.0, 25.4, 29.4, 29.3];
  const sjL  = [25.6, 28.9, 25.8, 26.5, 27.7, 25.7, 26.6, 28.4, 26.4];
  const sjR  = [27.5, 29.7, 26.1, 29.3, 23.1, 24.0, 24.6, 27.9, 26.2];
  put(p1, jump, (i) => ({
    cmj: { both: cmjB[i], right: cmjR[i], left: cmjL[i] },
    sj:  { both: sjB[i],  right: sjR[i],  left: sjL[i] },
  }));

  const snapD = [d(1,6), d(8,6), d(11,6), d(15,6), d(6,7), d(13,7)];
  const snapR = [776, 1115, 1523, 1378, 1408, 1492];
  const snapL = [832, 1040, 1533, 1503, 1315, 1558];
  put(p1, snapD, (i) => ({ snap: { right: snapR[i], left: snapL[i] } }));

  const fixD = [d(8,6), d(11,6), d(15,6), d(6,7), d(13,7)];
  const fixR = [1080, 1300, 1344, 1408, 1492];
  const fixL = [923, 1533, 1503, 1315, 1560];
  put(p1, fixD, (i) => ({ snapFixed: { right: fixR[i], left: fixL[i], loadKg: 180 } }));

  // Leg press appears in the source only as an index (8.6. = 100), never as watts.
  const lpD = [d(8,6), d(15,6), d(6,7), d(13,7)];
  const lpV = [100.0, 89.0, 99.5, 100.8];
  put(p1, lpD, (i) => ({ legPress: lpV[i] }));
}

/* =======================================================================
   Player 2  (source: "Aapo_K_kehitys käyrät .pdf")
   ======================================================================= */
const p2 = {};
{
  const twoD = [d(8,5), d(25,5), d(8,6), d(15,6), d(22,6), d(28,6), d(6,7)];
  const cmjB = [48.3, 49.6, 49.6, 51.6, 51.2, 55.4, 54.9];
  const sjB  = [47.2, 47.4, 48.3, 47.8, 44.7, 48.2, 49.4];
  put(p2, twoD, (i) => ({ cmj: { both: cmjB[i] }, sj: { both: sjB[i] } }));

  const oneD = [d(25,5), d(8,6), d(15,6), d(22,6), d(28,6), d(6,7)];
  const cmjL = [28.6, 25.8, 30.2, 25.7, 29.6, 28.1];
  const cmjR = [28.2, 25.6, 27.6, 25.3, 27.3, 29.0];
  const sjL  = [26.1, 25.1, 26.7, 19.9, 24.4, 27.1];
  const sjR  = [25.3, 24.9, 25.3, 20.5, 24.9, 28.6];
  oneD.forEach((date, i) => {
    const s = (p2[date] = p2[date] || {});
    s.cmj = { ...(s.cmj || { both: null }), right: cmjR[i], left: cmjL[i] };
    s.sj  = { ...(s.sj  || { both: null }), right: sjR[i],  left: sjL[i] };
  });

  const snapD = [d(1,6), d(4,6), d(8,6), d(15,6), d(24,6), d(28,6)];
  const snapR = [1132, 1019, 1445, 1422, 1495, 1855];
  const snapL = [1020, 1342, 1435, 1476, 1537, 1762];
  put(p2, snapD, (i) => ({ snap: { right: snapR[i], left: snapL[i] } }));

  const fixD = [d(4,6), d(8,6), d(15,6), d(24,6), d(28,6)];
  const fixR = [1008, 1445, 1422, 1400, 1855];
  const fixL = [1187, 1435, 1476, 1537, 1762];
  put(p2, fixD, (i) => ({ snapFixed: { right: fixR[i], left: fixL[i], loadKg: 160 } }));

  const kD  = [d(8,5), d(25,5), d(1,6), d(8,6), d(15,6), d(24,6), d(28,6), d(6,7)];
  const kW  = [3005, 3171, 2858, 3034, 3415, 3381, 3241, 3169];
  const kWk = [36.9, 38.3, 34.3, 36.3, 40.5, 39.7, 38.0, 36.8];
  put(p2, kD, (i) => ({ keiser: { watts: kW[i], wattsPerKg: kWk[i] } }));

  // Body mass was measured at the ends of the block only. The source interpolates
  // the values in between; those are not measurements, so they stay out.
  p2[d(8,5)].weightKg = 81.4;
  p2[d(6,7)].weightKg = 86.0;
}

/* ---------- players ---------- */
const players = [
  {
    id: 'p1',
    name: 'Miro L.',          // pseudonym
    position: null, sex: 'M', birthDate: null, age: null,
    currentLeague: null, heightCm: null, weightKg: null,
    baseline2025: { cmj: 50.3, sj: 46.6 },
    notes: [
      'Paino nousi jakson aikana +4,5 kg (+5,5 %). Testikertakohtaisia painoja ei ole kirjattu.',
      'Leg press on lähteessä vain indeksinä (8.6. = 100), ei watteina.',
    ],
    annotations: [
      { id: 'p1-a1', type: 'training', startDate: d(8,6), endDate: d(15,6), severity: null,
        title: 'Kova kuormitusjakso',
        note: 'Notkahdus 15.6. testeissä kuormitusjakson jäljiltä, sen jälkeen selvä nousu.' },
    ],
    sessions: sessionsFrom(p1, 'p1'),
  },
  {
    id: 'p2',
    name: 'Eetu R.',          // pseudonym
    position: null, sex: 'M', birthDate: null, age: null,
    currentLeague: null, heightCm: null, weightKg: 86.0,
    baseline2025: { cmj: 54.0, sj: 43.1 },
    notes: [
      'Paino mitattu vain 8.5. (81,4 kg) ja 6.7. (86,0 kg). Lähteen välipainot ovat interpoloituja, eivät mitattuja.',
      'Keiser-teho 8.6. (3034 W) on luettu kuvaajasta, arvoa ei ollut merkitty näkyviin.',
      'Keiser yhdellä jalalla on lähteessä vain päätepisteinä: 24,7 → 22,7 W/kg.',
    ],
    annotations: [
      { id: 'p2-a1', type: 'training', startDate: d(15,6), endDate: d(24,6), severity: null,
        title: 'Kova kuormitusjakso',
        note: 'Notkahdus 22.–24.6. kuormitusjakson jäljiltä, sen jälkeen selvä nousu.' },
    ],
    sessions: sessionsFrom(p2, 'p2'),
  },
];

for (const p of players) {
  const L = p.sessions[p.sessions.length - 1];
  p.weightKg = p.weightKg ?? L.weightKg ?? null;
}

const data = {
  meta: {
    generatedFor: 'SBAQ, Speed · Balance · Agility · Quickness',
    dataset: 'real',
    todayIso: '2026-07-13',
    playerCount: players.length,
    pseudonymised: true,
    source: 'Kehitysraportit kevät–kesä 2026. Nimet pseudonymisoitu, mittausarvot alkuperäisiä.',
    hasAges: false,
    hasLeagues: false,
  },
  leagues: [],
  tests: TESTS,
  players,
};

const out = '// AUTO-GENERATED by build-real-data.mjs, do not edit by hand.\n'
  + 'window.SBAQ_DATA = ' + JSON.stringify(data) + ';\n';
writeFileSync(join(__dirname, 'data.js'), out);

const n = players.reduce((a, p) => a + p.sessions.length, 0);
console.log(`data.js: ${players.length} pelaajaa, ${n} testikertaa`);
