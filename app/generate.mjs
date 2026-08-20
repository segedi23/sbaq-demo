// SBAQ demo, synthetic data generator
// Produces ~50 realistic players (ages 12-26) across leagues, with test
// histories that (a) improve with age, (b) correlate with league level,
// (c) vary per player via distinct career scenarios AND variable history
// length, and (d) carry annotations (injuries, illness, growth spurts).
//
// League is decided PER SESSION from the player's talent and age, subject to
// junior age caps (a 19-year-old cannot appear in U18-SM). A talented young
// player can already be in Liiga / AHL / NHL.
//
// Output: app/data-demo.js -> window.SBAQ_DATA = { ... }
// Run: node app/generate.mjs
//
// NOTE: the app loads app/data.js, which is the real measurement set built by
// build-real-data.mjs. This generator writes a separate file so that running it
// cannot overwrite real data. Swap the <script> tag in app/index.html to use it.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---------- deterministic RNG (mulberry32) ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260707);
const rnd = (a, b) => a + (b - a) * rand();
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function gauss(mean = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/* ---------- leagues (level = competitive strength; min/max = playing age) ---------- */
const LEAGUES = [
  { code: 'U15-SM', name: 'U15 SM-sarja', level: 0.5, min: 12, max: 15 },
  { code: 'U16-SM', name: 'U16 SM-sarja', level: 0.8, min: 14, max: 16 },
  { code: 'U18-SM', name: 'U18 SM-sarja', level: 1.0, min: 14, max: 18 },
  { code: 'U20-SM', name: 'U20 SM-sarja', level: 2.0, min: 16, max: 20 },
  { code: 'Mestis', name: 'Mestis',        level: 2.5, min: 16, max: 99 },
  { code: 'OHL',    name: 'OHL (major junior)', level: 3.0, min: 16, max: 20 },
  { code: 'NCAA',   name: 'NCAA (college)',     level: 3.5, min: 18, max: 24 },
  { code: 'Liiga',  name: 'Liiga',        level: 4.0, min: 16, max: 99 },
  { code: 'AHL',    name: 'AHL',          level: 4.5, min: 18, max: 99 },
  { code: 'NHL',    name: 'NHL',          level: 5.0, min: 17, max: 99 },
];
const leagueLevel = (code) => LEAGUES.find((l) => l.code === code).level;

// A player's "playing level" at a given age, driven by talent T (~0.1..1.3).
function targetLevel(a, T) {
  const growth = clamp((a - 12) / 12, 0, 1.2);
  return 0.2 + growth * (1.1 + T * 3.4) + T * 0.9;
}
// Pick the age-eligible league whose level is closest to the target.
function leagueForSession(a, T, noise) {
  const target = targetLevel(a, T) + noise;
  const elig = LEAGUES.filter((l) => a >= l.min - 0.3 && Math.floor(a + 1e-6) <= l.max);
  if (!elig.length) return 'U15-SM';
  let best = elig[0], bd = Infinity;
  for (const l of elig) { const d = Math.abs(l.level - target); if (d < bd) { bd = d; best = l; } }
  return best.code;
}

/* ---------- test catalogue: the SBAQ battery ---------- */
const TESTS = [
  { code: 'cmj',        name: 'CMJ (kahdella)',        category: 'Power',    unit: 'cm',  higherBetter: true,  sides: true,  loads: false },
  { code: 'sj',         name: 'Squat Jump (kahdella)', category: 'Power',    unit: 'cm',  higherBetter: true,  sides: true,  loads: false },
  { code: 'sprint30',   name: '30 m juoksu',           category: 'Speed',    unit: 's',   higherBetter: false, sides: false, loads: false },
  { code: 'sprint10',   name: '10 m kiihdytys',        category: 'Quickness',unit: 's',   higherBetter: false, sides: false, loads: false },
  { code: 'agility505', name: '505-ketteryys',         category: 'Agility',  unit: 's',   higherBetter: false, sides: true,  loads: false },
  { code: 'ybalance',   name: 'Y-tasapaino (komposiitti)', category: 'Balance', unit: '%', higherBetter: true, sides: false, loads: false },
  { code: 'ankle',      name: 'Nilkan liikkuvuus',     category: 'Mobility', unit: 'cm',  higherBetter: true,  sides: true,  loads: false },
  { code: 'keiser',     name: 'Keiser leg press (teho)', category: 'Strength', unit: 'W', higherBetter: true,  sides: false, loads: true },
];

const POSITIONS = ['Hyökkääjä', 'Puolustaja', 'Maalivahti'];
const SCENARIOS = ['steady', 'injury_dip', 'plateau', 'late_bloomer', 'early_plateau', 'setback', 'breakout'];

const FIRST = ['Leo','Eino','Onni','Väinö','Niilo','Aaro','Elias','Oliver','Rasmus','Miro','Joel','Aleksi','Kasper','Veeti','Lenni','Otto','Daniel','Julius','Anton','Roope','Konsta','Peetu','Eemil','Samu','Niko','Topias','Verneri','Aatos','Luka','Emil','Jere','Santeri','Patrik','Kalle','Tuomas','Ville','Henrik','Markus','Teemu','Joonas','Sakari','Iiro','Kristian','Valtteri','Mikael','Aleksanteri','Juho','Eetu','Arttu','Casimir'];
const LAST = ['Sinisaari','Kettunen','Virtanen','Korhonen','Mäkinen','Nieminen','Heikkinen','Laine','Koskinen','Järvinen','Lehtonen','Hämäläinen','Kallio','Rantanen','Pulkkinen','Aalto','Salminen','Ojala','Manninen','Tuominen','Karjalainen','Lehtinen','Saarinen','Huhtala','Väisänen','Peltola','Halonen','Toivonen','Räsänen','Savolainen','Kinnunen','Nurmi','Leppänen','Anttila','Hakala','Ahonen','Turunen','Määttä','Pesonen','Hiltunen','Sipilä','Jokinen','Väänänen','Vainio','Kokko','Nykänen','Laakso','Mattila','Suominen','Immonen'];

/* ---------- dates (fixed "today" so runs are reproducible) ---------- */
const TODAY = new Date('2026-06-30T00:00:00Z');
const DAY = 86400000;
const YEAR = 365.25 * DAY;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const ageAt = (birth, date) => (date.getTime() - birth.getTime()) / YEAR;

/* ---------- anthropometrics ---------- */
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}
const baseHeight = (a) => interp([[11,146],[12,152],[13,159],[14,166],[15,172],[16,177],[17,180],[18,182],[19,183.5],[20,184.5],[21,185],[26,185.5]], a);
const baseWeight = (a) => interp([[11,38],[12,42],[13,49],[14,56],[15,63],[16,70],[17,76],[18,81],[19,84],[20,86.5],[21,88],[26,90]], a);

/* ---------- metric baselines by age ---------- */
const baseCMJ = (a) => interp([[11,26],[13,31],[15,37],[17,43],[19,47],[21,50],[23,51.5],[26,52.5]], a);
const baseSprint30 = (a) => interp([[11,5.4],[13,5.0],[15,4.7],[17,4.45],[19,4.28],[21,4.18],[23,4.12],[26,4.08]], a);
const baseSprint10 = (a) => interp([[11,2.15],[13,2.05],[15,1.95],[17,1.85],[19,1.78],[21,1.73],[23,1.70],[26,1.68]], a);
const base505 = (a) => interp([[11,2.75],[13,2.6],[15,2.48],[17,2.38],[19,2.30],[21,2.24],[23,2.21],[26,2.19]], a);
const baseBalance = (a) => interp([[11,84],[13,87],[15,90],[17,93],[19,95.5],[21,97],[23,98],[26,98.5]], a);
const baseWattsPerKg = (a) => interp([[11,14],[13,18],[15,23],[17,28],[19,32],[21,35],[23,37],[26,38]], a);

/* ---------- scenario -> per-session progression ---------- */
function progression(scenario, n) {
  const p = new Array(n).fill(0);
  let injury = null;
  const lin = (i) => i / (n - 1 || 1);
  for (let i = 0; i < n; i++) {
    const t = lin(i);
    switch (scenario) {
      case 'steady':        p[i] = 0.15 + t * 1.0; break;
      case 'plateau':       p[i] = 0.5 + t * 0.2; break;
      case 'late_bloomer':  p[i] = 0.1 + Math.pow(t, 2.2) * 1.25; break;
      case 'early_plateau': p[i] = Math.pow(t, 0.45) * 0.95; break;
      case 'breakout':      p[i] = 0.2 + (t < 0.55 ? t * 0.5 : 0.28 + (t - 0.55) * 2.2); break;
      case 'injury_dip':    p[i] = 0.15 + t * 1.0; break;
      case 'setback':       p[i] = 0.15 + t * 1.0; break;
      default:              p[i] = t;
    }
  }
  if (scenario === 'injury_dip' && n >= 4) {
    const s = rndInt(1, Math.max(1, n - 3));
    const e = Math.min(n - 1, s + rndInt(1, 2));
    injury = [s, e];
    for (let i = s; i <= e; i++) p[i] -= rnd(0.55, 0.9);
    for (let i = e + 1; i < n; i++) p[i] -= Math.max(0, 0.35 - (i - e) * 0.18);
  }
  if (scenario === 'setback' && n >= 3) {
    const s = n - rndInt(1, 2);
    injury = [s, n - 1];
    for (let i = s; i < n; i++) p[i] -= rnd(0.5, 0.85);
  }
  return { p, injury };
}

/* ---------- annotations ---------- */
const INJURIES = [
  ['Nilkan nyrjähdys', 'ankle'], ['Nivusvamma', 'core'], ['Polven rasitusvamma', 'leg'],
  ['Säärimurtuma', 'leg'], ['Olkapään sijoiltaanmeno', 'upper'], ['Lihasrevähdys (takareisi)', 'leg'],
  ['Aivotärähdys', 'head'], ['Selän alaosan kipu', 'core'], ['Rannemurtuma', 'upper'],
];
const OTHER_EVENTS = [
  ['Kasvupyrähdys', 'growth', 'Nopea pituuskasvu, koordinaatio ja teho notkahtavat hetkellisesti.'],
  ['Sairastelujakso', 'illness', 'Pitkittynyt flunssa, harjoittelu katkonaista.'],
  ['Pelipaikan vaihto', 'position', 'Uusi rooli kentällä, fysiikkaprofiilin painotus muuttuu.'],
  ['Leirijakso / lisäharjoittelu', 'training', 'Tehostettu voima- ja nopeusjakso.'],
  ['Kausitauko', 'rest', 'Pidempi lepojakso kauden jälkeen.'],
];

/* ---------- build one player ---------- */
let annId = 1;
function withSides(base, asym) {
  const strongRight = rand() < 0.5;
  const hi = base * (1 + asym / 2), lo = base * (1 - asym / 2);
  return { both: null, right: r1((strongRight ? hi : lo) + gauss(0, 0.15)), left: r1((strongRight ? lo : hi) + gauss(0, 0.15)) };
}
function buildPlayer(idx) {
  const id = 'p' + String(idx + 1).padStart(3, '0');
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const position = rand() < 0.12 ? 'Maalivahti' : pick(['Hyökkääjä', 'Hyökkääjä', 'Puolustaja']);
  const age = r1(rnd(12, 26));
  const birth = new Date(TODAY.getTime() - age * YEAR - rndInt(0, 200) * DAY);

  // talent: talentZ drives performance offsets (+/-), T drives league level.
  const talentZ = clamp(gauss(0, 1), -2.4, 2.6);
  let T = clamp(0.45 + talentZ * 0.22, 0.08, 1.2);
  if (rand() < 0.06) T = clamp(T + 0.35, 0, 1.3); // a few exceptional talents
  const leagueNoise = gauss(0, 0.22);             // persistent, keeps career smooth
  const scenario = pick(SCENARIOS);
  const asym = clamp(Math.abs(gauss(0, 0.045)) + (scenario === 'injury_dip' ? 0.03 : 0), 0.005, 0.16);
  const hOff = gauss(0, 4.5), wOff = gauss(0, 4.0), wattsKgOff = gauss(0, 3.2);
  const ankleBase = clamp(12.5 + gauss(0, 3.2), 6, 21);

  // VARIABLE history length: some players only started recently.
  const startedRecently = rand() < 0.28;
  let historyYears = startedRecently ? rnd(0.5, 1.6) : rnd(1.6, 4.5);
  historyYears = clamp(Math.min(historyYears, age - 12 + 0.3), 0.3, 4.5);
  const perYear = pick([2, 2, 3]);
  const nSessions = clamp(Math.round(historyYears * perYear), 1, 11);
  const { p: prog, injury } = progression(scenario, nSessions);

  const lastDate = addDays(TODAY, -rndInt(10, 120));
  const gap = (historyYears * YEAR) / (nSessions - 1 || 1);

  const annotations = [];
  const sessions = [];
  for (let i = 0; i < nSessions; i++) {
    const date = nSessions === 1 ? lastDate : new Date(lastDate.getTime() - (nSessions - 1 - i) * gap + gauss(0, 6) * DAY);
    const a = ageAt(birth, date);
    const league = leagueForSession(a, T, leagueNoise + gauss(0, 0.15));
    const lvl = leagueLevel(league);
    const lvlBonus = (lvl - 2) * 1.4;

    const height = r1(clamp(baseHeight(a) + hOff, 140, 200));
    const weight = r1(clamp(baseWeight(a) + wOff + talentZ * 1.2, 34, 105));
    const pr = prog[i];

    const cmjBoth = clamp(baseCMJ(a) + lvlBonus + talentZ * 3 + pr * 5.5 + gauss(0, 0.9), 20, 62);
    const sjBoth = cmjBoth * clamp(0.93 + gauss(0, 0.015), 0.86, 0.98);
    const cmj = withSides(cmjBoth * 0.5, asym); cmj.both = r1(cmjBoth);
    const sj = withSides(sjBoth * 0.5, asym); sj.both = r1(sjBoth);

    const spd30 = clamp(baseSprint30(a) - (lvl - 2) * 0.03 - talentZ * 0.05 - pr * 0.18 + gauss(0, 0.03), 3.9, 5.8);
    const spd10 = clamp(baseSprint10(a) - (lvl - 2) * 0.012 - talentZ * 0.02 - pr * 0.07 + gauss(0, 0.02), 1.6, 2.3);
    const ag = base505(a) - (lvl - 2) * 0.02 - talentZ * 0.03 - pr * 0.09 + gauss(0, 0.02);
    const agSides = withSides(ag, asym * 0.6); agSides.both = r2(clamp(ag, 2.1, 2.9));
    agSides.right = r2(agSides.right); agSides.left = r2(agSides.left);

    const bal = clamp(baseBalance(a) + (lvl - 2) * 0.8 + talentZ * 1.2 + pr * 4 + gauss(0, 1.1), 78, 102);
    const ankle = withSides(ankleBase + pr * 0.6 + gauss(0, 0.5), asym * 0.4);

    const wpk = clamp(baseWattsPerKg(a) + (lvl - 2) * 1.6 + talentZ * 2.4 + wattsKgOff + pr * 3.5, 12, 46);
    const load1 = Math.round(weight * 2.4 / 5) * 5, load2 = Math.round(weight * 3.6 / 5) * 5;
    const w1 = Math.round(weight * wpk * clamp(1 + gauss(0, 0.03), 0.9, 1.1));
    const w2 = Math.round(w1 * clamp(0.80 + gauss(0, 0.02), 0.72, 0.88));

    const inInjury = injury && i >= injury[0] && i <= injury[1];
    sessions.push({
      id: `${id}-s${i + 1}`, date: iso(date), ageYears: r1(a), heightCm: height, weightKg: weight,
      league, leagueLevel: lvl, flagged: !!inInjury,
      measurements: {
        cmj, sj, sprint30: r2(spd30), sprint10: r2(spd10), agility505: agSides,
        ybalance: r1(bal), ankle,
        keiser: [{ loadKg: load1, watts: w1 }, { loadKg: load2, watts: w2 }],
      },
    });
  }

  if (injury) {
    const [s, e] = injury;
    const [title, region] = pick(INJURIES);
    const start = addDays(new Date(sessions[s].date), -rndInt(5, 30));
    const end = e < nSessions - 1 ? addDays(new Date(sessions[e].date), rndInt(2, 20)) : null;
    annotations.push({
      id: 'a' + annId++, type: 'injury', region, startDate: iso(start), endDate: end ? iso(end) : null,
      severity: pick(['lievä', 'kohtalainen', 'vakava']), title,
      note: `${title}. Vaikuttaa räjähtävyyteen ja kuormituksensietoon. Tulosten notkahdus tällä jaksolla on odotettua.`,
    });
  }
  if (rand() < 0.4 && nSessions >= 2) {
    const [title, type, note] = pick(OTHER_EVENTS);
    const si = rndInt(0, nSessions - 1);
    const start = addDays(new Date(sessions[si].date), -rndInt(0, 25));
    annotations.push({
      id: 'a' + annId++, type, startDate: iso(start),
      endDate: type === 'growth' || type === 'position' ? null : iso(addDays(start, rndInt(20, 90))),
      severity: null, title, note,
    });
  }

  const latest = sessions[sessions.length - 1];
  return {
    id, name, position, sex: 'M', birthDate: iso(birth), age: latest.ageYears,
    currentLeague: latest.league, scenario, heightCm: latest.heightCm, weightKg: latest.weightKg,
    annotations, sessions,
  };
}

/* ---------- build dataset ---------- */
const players = [];
for (let i = 0; i < 50; i++) players.push(buildPlayer(i));
players.sort((a, b) => a.name.localeCompare(b.name, 'fi'));

const data = {
  meta: { generatedFor: 'SBAQ, Speed · Balance · Agility · Quickness', todayIso: iso(TODAY), playerCount: players.length },
  leagues: LEAGUES,
  tests: TESTS,
  players,
};

const out = `// AUTO-GENERATED by generate.mjs, do not edit by hand.\nwindow.SBAQ_DATA = ${JSON.stringify(data)};\n`;
writeFileSync(join(__dirname, 'data-demo.js'), out);

/* ---------- sanity summary ---------- */
const byLeague = {}, byScenario = {}, sessCounts = [];
let injuryCount = 0;
for (const p of players) {
  byLeague[p.currentLeague] = (byLeague[p.currentLeague] || 0) + 1;
  byScenario[p.scenario] = (byScenario[p.scenario] || 0) + 1;
  sessCounts.push(p.sessions.length);
  injuryCount += p.annotations.filter((a) => a.type === 'injury').length;
}
console.log(`Generated ${players.length} players, ${sessCounts.reduce((a, c) => a + c, 0)} test sessions.`);
console.log('Current league:', byLeague);
console.log('Scenarios:', byScenario);
console.log('Sessions per player: min', Math.min(...sessCounts), 'max', Math.max(...sessCounts), 'avg', r1(sessCounts.reduce((a, c) => a + c, 0) / players.length));
console.log('Players with injury annotation:', injuryCount, '| Age range:', Math.min(...players.map((p) => p.age)), 'to', Math.max(...players.map((p) => p.age)));
