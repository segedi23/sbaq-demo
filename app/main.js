'use strict';
/* SBAQ demo dashboard. Dependency-free. Reads window.SBAQ_DATA. */

const D = window.SBAQ_DATA;
/* The dashboard was built for a synthetic set where every player had an age and
   a league on every session. Real measurement sheets carry neither, so each
   view that needs them is gated on these instead of guessing values. */
const HAS_AGES = D.players.some((p) => p.age != null);
const HAS_LEAGUES = (D.leagues || []).length > 0 && D.players.some((p) => p.currentLeague != null);
/* Percentile and league-average comparisons need a population to compare with. */
const HAS_PEERS = HAS_AGES && HAS_LEAGUES && D.players.length >= 4;
const $ = (sel, el = document) => el.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const YEAR = 365.25 * 86400000;

/* ---------- metric definitions ---------- */
/* `get` returns null whenever the test was not part of that session, so every
   view has to cope with gaps: the real battery is not run in full every time. */
const sideAvg = (o) => (o == null || o.right == null || o.left == null)
  ? null : Math.round(((o.right + o.left) / 2) * 10) / 10;
const METRICS = [
  { code: 'cmj',       label: 'CMJ (kahdella)',           unit: 'cm',   hb: true, get: (s) => s.measurements.cmj.both },
  { code: 'sj',        label: 'Squat Jump (kahdella)',    unit: 'cm',   hb: true, get: (s) => s.measurements.sj.both },
  { code: 'cmj1',      label: 'CMJ (yhdellä, ka)',        unit: 'cm',   hb: true, get: (s) => sideAvg(s.measurements.cmj) },
  { code: 'sj1',       label: 'Squat Jump (yhdellä, ka)', unit: 'cm',   hb: true, get: (s) => sideAvg(s.measurements.sj) },
  { code: 'snap',      label: 'Snap Drive (tehohuippu)',  unit: 'W',    hb: true, get: (s) => sideAvg(s.measurements.snap) },
  { code: 'snapFixed', label: 'Snap Drive (vakiokuorma)', unit: 'W',    hb: true, get: (s) => sideAvg(s.measurements.snapFixed) },
  { code: 'keiser',    label: 'Keiser-jalkaprässi',       unit: 'W',    hb: true, get: (s) => s.measurements.keiser.watts },
  { code: 'keiserRel', label: 'Keiser, teho / paino',     unit: 'W/kg', hb: true, get: (s) => s.measurements.keiser.wattsPerKg },
  { code: 'legPress',  label: 'Leg press (indeksi)',      unit: 'idx',  hb: true, get: (s) => s.measurements.legPress },
];
/* Which metrics any session in the data actually carries. With a real battery
   most players will not have every test, and empty chips are noise. */
const metricsPresent = (players) =>
  METRICS.filter((m) => players.some((p) => p.sessions.some((s) => m.get(s) != null)));
const metric = (code) => METRICS.find((m) => m.code === code);
const avg = (a, b) => Math.round(((a + b) / 2) * 10) / 10;

/* ---------- helpers ---------- */
const parseD = (iso) => new Date(iso + 'T00:00:00Z');
const fmtD = (iso) => { const d = parseD(iso); return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${String(d.getUTCFullYear()).slice(2)}`; };
const fmtDLong = (iso) => { const d = parseD(iso); return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`; };
const num = (v, unit) => v == null ? '-' : Number(v).toFixed(unit === 's' ? 2 : unit === 'W' ? 0 : 1);
const leagueOf = (code) => D.leagues.find((l) => l.code === code) || { code, name: code, level: 0 };
// distinct, clearly separable colour per league
const LEAGUE_COLORS = {
  'U15-SM': '#9198a6', 'U16-SM': '#8496c2', 'U18-SM': '#7ba4c4', 'U20-SM': '#6bb6c2',
  'Mestis': '#d29a6a', 'OHL': '#a99bc7', 'NCAA': '#cf95ac', 'Liiga': '#86b892',
  'AHL': '#cbb06a', 'NHL': '#cd8a7d',
};
const leagueColor = (code) => LEAGUE_COLORS[code] || '#8896ab';
const leagueBadge = (code) => { const c = leagueColor(code); return `<span class="badge" style="color:${c};border-color:${c}">${esc(code)}</span>`; };
const leagueSwatch = (code) => `<span class="lg-swatch" style="background:${leagueColor(code)}"></span>`;
const first = (p) => p.sessions[0];
const last = (p) => p.sessions[p.sessions.length - 1];

function improvement(p, m) {
  if (p.sessions.length < 2) return null;
  const b = m.get(first(p)), l = m.get(last(p));
  if (b == null || l == null || b === 0) return null;
  return (m.hb ? (l - b) / b : (b - l) / b) * 100;
}
/* the session whose age is closest to a target age (within tolerance) */
function nearestSession(q, age, tol = 1.5) {
  let best = null, bd = Infinity;
  for (const s of q.sessions) { const d = Math.abs(s.ageYears - age); if (d < bd) { bd = d; best = s; } }
  return best && bd <= tol ? best : null;
}
function trendHtml(pct) {
  if (pct == null) return '<span class="trend-flat">-</span>';
  if (pct > 1.5) return `<span class="trend-up">▲ ${pct.toFixed(1)}%</span>`;
  if (pct < -1.5) return `<span class="trend-down">▼ ${Math.abs(pct).toFixed(1)}%</span>`;
  return `<span class="trend-flat">≈ ${pct.toFixed(1)}%</span>`;
}
/* Percentile rank of `value` within a peer group (peers EXCLUDE the player).
   The player is included in the population and mid-ranks are used, so the
   lowest of a small group is not forced to 0 %; only a genuinely bottom result
   in a large group approaches 0. Groups smaller than 3 peers return null. */
function percentileRank(value, peers, hb) {
  const pop = (peers || []).filter((v) => v != null);
  if (value == null || pop.length < 3) return null;
  const below = pop.filter((v) => (hb ? v < value : v > value)).length;
  const equalPeers = pop.filter((v) => v === value).length;
  const n = pop.length + 1;                        // include the player
  const rank = below + 0.5 * (equalPeers + 1);     // mid-rank, self is a tie
  return Math.max(1, Math.min(99, Math.round((rank / n) * 100)));
}
function pctClass(p) { return p == null ? '' : p >= 66 ? 'good' : p >= 33 ? 'warn' : 'bad'; }
function diffHtml(now, ref, m) {
  const d = now - ref;
  const better = m.hb ? d >= 0 : d <= 0;
  const txt = (d > 0 ? '+' : '') + d.toFixed(m.unit === 's' ? 2 : 1);
  return `<span class="${better ? 'good' : 'bad'}">${txt} ${m.unit}</span>`;
}

/* Age-matched peers in the SAME league the player currently plays in. For each
   other player we take the session closest to THIS player's current age, so a
   22-year-old contributes the value from when they were the same age. */
function leaguePeerValues(p, m) {
  const lg = last(p).league;
  if (!HAS_PEERS) return { values: [], league: lg };
  return { values: matchedValuesAtAgeLeague(p.age, lg, m, p.id), league: lg };
}
/* Age-matched comparison set: for every player, the session closest to
   `compareAge`. Optionally restrict to a league (the league the player was in
   AT that age), or 'same' = same league as the focus player at that age. */
function comparisonSet(focus, compareAge, m, leagueFilter) {
  const set = [];
  for (const q of D.players) {
    const s = nearestSession(q, compareAge, 1.5);
    if (!s) continue;
    const val = m.get(s);
    if (val == null) continue;
    set.push({ p: q, s, age: s.ageYears, val, league: s.league, level: leagueOf(s.league).level, self: q.id === focus.id });
  }
  const focal = set.find((d) => d.self);
  let filtered = set;
  if (leagueFilter === 'same' && focal) filtered = set.filter((d) => d.league === focal.league);
  else if (leagueFilter && leagueFilter !== 'same') filtered = set.filter((d) => d.league === leagueFilter);
  return { set, filtered, focal };
}

/* ---------- persistence (localStorage) ----------
   added:      user-created sessions               { playerId: [session...] }
   overrides:  edits to existing sessions by id     { sessionId: {fields...} }
   annots:     user-created annotations             { playerId: [annotation...] } */
const ADDED_KEY = 'sbaq_added_v1';
const OVR_KEY = 'sbaq_overrides_v1';
const ANN_KEY = 'sbaq_annots_v1';
const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function persistAdded(pid, session) { const all = loadJSON(ADDED_KEY); (all[pid] = all[pid] || []).push(session); saveJSON(ADDED_KEY, all); }
function persistOverride(sid, data) { const all = loadJSON(OVR_KEY); all[sid] = data; saveJSON(OVR_KEY, all); }
function persistAnnot(pid, ann) { const all = loadJSON(ANN_KEY); (all[pid] = all[pid] || []).push(ann); saveJSON(ANN_KEY, all); }
function removeAnnotStore(pid, annId) { const all = loadJSON(ANN_KEY); if (all[pid]) { all[pid] = all[pid].filter((a) => a.id !== annId); saveJSON(ANN_KEY, all); } }

function refreshDerived(p) {
  p.sessions.sort((a, b) => parseD(a.date) - parseD(b.date));
  const L = last(p);
  p.age = L.ageYears; p.currentLeague = L.league;
  p.heightCm = L.heightCm; p.weightKg = L.weightKg ?? p.weightKg;
}
function mergeAll() {
  const added = loadJSON(ADDED_KEY);
  for (const pid in added) {
    const p = D.players.find((x) => x.id === pid);
    if (!p) continue;
    const have = new Set(p.sessions.map((s) => s.id));
    for (const s of added[pid]) if (!have.has(s.id)) p.sessions.push(s);
  }
  const ov = loadJSON(OVR_KEY);
  for (const p of D.players) for (const s of p.sessions) if (ov[s.id]) Object.assign(s, ov[s.id]);
  const ann = loadJSON(ANN_KEY);
  for (const pid in ann) {
    const p = D.players.find((x) => x.id === pid);
    if (!p) continue;
    const have = new Set(p.annotations.map((a) => a.id));
    for (const a of ann[pid]) if (!have.has(a.id)) p.annotations.push(a);
  }
  for (const p of D.players) refreshDerived(p);
}

/* ---------- app state ---------- */
const state = {
  view: 'roster', playerId: null, metric: 'cmj', compareMetric: 'cmj',
  focusId: null, compareAge: null, compareLeague: '', comparePosition: '', compareMode: 'scatter',
  reportSid: null, leagueRef: true,
  role: 'admin', selfId: null,
  q: '', ageF: '', leagueF: '', statusF: '', sortKey: 'name', sortDir: 1,
};

function openPlayer(id) { state.view = 'player'; state.playerId = id; render(); }
function openReport(pid, sid) { state.view = 'report'; state.playerId = pid; state.reportSid = sid; render(); window.scrollTo({ top: 0 }); }
/* age-matched peer values at a specific age + league (for a given session).
   Wider age window (default ±2.5 v) so the comparison group is big enough for a
   meaningful percentile. */
function matchedValuesAtAgeLeague(age, league, m, excludeId, tol = 2.5) {
  if (!HAS_PEERS || age == null || league == null) return [];
  const vals = [];
  for (const q of D.players) {
    if (q.id === excludeId) continue;
    const s = nearestSession(q, age, tol);
    if (s && s.league === league) { const v = m.get(s); if (v != null) vals.push(v); }
  }
  return vals;
}

/* ---------- role selector ---------- */
function initRole() {
  const sel = $('#roleSelect');
  const injured = D.players.filter((p) => p.annotations.some((a) => a.type === 'injury'));
  const samples = [injured[0], D.players.find((p) => p.currentLeague === 'NHL' || p.currentLeague === 'AHL'), D.players[0]]
    .filter(Boolean).slice(0, 3);
  const opts = ['<option value="admin">Ylläpitäjä (kaikki)</option>'];
  const seen = new Set();
  for (const p of samples) { if (seen.has(p.id)) continue; seen.add(p.id); opts.push(`<option value="player:${p.id}">Pelaaja: ${esc(p.name)}</option>`); }
  sel.innerHTML = opts.join('');
  sel.onchange = () => {
    const v = sel.value;
    if (v === 'admin') { state.role = 'admin'; state.selfId = null; state.view = 'roster'; }
    else { state.role = 'player'; state.selfId = v.split(':')[1]; state.view = 'player'; state.playerId = state.selfId; }
    render();
  };
}

function renderTabs() {
  const tabs = $('#tabs');
  const rosterLabel = state.role === 'player' ? 'Omat tulokset' : 'Pelaajat';
  tabs.innerHTML = `
    <button data-view="${state.role === 'player' ? 'player' : 'roster'}" class="${state.view !== 'compare' ? 'active' : ''}">${rosterLabel}</button>
    <button data-view="compare" class="${state.view === 'compare' ? 'active' : ''}">Vertailu</button>`;
  tabs.querySelectorAll('button').forEach((b) => b.onclick = () => {
    const v = b.dataset.view;
    if (v === 'player') { state.view = 'player'; state.playerId = state.selfId; } else state.view = v;
    render();
  });
}

/* =========================================================================
   ROSTER
   ========================================================================= */
function ageBucket(age) { return age < 15 ? '12-14' : age < 17 ? '15-16' : age < 19 ? '17-18' : age < 21 ? '19-20' : age < 23 ? '21-22' : '23-26'; }

function renderRoster() {
  const wrap = el('<div></div>');
  const leagues = HAS_LEAGUES
    ? [...new Set(D.players.map((p) => p.currentLeague))].sort((a, b) => leagueOf(a).level - leagueOf(b).level)
    : [];

  wrap.appendChild(el(`
    <div class="filters">
      <input type="search" id="q" placeholder="Hae pelaajaa..." value="${esc(state.q)}">
      ${HAS_AGES ? `<select id="ageF">
        <option value="">Kaikki ikäluokat</option>
        ${['12-14','15-16','17-18','19-20','21-22','23-26'].map((a) => `<option ${state.ageF === a ? 'selected' : ''}>${a}</option>`).join('')}
      </select>` : ''}
      ${HAS_LEAGUES ? `<select id="leagueF">
        <option value="">Kaikki sarjat</option>
        ${leagues.map((c) => `<option value="${c}" ${state.leagueF === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>` : ''}
      <select id="statusF">
        <option value="">Kaikki tilanteet</option>
        <option value="injury" ${state.statusF === 'injury' ? 'selected' : ''}>Loukkaantumistausta</option>
        <option value="rising" ${state.statusF === 'rising' ? 'selected' : ''}>Nouseva trendi</option>
        <option value="falling" ${state.statusF === 'falling' ? 'selected' : ''}>Laskeva tai notkahdus</option>
      </select>
      <span class="count-chip" id="countChip"></span>
    </div>`));
  wrap.appendChild(el('<div class="psub" style="margin:-6px 0 12px">Klikkaa pelaajaa nähdäksesi kehityksen, vertailun ja tulostettavan analyysin.</div>'));

  /* Head-line metric: the first one the data actually has, so the column is
     never empty when a battery does not include CMJ. */
  const m = metricsPresent(D.players)[0] || metric('cmj');
  const lastVal = (p) => { for (let i = p.sessions.length - 1; i >= 0; i--) { const v = m.get(p.sessions[i]); if (v != null) return v; } return null; };
  let rows = D.players.map((p) => ({ p, imp: improvement(p, m), latest: lastVal(p), inj: p.annotations.some((a) => a.type === 'injury') }));
  rows = rows.filter(({ p, imp, inj }) => {
    if (state.q && !p.name.toLowerCase().includes(state.q.toLowerCase())) return false;
    if (HAS_AGES && state.ageF && ageBucket(p.age) !== state.ageF) return false;
    if (HAS_LEAGUES && state.leagueF && p.currentLeague !== state.leagueF) return false;
    if (state.statusF === 'injury' && !inj) return false;
    if (state.statusF === 'rising' && !(imp > 1.5)) return false;
    if (state.statusF === 'falling' && !(imp < 1.5)) return false;
    return true;
  });
  const sk = state.sortKey;
  rows.sort((a, b) => {
    if (sk === 'name') return a.p.name.localeCompare(b.p.name, 'fi') * state.sortDir;
    let va, vb;
    if (sk === 'age') { va = a.p.age; vb = b.p.age; }
    else if (sk === 'league') { va = leagueOf(a.p.currentLeague).level; vb = leagueOf(b.p.currentLeague).level; }
    else if (sk === 'cmj') { va = a.latest; vb = b.latest; }
    else { va = a.imp ?? -999; vb = b.imp ?? -999; }
    return ((va ?? -999) - (vb ?? -999)) * state.sortDir;
  });

  const th = (key, label, cls = '') => `<th class="${cls}" data-k="${key}">${label}${state.sortKey === key ? (state.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const hasPos = D.players.some((p) => p.position);
  const table = el(`
    <table class="roster">
      <thead><tr>
        ${th('name', 'Pelaaja')}
        ${HAS_AGES ? th('age', 'Ikä', 'num') : ''}
        ${HAS_LEAGUES ? th('league', 'Sarjataso') : ''}
        ${hasPos ? '<th>Pelipaikka</th>' : ''}
        ${th('cmj', esc(m.label) + ' nyt', 'num')}${th('imp', 'Kehitys', 'num')}<th>Tila</th>
      </tr></thead>
      <tbody>
      ${rows.map(({ p, imp, latest, inj }) => `
        <tr data-id="${p.id}">
          <td><div class="pname">${esc(p.name)}</div><div class="psub">${p.sessions.length} testiä · ${fmtD(first(p).date)} ... ${fmtD(last(p).date)}</div></td>
          ${HAS_AGES ? `<td class="num">${p.age.toFixed(1)}</td>` : ''}
          ${HAS_LEAGUES ? `<td>${leagueBadge(p.currentLeague)}</td>` : ''}
          ${hasPos ? `<td>${esc(p.position || '-')}</td>` : ''}
          <td class="num">${latest == null ? '<span class="psub">-</span>' : num(latest, m.unit) + ' ' + m.unit}</td>
          <td class="num">${trendHtml(imp)}</td>
          <td>${inj ? '<span class="flag">● vamma</span>' : '<span class="flag none">●</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`);
  wrap.appendChild(table);
  if (!rows.length) wrap.appendChild(el('<div class="empty">Ei osumia näillä suodattimilla.</div>'));

  wrap.querySelector('#q').oninput = (e) => { state.q = e.target.value; render(); setTimeout(() => { const q = $('#q'); if (q) { q.focus(); q.selectionStart = q.value.length; } }); };
  ['ageF', 'leagueF', 'statusF'].forEach((id) => { const n = wrap.querySelector('#' + id); if (n) n.onchange = (e) => { state[id] = e.target.value; render(); }; });
  table.querySelectorAll('th[data-k]').forEach((h) => h.onclick = () => {
    const k = h.dataset.k;
    if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = k === 'name' ? 1 : -1; }
    render();
  });
  table.querySelectorAll('tbody tr').forEach((tr) => tr.onclick = () => { state.view = 'player'; state.playerId = tr.dataset.id; render(); });
  setTimeout(() => { const c = $('#countChip'); if (c) c.textContent = `${rows.length} / ${D.players.length} pelaajaa`; });
  return wrap;
}

/* =========================================================================
   PLAYER DETAIL
   ========================================================================= */
function renderPlayer(id) {
  const p = D.players.find((x) => x.id === id);
  if (!p) return el('<div class="empty">Pelaajaa ei löytynyt.</div>');
  const wrap = el('<div class="grid" style="gap:16px"></div>');

  const bar = el('<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"></div>');
  if (state.role !== 'player') {
    const back = el('<button class="back">← Takaisin listaan</button>');
    back.onclick = () => { state.view = 'roster'; render(); };
    bar.appendChild(back);
  }
  const cmp = el(`<button class="btn-ghost" style="margin-left:${state.role === 'player' ? '0' : 'auto'}">Vertaa tätä pelaajaa</button>`);
  cmp.onclick = () => { state.focusId = p.id; state.compareAge = p.age; state.view = 'compare'; render(); };
  bar.appendChild(cmp);
  const rep = el('<button class="btn-ghost">Analyysi ja tulostus</button>');
  rep.onclick = () => openReport(p.id, last(p).id);
  bar.appendChild(rep);
  if (state.role !== 'player') {
    const add = el('<button class="btn-primary">+ Lisää testitulokset</button>');
    add.onclick = () => openTestForm(p, null);
    bar.appendChild(add);
  }
  wrap.appendChild(bar);

  const L = last(p);
  const stat = (k, v) => v == null ? '' : `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const sub = [p.position, p.birthDate ? `syntynyt ${fmtDLong(p.birthDate)}` : null].filter(Boolean).join(' · ');
  wrap.appendChild(el(`
    <div class="card phead">
      <div style="flex:1 1 240px">
        <div class="big">${esc(p.name)}</div>
        ${sub ? `<div class="psub">${esc(sub)}</div>` : ''}
      </div>
      ${stat('Ikä nyt', p.age == null ? null : p.age.toFixed(1) + ' v')}
      ${stat('Sarjataso nyt', p.currentLeague == null ? null : leagueBadge(p.currentLeague))}
      ${stat('Pituus nyt', L.heightCm == null ? null : L.heightCm + ' cm')}
      ${stat('Paino nyt', (L.weightKg ?? p.weightKg) == null ? null : (L.weightKg ?? p.weightKg) + ' kg')}
      ${stat('Testejä', p.sessions.length)}
      ${stat('Jakso', `${fmtD(first(p).date)} ... ${fmtD(last(p).date)}`)}
    </div>`));

  /* What the source does not contain is stated rather than filled in. */
  if (p.notes && p.notes.length) {
    wrap.appendChild(el(`<div class="callout"><b>Datan rajat.</b> ${p.notes.map(esc).join(' ')}</div>`));
  }

  wrap.appendChild(renderTimeline(p));

  wrap.appendChild(renderSessionsCard(p));

  const two = el('<div class="grid two"></div>');
  two.appendChild(renderCurveCard(p));
  two.appendChild(renderBalanceCard(p));
  wrap.appendChild(two);

  if (HAS_PEERS) wrap.appendChild(renderLeagueContextCard(p));

  const two2 = el('<div class="grid two"></div>');
  two2.appendChild(renderSummaryCard(p));
  two2.appendChild(renderRatiosCard(p));
  wrap.appendChild(two2);
  return wrap;
}

/* --- test sessions by date, expandable --- */
function measRows(s) {
  const m = s.measurements, sk = s.skips || {};
  const item = (k, v) => `<div class="meas"><span class="mk">${k}</span><span class="mv">${v}</span></div>`;
  const skipTxt = (code) => `<span class="meas-skip">ei testattu (${esc(sk[code])})</span>`;
  /* A test simply absent from a session is left out entirely; only an explicit
     skip is spelled out. Rows of "-" would suggest a failed test. */
  const line = (code, k, v, has) => sk[code] ? item(k, skipTxt(code)) : (has ? item(k, v) : '');
  const sides = (o, unit) => o.right == null || o.left == null ? '' : ` (O ${num(o.right, unit)} / V ${num(o.left, unit)})`;
  return [
    line('cmj', 'CMJ (kahdella)', `${num(m.cmj.both, 'cm')} cm${sides(m.cmj, 'cm')}`, m.cmj.both != null),
    line('cmj1', 'CMJ (yhdellä)', `O ${num(m.cmj.right, 'cm')} / V ${num(m.cmj.left, 'cm')} cm`, m.cmj.both == null && m.cmj.right != null),
    line('sj', 'Squat Jump (kahdella)', `${num(m.sj.both, 'cm')} cm${sides(m.sj, 'cm')}`, m.sj.both != null),
    line('sj1', 'Squat Jump (yhdellä)', `O ${num(m.sj.right, 'cm')} / V ${num(m.sj.left, 'cm')} cm`, m.sj.both == null && m.sj.right != null),
    line('snap', 'Snap Drive, tehohuippu', `O ${num(m.snap.right, 'W')} / V ${num(m.snap.left, 'W')} W`, m.snap.right != null),
    line('snapFixed', `Snap Drive, vakiokuorma${m.snapFixed.loadKg ? ' ' + m.snapFixed.loadKg + ' kg' : ''}`,
         `O ${num(m.snapFixed.right, 'W')} / V ${num(m.snapFixed.left, 'W')} W`, m.snapFixed.right != null),
    line('keiser', 'Keiser-jalkaprässi (2 jalkaa)',
         `${num(m.keiser.watts, 'W')} W${m.keiser.wattsPerKg == null ? '' : ` · ${num(m.keiser.wattsPerKg, 'W/kg')} W/kg`}`, m.keiser.watts != null),
    line('legPress', 'Leg press (indeksi)', `${num(m.legPress, 'idx')}`, m.legPress != null),
  ].filter(Boolean).join('') || '<div class="psub">Ei kirjattuja tuloksia tälle testikerralle.</div>';
}
function renderSessionsCard(p) {
  const card = el('<div class="card"><h3>Testikerrat päivämäärittäin <span class="sub">(klikkaa rivi auki nähdäksesi kaikki kyseisen kerran tulokset)</span></h3></div>');
  const sess = [...p.sessions].reverse(); // newest first
  const anyHeight = p.sessions.some((s) => s.heightCm != null);
  const cols = 4 + (HAS_AGES ? 1 : 0) + (HAS_LEAGUES ? 1 : 0) + (anyHeight ? 1 : 0);
  const table = el(`
    <table class="sessions">
      <thead><tr><th>Päivämäärä</th>${HAS_AGES ? '<th class="num">Ikä</th>' : ''}${HAS_LEAGUES ? '<th>Sarjataso</th>' : ''}${anyHeight ? '<th class="num">Pituus</th>' : ''}<th class="num">Paino</th><th class="num">Mitattu</th><th></th></tr></thead>
      <tbody>
      ${sess.map((s) => `
        <tr class="srow" data-sid="${s.id}">
          <td><b>${fmtDLong(s.date)}</b>${s.userAdded ? ' <span class="tag-added">lisätty</span>' : ''}</td>
          ${HAS_AGES ? `<td class="num">${s.ageYears == null ? '-' : s.ageYears + ' v'}</td>` : ''}
          ${HAS_LEAGUES ? `<td>${s.league == null ? '-' : leagueBadge(s.league)}</td>` : ''}
          ${anyHeight ? `<td class="num">${s.heightCm == null ? '-' : s.heightCm + ' cm'}</td>` : ''}
          <td class="num">${s.weightKg == null ? '<span class="psub">-</span>' : s.weightKg + ' kg'}</td>
          <td class="num">${countMeasured(s)} testiä ${s.flagged ? '<span class="flag" title="vamma-ajanjakso">●</span>' : ''}</td>
          <td class="num act">${state.role !== 'player' ? '<span class="row-act edit" data-sid="' + s.id + '">Muokkaa</span> · ' : ''}<span class="row-act rep-link" data-sid="${s.id}">Raportti</span> · <span class="expand">avaa</span></td>
        </tr>
        <tr class="sdetail" data-for="${s.id}" hidden><td colspan="${cols}"><div class="meas-grid">${measRows(s)}</div></td></tr>`).join('')}
      </tbody>
    </table>`);
  card.appendChild(table);
  table.querySelectorAll('tr.srow').forEach((tr) => tr.onclick = (ev) => {
    if (ev.target.classList.contains('rep-link')) { openReport(p.id, ev.target.dataset.sid); return; }
    if (ev.target.classList.contains('edit')) { openTestForm(p, p.sessions.find((x) => x.id === ev.target.dataset.sid)); return; }
    const d = table.querySelector(`tr.sdetail[data-for="${tr.dataset.sid}"]`);
    const open = d.hasAttribute('hidden');
    if (open) { d.removeAttribute('hidden'); tr.querySelector('.expand').textContent = 'sulje'; }
    else { d.setAttribute('hidden', ''); tr.querySelector('.expand').textContent = 'avaa'; }
  });
  return card;
}

/* How many of the battery's tests this session actually carries. */
const countMeasured = (s) => METRICS.filter((m) => m.get(s) != null).length;

const ANNO_COLORS = { injury: 'var(--red)', illness: 'var(--orange)', growth: 'var(--purple)', position: 'var(--blue)', training: 'var(--green)', rest: 'var(--muted)', other: 'var(--teal)' };
function renderTimeline(p) {
  const card = el('<div class="card"></div>');
  const head = el('<div class="card-head"><h3>Merkinnät ja muuttujat <span class="sub">(loukkaantumiset ja muut huomiot testien tulkintaan)</span></h3></div>');
  const addBtn = el('<button class="btn-mini">+ Lisää merkintä</button>');
  addBtn.onclick = () => openAnnotationForm(p);
  head.appendChild(addBtn);
  card.appendChild(head);

  if (!p.annotations.length) { card.appendChild(el('<div class="psub" style="padding:6px 0">Ei merkintöjä. Lisää loukkaantuminen tai muu huomio, joka auttaa tulkitsemaan tuloksia.</div>')); return card; }

  const sorted = [...p.annotations].sort((a, b) => parseD(a.startDate) - parseD(b.startDate));
  const t0 = parseD(first(p).date).getTime(), t1 = parseD(last(p).date).getTime();
  const span = Math.max(1, t1 - t0);
  const x = (iso) => Math.max(0, Math.min(100, ((parseD(iso).getTime() - t0) / span) * 100));
  const track = el('<div class="tl-track"></div>');
  for (const a of sorted) {
    const c = ANNO_COLORS[a.type] || 'var(--teal)';
    if (a.endDate) track.appendChild(el(`<div class="tl-span" style="left:${x(a.startDate)}%;width:${Math.max(1.5, x(a.endDate) - x(a.startDate))}%;background:${c}"></div>`));
    track.appendChild(el(`<div class="tl-ev" style="left:${x(a.startDate)}%"><div class="tl-dot" style="background:${c}"></div></div>`));
  }
  card.appendChild(track);
  const legend = el('<div class="tl-legend"></div>');
  for (const a of sorted) {
    const c = ANNO_COLORS[a.type] || 'var(--teal)';
    const range = a.endDate ? `${fmtD(a.startDate)} ... ${fmtD(a.endDate)}` : `${fmtD(a.startDate)} alkaen`;
    const item = el(`<div class="tl-item"><span class="dot" style="background:${c}"></span><div><div class="ti-t">${esc(a.title)}${a.severity ? ` <span class="ti-d">(${a.severity})</span>` : ''}${a.userAdded ? ' <span class="tag-added">lisätty</span>' : ''}</div><div class="ti-d">${range}. ${esc(a.note)}</div></div></div>`);
    if (a.userAdded) {
      const del = el('<span class="row-act del">poista</span>');
      del.onclick = () => { removeAnnotStore(p.id, a.id); p.annotations = p.annotations.filter((z) => z.id !== a.id); render(); };
      item.querySelector('.ti-t').appendChild(del);
    }
    legend.appendChild(item);
  }
  card.appendChild(legend);
  return card;
}

function renderCurveCard(p) {
  const card = el('<div class="card"></div>');
  const present = metricsPresent([p]);
  if (present.length && !present.some((x) => x.code === state.metric)) state.metric = present[0].code;
  const m = metric(state.metric);
  card.appendChild(el(`<h3>Kehityskaari <span class="sub">(oma lähtötaso yli ajan) · ${esc(m.label)} ${m.unit}</span></h3>`));
  const chips = el('<div class="mchips"></div>');
  for (const mm of present) {
    const b = el(`<button class="${mm.code === state.metric ? 'active' : ''}">${esc(mm.label)}</button>`);
    b.onclick = () => { state.metric = mm.code; render(); };
    chips.appendChild(b);
  }
  card.appendChild(chips);

  /* Reference line. With a peer population it is the player's own league level;
     otherwise the player's own previous-season baseline, where the source has one. */
  const baseKey = m.code === 'cmj' ? 'cmj' : m.code === 'sj' ? 'sj' : null;
  const ownBase = baseKey && p.baseline2025 ? p.baseline2025[baseKey] : null;
  const canRef = HAS_PEERS || ownBase != null;
  if (canRef) {
    const label = HAS_PEERS ? 'Oman sarjan taso' : 'Kauden 2025 taso';
    const refBtn = el(`<div class="mchips"><button class="${state.leagueRef ? 'active' : ''}">${state.leagueRef ? '✓ ' : ''}${label}</button></div>`);
    refBtn.querySelector('button').onclick = () => { state.leagueRef = !state.leagueRef; render(); };
    card.appendChild(refBtn);
  }

  const pts = p.sessions.map((s) => ({ t: parseD(s.date).getTime(), y: m.get(s), s })).filter((pt) => pt.y != null);
  const injurySpans = p.annotations.filter((a) => a.type === 'injury' && a.endDate).map((a) => ({ start: parseD(a.startDate).getTime(), end: parseD(a.endDate).getTime() }));
  let refPoints = [];
  if (state.leagueRef && canRef) {
    refPoints = HAS_PEERS
      ? pts.map(({ s }) => {
          const vals = matchedValuesAtAgeLeague(s.ageYears, s.league, m, p.id);
          return { t: parseD(s.date).getTime(), y: vals.length ? Math.round((vals.reduce((a, c) => a + c, 0) / vals.length) * 10) / 10 : null, label: s.league };
        })
      : pts.map(({ s }) => ({ t: parseD(s.date).getTime(), y: ownBase, label: '' }));
  }
  if (pts.length) card.appendChild(lineChart(pts, { unit: m.unit, hb: m.hb, injurySpans, color: 'var(--teal)', refPoints, refLabel: HAS_PEERS ? 'Oman sarjan taso' : 'Kauden 2025 taso' }));
  else card.appendChild(el('<div class="empty">Ei mitattuja arvoja tälle testille.</div>'));

  const leaguesHere = HAS_LEAGUES ? [...new Set(p.sessions.map((s) => s.league).filter(Boolean))].sort((a, b) => leagueOf(a).level - leagueOf(b).level) : [];
  card.appendChild(el(`<div class="lg-legend"><span class="lg-item"><span class="lg-line" style="background:var(--teal)"></span>oma tulos</span>${state.leagueRef && canRef ? `<span class="lg-item"><span class="lg-line dashed"></span>${HAS_PEERS ? 'oman sarjan taso' : 'kauden 2025 taso'}</span>` : ''}${leaguesHere.map((c) => `<span class="lg-item">${leagueSwatch(c)}${c}</span>`).join('')}</div>`));
  const notes = [];
  if (HAS_LEAGUES) notes.push('Pisteen väri on sarjataso kyseisen testin aikaan.');
  if (!m.hb) notes.push('Pienempi arvo on parempi (aika).');
  if (state.leagueRef && canRef) notes.push(HAS_PEERS ? 'Katkoviiva on sen sarjan keskitaso, jossa pelaaja kulloinkin pelasi.' : 'Katkoviiva on pelaajan oma kauden 2025 vertailutaso.');
  if (notes.length) card.appendChild(el(`<div class="psub" style="margin-top:6px">${notes.join(' ')}</div>`));
  return card;
}

/* --- left/right balance over time; the method's own claim is symmetry --- */
function renderBalanceCard(p) {
  const card = el('<div class="card"><h3>Puolierot <span class="sub">(oikea vs. vasen yli ajan)</span></h3></div>');
  const SIDED = [
    { code: 'cmj', label: 'CMJ', unit: 'cm', get: (s) => s.measurements.cmj },
    { code: 'sj', label: 'Squat Jump', unit: 'cm', get: (s) => s.measurements.sj },
    { code: 'snap', label: 'Snap Drive', unit: 'W', get: (s) => s.measurements.snap },
  ].filter((x) => p.sessions.some((s) => { const o = x.get(s); return o && o.right != null && o.left != null; }));

  if (!SIDED.length) { card.appendChild(el('<div class="empty">Ei puolikohtaisia mittauksia.</div>')); return card; }

  const rows = [];
  for (const x of SIDED) {
    for (let i = p.sessions.length - 1; i >= 0; i--) {
      const o = x.get(p.sessions[i]);
      if (o && o.right != null && o.left != null) {
        const asym = Math.abs(o.right - o.left) / ((o.right + o.left) / 2) * 100;
        rows.push({ x, s: p.sessions[i], o, asym });
        break;
      }
    }
  }
  card.appendChild(el(`
    <table class="sum">
      <thead><tr><th>Testi</th><th class="num">Oikea</th><th class="num">Vasen</th><th class="num">Ero</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${esc(r.x.label)}<div class="psub">uusin: ${fmtD(r.s.date)}</div></td>
          <td class="num">${num(r.o.right, r.x.unit)} ${r.x.unit}</td>
          <td class="num">${num(r.o.left, r.x.unit)} ${r.x.unit}</td>
          <td class="num"><span class="${r.asym < 5 ? 'good' : r.asym < 10 ? 'warn' : 'bad'}">${r.asym.toFixed(1)} %</span></td>
        </tr>`).join('')}</tbody>
    </table>`));

  /* Asymmetry trend: one line per sided test, so a widening gap is visible. */
  const series = SIDED.map((x, i) => ({
    name: x.label,
    color: ['var(--teal)', 'var(--blue)', 'var(--yellow)'][i % 3],
    points: p.sessions.map((s) => {
      const o = x.get(s);
      if (!o || o.right == null || o.left == null) return null;
      return { x: parseD(s.date).getTime(), y: Math.round(Math.abs(o.right - o.left) / ((o.right + o.left) / 2) * 1000) / 10, s };
    }).filter(Boolean),
    showDots: true,
  })).filter((sr) => sr.points.length >= 2);
  if (series.length) {
    card.appendChild(el('<div class="psub" style="margin:12px 0 4px">Puolieron kehitys, % (pienempi on parempi)</div>'));
    card.appendChild(multiLineChart(series, { unit: '%', hb: false, xMode: 'date', zeroFloor: true }));
    card.appendChild(el(`<div class="lg-legend">${series.map((sr) => `<span class="lg-item"><span class="lg-line" style="background:${sr.color}"></span>${esc(sr.name)}</span>`).join('')}</div>`));
  }
  card.appendChild(el('<div class="callout">Alle 5 % puoliero on tavoitetaso. Yli 10 % on syytä kohdentaa harjoittelussa.</div>'));
  return card;
}

function renderLeagueContextCard(p) {
  const m = metric(state.metric);
  const card = el(`<div class="card"><h3>Sarjakohtainen vertailu <span class="sub">${esc(m.label)} ${m.unit} · jokainen testi verrattuna siihen sarjaan, jossa pelaaja silloin pelasi</span></h3></div>`);
  const rows = p.sessions.map((s) => {
    const now = m.get(s);
    const vals = matchedValuesAtAgeLeague(s.ageYears, s.league, m, p.id);
    const avg = vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : null;
    return { s, now, avg, pc: percentileRank(now, vals, m.hb), n: vals.length };
  });
  const t = el(`
    <table class="sum">
      <thead><tr><th>Päivämäärä</th><th>Ikä</th><th>Sarja tuolloin</th><th>Tulos</th><th>Sarjan ka</th><th>Ero</th><th>Percentiili</th></tr></thead>
      <tbody>
      ${rows.map((r) => { const sk = r.s.skips && r.s.skips[m.code]; return `<tr>
        <td>${fmtDLong(r.s.date)}${r.s.flagged ? ' <span class="flag" title="vamma-ajanjakso">●</span>' : ''}</td>
        <td>${r.s.ageYears} v</td>
        <td>${leagueBadge(r.s.league)}</td>
        <td>${r.now == null ? (sk ? `<span class="psub">ei testattu (${esc(sk)})</span>` : '<span class="psub">-</span>') : '<b>' + num(r.now, m.unit) + '</b>'}</td>
        <td>${r.avg == null ? '-' : num(r.avg, m.unit) + ' <span class="psub">(n=' + r.n + ')</span>'}</td>
        <td>${r.avg == null || r.now == null ? '-' : diffHtml(r.now, r.avg, m)}</td>
        <td class="pct-cell ${pctClass(r.pc)}">${r.pc == null ? '-' : r.pc + '.'}</td>
      </tr>`; }).join('')}
      </tbody>
    </table>`);
  card.appendChild(t);
  card.appendChild(el('<div class="callout">Vertailukohta vaihtuu automaattisesti sen sarjatason mukaan, jossa pelaaja kunakin testihetkenä pelasi. Sarjanousun jälkeen samat luvut mitataan siis kovempaa tasoa vasten. Vaihda mittaria kehityskaaren napeista.</div>'));
  return card;
}

function renderSummaryCard(p) {
  const lg = last(p).league;
  const card = el(`<div class="card"><h3>Kokoava taulukko <span class="sub">${HAS_PEERS ? `(lähtö, nyt, ja vertailu sarjassa ${esc(lg)})` : '(lähtö, nyt ja kehitys jaksolla)'}</span></h3></div>`);
  /* First and last MEASURED value per test, not first and last session: the
     battery is not run in full every time, so session order is not enough. */
  const edge = (m, dir) => {
    const idx = dir > 0 ? [...p.sessions.keys()] : [...p.sessions.keys()].reverse();
    for (const i of idx) { const v = m.get(p.sessions[i]); if (v != null) return { v, s: p.sessions[i] }; }
    return null;
  };
  const rows = metricsPresent([p]).map((m) => {
    const b = edge(m, 1), l = edge(m, -1);
    const imp = b && l && b.s !== l.s && b.v !== 0 ? (m.hb ? (l.v - b.v) / b.v : (b.v - l.v) / b.v) * 100 : null;
    const base = p.baseline2025 ? p.baseline2025[m.code] : null;
    const { values } = leaguePeerValues(p, m);
    const peerAvg = values.length ? values.reduce((a, c) => a + c, 0) / values.length : null;
    const pctl = percentileRank(l ? l.v : null, values, m.hb);
    return { m, b, l, imp, base, peerAvg, pctl };
  });
  const anyBase = rows.some((r) => r.base != null);
  const t = el(`
    <table class="sum">
      <thead><tr><th>Testi</th><th>Lähtö</th><th>Nyt</th><th>Kehitys</th>${anyBase ? '<th>2025-taso</th>' : ''}${HAS_PEERS ? '<th>Sarjan ka</th><th>Percentiili</th>' : ''}</tr></thead>
      <tbody>
      ${rows.map(({ m, b, l, imp, base, peerAvg, pctl }) => `
        <tr>
          <td>${esc(m.label)}<div class="psub">${m.unit}</div></td>
          <td>${b == null ? '-' : num(b.v, m.unit)}<div class="psub">${b == null ? '' : fmtD(b.s.date)}</div></td>
          <td><b>${l == null ? '-' : num(l.v, m.unit)}</b><div class="psub">${l == null ? '' : fmtD(l.s.date)}</div></td>
          <td>${trendHtml(imp)}</td>
          ${anyBase ? `<td>${base == null ? '-' : num(base, m.unit) + (l == null ? '' : ' <span class="' + ((m.hb ? l.v >= base : l.v <= base) ? 'good' : 'bad') + '">' + ((m.hb ? l.v >= base : l.v <= base) ? '▲' : '▼') + '</span>')}</td>` : ''}
          ${HAS_PEERS ? `<td>${peerAvg == null ? '-' : num(peerAvg, m.unit)}</td>
          <td class="pct-cell ${pctClass(pctl)}">${pctl == null ? '-' : pctl + '.'}
            <div class="mini-bar"><span style="width:${pctl || 0}%;background:var(--${pctl >= 66 ? 'green' : pctl >= 33 ? 'orange' : 'red'})"></span></div>
          </td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>`);
  card.appendChild(t);
  card.appendChild(el(HAS_PEERS
    ? `<div class="callout">Vertailu käyttää vain testejä, jotka on tehty sarjassa <b>${esc(lg)}</b> samanikäisillä pelaajilla. Percentiili on osuus näistä, jotka pelaaja ylittää. <b>Oma kehitys yli ajan on ensisijainen, vertailu on konteksti.</b></div>`
    : `<div class="callout">Aineistossa ei ole ikä- eikä sarjatietoa, joten vertailuryhmää muihin pelaajiin ei muodosteta. <b>Kehitys mitataan pelaajan omaa lähtötasoa vasten.</b>${anyBase ? ' 2025-taso on edellisen kauden vertailuarvo.' : ''}</div>`));
  return card;
}

function renderRatiosCard(p) {
  /* Take each ratio from the newest session that actually has its inputs. */
  const newestWith = (fn) => { for (let i = p.sessions.length - 1; i >= 0; i--) { const v = fn(p.sessions[i]); if (v != null) return { v, s: p.sessions[i] }; } return null; };
  const ssc = newestWith((s) => { const m = s.measurements; return m.cmj.both != null && m.sj.both != null && m.sj.both !== 0 ? ((m.cmj.both - m.sj.both) / m.sj.both) * 100 : null; });
  const bilat = newestWith((s) => { const c = s.measurements.cmj; return c.both != null && c.right != null && c.left != null && (c.right + c.left) !== 0 ? c.both / (c.right + c.left) : null; });
  const asym = newestWith((s) => { const c = s.measurements.cmj; return c.right != null && c.left != null ? Math.abs(c.right - c.left) / ((c.right + c.left) / 2) * 100 : null; });
  const snapAsym = newestWith((s) => { const c = s.measurements.snap; return c.right != null && c.left != null ? Math.abs(c.right - c.left) / ((c.right + c.left) / 2) * 100 : null; });

  const card = el('<div class="card"><h3>Suhdeluvut <span class="sub">(SBAQ-profiilin laatu, uusin mittaus per suhdeluku)</span></h3></div>');
  const na = '<span class="psub">ei mitattu</span>';
  const row = (k, r, fmt, cls, note) => `<div class="kv-row"><span class="k">${k}<div class="psub">${note}${r ? ' · ' + fmtD(r.s.date) : ''}</div></span><span class="v ${r ? cls(r.v) : ''}">${r ? fmt(r.v) : na}</span></div>`;
  card.appendChild(el(`<div>
    ${row('SSC eli elastisuus (CMJ vs SJ)', ssc, (v) => v.toFixed(1) + ' %', (v) => v >= 5 ? 'good' : v >= 2 ? 'warn' : 'bad', 'Optimi +10...15 %')}
    ${row('Bilateraalinen suhde', bilat, (v) => v.toFixed(2), (v) => v >= 0.9 && v <= 1.1 ? 'good' : 'warn', 'Normaali 0,90...1,10')}
    ${row('Sivuasymmetria (CMJ)', asym, (v) => v.toFixed(1) + ' %', (v) => v < 5 ? 'good' : v < 10 ? 'warn' : 'bad', 'Optimi alle 5 %')}
    ${row('Sivuasymmetria (Snap Drive)', snapAsym, (v) => v.toFixed(1) + ' %', (v) => v < 5 ? 'good' : v < 10 ? 'warn' : 'bad', 'Optimi alle 5 %')}
  </div>`));
  return card;
}

/* =========================================================================
   COMPARE (player-anchored, age-matched)
   For a focus player at a chosen age, compare against other players' results
   FROM THAT SAME AGE (their session nearest the compare age).
   ========================================================================= */
function renderCompare() {
  const wrap = el('<div class="grid" style="gap:16px"></div>');
  if (state.role === 'player') state.focusId = state.selfId;
  if (!state.focusId || !D.players.some((p) => p.id === state.focusId)) state.focusId = state.playerId || D.players[0].id;
  const focus = D.players.find((p) => p.id === state.focusId);
  if (state.compareAge == null) state.compareAge = focus.age;
  const presentM = metricsPresent(D.players);
  if (presentM.length && !presentM.some((x) => x.code === state.compareMetric)) state.compareMetric = presentM[0].code;
  const m = metric(state.compareMetric);

  const hasPos = D.players.some((q) => q.position);
  const posF = hasPos ? state.comparePosition : '';
  /* Age-matched scatter needs ages. Without them only the time trend is honest. */
  const canScatter = HAS_AGES;
  if (!canScatter) state.compareMode = 'trend';
  const scatterMode = state.compareMode === 'scatter';

  /* ---- controls ---- */
  const ctl = el('<div class="card"></div>');
  ctl.appendChild(el(`<h3>Vertaa pelaajaa <span class="sub">ikä-täsmätty hajonta tai kehityskaari yli ajan</span></h3>`));
  const playerOpts = D.players.map((p) => {
    const meta = [p.age == null ? null : p.age.toFixed(1) + ' v', p.currentLeague].filter(Boolean).join(', ');
    return `<option value="${p.id}" ${p.id === focus.id ? 'selected' : ''}>${esc(p.name)}${meta ? ` (${meta})` : ''}</option>`;
  }).join('');
  const leagueOpts = (D.leagues || []).filter((l) => D.players.some((p) => p.sessions.some((s) => s.league === l.code)))
    .map((l) => `<option value="${l.code}" ${state.compareLeague === l.code ? 'selected' : ''}>Vain ${l.code}</option>`).join('');
  ctl.appendChild(el(`<div class="cmp-controls">
    <label class="fld"><span>Fokuspelaaja</span><select id="cf" ${state.role === 'player' ? 'disabled' : ''}>${playerOpts}</select></label>
    ${hasPos ? `<label class="fld"><span>Pelipaikka</span><select id="cp">
      <option value="">Kaikki pelipaikat</option>
      ${['Hyökkääjä', 'Puolustaja', 'Maalivahti'].map((x) => `<option ${posF === x ? 'selected' : ''}>${x}</option>`).join('')}
    </select></label>` : ''}
    ${HAS_LEAGUES ? `<label class="fld"><span>Sarjat</span><select id="cl">
      <option value="">Kaikki sarjat</option>
      <option value="same" ${state.compareLeague === 'same' ? 'selected' : ''}>Sama kuin fokus</option>
      ${leagueOpts}
    </select></label>` : ''}
    ${scatterMode ? `<label class="fld"><span>Vertailuikä: <b id="caLbl">${state.compareAge.toFixed(1)} v</b></span>
      <input id="ca" type="range" min="12" max="26" step="0.5" value="${state.compareAge}"></label>` : ''}
  </div>`));
  const modeRow = el(`<div class="mchips" style="margin-bottom:10px">
    ${canScatter ? `<button id="mScatter" class="${scatterMode ? 'active' : ''}">Hajonta vertailuikänä</button>` : ''}
    <button id="mTrend" class="${!scatterMode ? 'active' : ''}">Kehityskaari yli ajan</button>
  </div>`);
  if (canScatter) ctl.appendChild(modeRow);
  const chips = el('<div class="mchips"></div>');
  for (const mm of presentM) {
    const b = el(`<button class="${mm.code === state.compareMetric ? 'active' : ''}">${esc(mm.label)}</button>`);
    b.onclick = () => { state.compareMetric = mm.code; render(); };
    chips.appendChild(b);
  }
  ctl.appendChild(chips);
  wrap.appendChild(ctl);

  if (scatterMode) renderCompareScatter(wrap, focus, m, posF);
  else renderCompareTrend(wrap, focus, m, posF);

  /* ---- events ---- */
  ctl.querySelector('#cf').onchange = (e) => { state.focusId = e.target.value; state.compareAge = D.players.find((p) => p.id === e.target.value).age; render(); };
  const cp = ctl.querySelector('#cp'); if (cp) cp.onchange = (e) => { state.comparePosition = e.target.value; render(); };
  const cl = ctl.querySelector('#cl'); if (cl) cl.onchange = (e) => { state.compareLeague = e.target.value; render(); };
  const ms = modeRow.querySelector('#mScatter'); if (ms) ms.onclick = () => { state.compareMode = 'scatter'; render(); };
  const mt = modeRow.querySelector('#mTrend'); if (mt) mt.onclick = () => { state.compareMode = 'trend'; render(); };
  const ca = ctl.querySelector('#ca');
  if (ca) {
    ca.oninput = (e) => { ctl.querySelector('#caLbl').textContent = Number(e.target.value).toFixed(1) + ' v'; };
    ca.onchange = (e) => { state.compareAge = Number(e.target.value); render(); };
  }
  return wrap;
}

function renderCompareScatter(wrap, focus, m, posF) {
  let { filtered } = comparisonSet(focus, state.compareAge, m, state.compareLeague);
  if (posF) filtered = filtered.filter((d) => d.p.position === posF);
  const focal = filtered.find((d) => d.self);
  const others = filtered.filter((d) => !d.self);
  const focalVal = focal ? focal.val : null;
  const mean = others.length ? others.reduce((a, c) => a + c.val, 0) / others.length : null;
  const pctl = focalVal != null ? percentileRank(focalVal, others.map((d) => d.val), m.hb) : null;

  const stat = el('<div class="card"></div>');
  const focalNote = focal
    ? `${esc(focus.name)} iässä ${focal.age.toFixed(1)} v (mitattu ${fmtD(focal.s.date)}, ${focal.league})`
    : `${esc(focus.name)}: ei testiä lähellä ikää ${state.compareAge.toFixed(1)} v${posF ? ' tällä pelipaikkarajauksella' : ''}`;
  stat.appendChild(el(`
    <div class="cmp-stats">
      <div class="stat"><span class="k">Fokus</span><span class="v">${focalVal == null ? '-' : num(focalVal, m.unit) + ' ' + m.unit}</span><span class="psub">${focalNote}</span></div>
      <div class="stat"><span class="k">Vertailtavia</span><span class="v">${others.length}</span><span class="psub">${posF ? esc(posF) + ', ' : ''}ikä ${state.compareAge.toFixed(1)} v</span></div>
      <div class="stat"><span class="k">Keskiarvo</span><span class="v">${mean == null ? '-' : num(mean, m.unit) + ' ' + m.unit}</span><span class="psub">vertailtavien ka</span></div>
      <div class="stat"><span class="k">Percentiili</span><span class="v ${pctClass(pctl)}">${pctl == null ? '-' : pctl + '.'}</span><span class="psub">osuus jotka fokus ylittää</span></div>
    </div>`));
  wrap.appendChild(stat);

  const chart = el('<div class="card"></div>');
  chart.appendChild(el(`<h3>Hajonta vertailuikänä <span class="sub">${esc(m.label)} ${m.unit} · ikä ${state.compareAge.toFixed(1)} v ±1,5 v${posF ? ' · ' + esc(posF) : ''}</span></h3>`));
  if (filtered.length) {
    const pts = filtered.map((d) => ({ x: d.age, y: d.val, level: d.level, self: d.self, name: d.p.name, league: d.league, pid: d.p.id }));
    const svg = scatterChart(pts, { unit: m.unit, hb: m.hb, xlo: state.compareAge - 2, xhi: state.compareAge + 2, vline: state.compareAge });
    attachPointClicks(svg);
    chart.appendChild(svg);
    chart.appendChild(el(`<div class="callout">Klikkaa pistettä avataksesi pelaajan. Jokainen piste on tulos siitä testistä, joka on lähimpänä ikää ${state.compareAge.toFixed(1)} v, joten esim. 22-vuotiaasta näkyy 18-vuotiaana tehty tulos. Väri on sarjataso kyseisessä testissä. <b>Fokuspelaaja on korostettu.</b></div>`));
  } else {
    chart.appendChild(el('<div class="empty">Ei vertailtavia tuloksia tällä rajauksella.</div>'));
  }
  wrap.appendChild(chart);
  if (filtered.length) wrap.appendChild(renderLeagueBars(filtered, m));
}

function renderCompareTrend(wrap, focus, m, posF) {
  let list = D.players.filter((q) => !posF || q.position === posF);
  const lf = HAS_LEAGUES ? state.compareLeague : '';
  if (lf === 'same') list = list.filter((q) => q.id === focus.id || q.sessions.some((s) => s.league === focus.currentLeague));
  else if (lf) list = list.filter((q) => q.id === focus.id || q.sessions.some((s) => s.league === lf));
  const others = list.filter((q) => q.id !== focus.id);
  const CAP = 11;
  const shown = [focus, ...others.slice(0, CAP)].filter((q, i, a) => a.indexOf(q) === i);
  const truncated = others.length > CAP;

  /* Age on the x-axis lines players up by development stage; without ages the
     only meaningful axis is the calendar. */
  const byDate = !HAS_AGES;
  const chart = el('<div class="card"></div>');
  chart.appendChild(el(`<h3>Kehityskaari yli ajan <span class="sub">${esc(m.label)} ${m.unit} · ${byDate ? 'päivämäärä' : 'ikä'} x-akselilla${posF ? ' · ' + esc(posF) : ''}</span></h3>`));
  const PALETTE = ['#8098c0', '#d29a6a', '#a99bc7', '#86b892', '#cbb06a', '#cd8a7d'];
  let ci = 0;
  const series = shown.map((q) => ({
    pid: q.id, name: q.name, focus: q.id === focus.id, league: q.currentLeague,
    color: q.id === focus.id ? 'var(--teal)' : (HAS_LEAGUES ? null : PALETTE[ci++ % PALETTE.length]),
    showDots: !HAS_LEAGUES,
    points: q.sessions.map((s) => ({ x: byDate ? parseD(s.date).getTime() : s.ageYears, y: m.get(s), s }))
      .filter((pt) => pt.y != null && pt.x != null),
  })).filter((s) => s.points.length);

  if (series.length) {
    const svg = multiLineChart(series, { unit: m.unit, hb: m.hb, xMode: byDate ? 'date' : 'age' });
    attachPointClicks(svg);
    chart.appendChild(svg);
    const present = HAS_LEAGUES
      ? [...new Set(series.filter((s) => !s.focus).map((s) => s.league))].sort((a, b) => leagueOf(a).level - leagueOf(b).level)
      : [];
    const legend = HAS_LEAGUES
      ? present.map((c) => `<span class="lg-item">${leagueSwatch(c)}${c}</span>`).join('')
      : series.filter((s) => !s.focus).map((s) => `<span class="lg-item"><span class="lg-line" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('');
    chart.appendChild(el(`<div class="lg-legend"><span class="lg-item"><span class="lg-line" style="background:var(--teal)"></span>${esc(focus.name)} (fokus)</span>${legend}</div>`));
    chart.appendChild(el(`<div class="callout">Jokainen viiva on yhden pelaajan kehitys yli ajan${HAS_LEAGUES ? ', väri on nykyinen sarjataso' : ''}. <b>${esc(focus.name)}</b> on korostettu (paksu). Klikkaa viivaa avataksesi pelaajan.${byDate ? ' Ilman ikätietoa käyriä ei voi rinnastaa kehitysvaiheen mukaan, vain kalenteriajassa.' : ''}${truncated ? ` Näytetään ${shown.length} pelaajaa (rajauksessa ${others.length + 1}).` : ''}</div>`));
  } else {
    chart.appendChild(el('<div class="empty">Ei pelaajia tällä rajauksella.</div>'));
  }
  wrap.appendChild(chart);
}

function attachPointClicks(svg) {
  svg.querySelectorAll('[data-pid]').forEach((node) => {
    node.style.cursor = 'pointer';
    node.addEventListener('click', () => openPlayer(node.getAttribute('data-pid')));
  });
}

function renderLeagueBars(matched, m) {
  const card = el(`<div class="card"><h3>Keskiarvo sarjatason mukaan <span class="sub">${esc(m.label)} · vertailuikäisten tuloksista</span></h3></div>`);
  const byLg = {};
  for (const d of matched) (byLg[d.league] = byLg[d.league] || []).push(d.val);
  const ordered = D.leagues.filter((l) => byLg[l.code]).map((l) => ({ code: l.code, n: byLg[l.code].length, avg: byLg[l.code].reduce((a, c) => a + c, 0) / byLg[l.code].length }));
  if (!ordered.length) return card;
  const vals = ordered.map((o) => o.avg), lo = Math.min(...vals), hi = Math.max(...vals);
  const norm = (v) => hi === lo ? 0.5 : (m.hb ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo));
  const bars = ordered.map((o) => `
    <div style="display:flex;align-items:center;gap:12px;margin:8px 0">
      <div style="width:70px">${leagueBadge(o.code)}</div>
      <div style="flex:1;background:var(--panel-2);border-radius:6px;height:26px;position:relative">
        <span style="position:absolute;left:0;top:0;bottom:0;width:${(0.12 + norm(o.avg) * 0.88) * 100}%;background:${leagueColor(o.code)};border-radius:6px;opacity:.8"></span>
        <span style="position:absolute;right:10px;top:4px;font-weight:700;font-size:13px">${o.avg.toFixed(m.unit === 's' ? 2 : 1)} ${m.unit}</span>
      </div>
      <div class="psub" style="width:80px">n=${o.n}</div>
    </div>`).join('');
  card.appendChild(el(`<div>${bars}</div>`));
  return card;
}

/* =========================================================================
   TEST FORM (add new OR edit existing); tests can be marked "not tested"
   ========================================================================= */
const SKIP_REASONS = ['Loukkaantuminen', 'Sairaus', 'Ei ehditty', 'Laite ei käytettävissä', 'Muu syy'];
function openTestForm(p, existing) {
  const isEdit = !!existing;
  const src = existing || last(p);
  const sm = src.measurements;
  const srcSkips = src.skips || {};
  const today = D.meta.todayIso;
  /* Blank rather than pre-filled with the previous session's numbers: copying a
     value forward silently would turn a missing test into a fabricated result. */
  const TF = [
    { code: 'cmj',       label: 'CMJ',                      fields: [['cmj_b', 'Kahdella', 'cm'], ['cmj_r', 'Oikea', 'cm'], ['cmj_l', 'Vasen', 'cm']] },
    { code: 'sj',        label: 'Squat Jump',               fields: [['sj_b', 'Kahdella', 'cm'], ['sj_r', 'Oikea', 'cm'], ['sj_l', 'Vasen', 'cm']] },
    { code: 'snap',      label: 'Snap Drive, tehohuippu',   fields: [['sn_r', 'Oikea', 'W'], ['sn_l', 'Vasen', 'W']] },
    { code: 'snapFixed', label: 'Snap Drive, vakiokuorma',  fields: [['sf_load', 'Kuorma', 'kg'], ['sf_r', 'Oikea', 'W'], ['sf_l', 'Vasen', 'W']] },
    { code: 'keiser',    label: 'Keiser-jalkaprässi (2 jalkaa)', fields: [['k_w', 'Huipputeho', 'W'], ['k_wk', 'Teho / paino', 'W/kg']] },
    { code: 'legPress',  label: 'Leg press (indeksi)',      fields: [['lp', 'Indeksi', '']] },
  ];
  const cur = {
    cmj_b: sm.cmj.both, cmj_r: sm.cmj.right, cmj_l: sm.cmj.left,
    sj_b: sm.sj.both, sj_r: sm.sj.right, sj_l: sm.sj.left,
    sn_r: sm.snap.right, sn_l: sm.snap.left,
    sf_load: sm.snapFixed.loadKg, sf_r: sm.snapFixed.right, sf_l: sm.snapFixed.left,
    k_w: sm.keiser.watts, k_wk: sm.keiser.wattsPerKg, lp: sm.legPress,
  };
  const val = (id) => isEdit ? cur[id] : null;

  const inp = (id, label, unit) => `<label class="fld"><span>${label}${unit ? ` <em>${unit}</em>` : ''}</span><input id="f_${id}" type="number" step="any" value="${val(id) == null ? '' : val(id)}"></label>`;
  const block = (t) => { const sk = srcSkips[t.code]; return `<div class="fgroup">
      <div class="fg-head"><h4>${t.label}</h4><label class="skipbox"><input type="checkbox" id="skip_${t.code}" ${sk ? 'checked' : ''}> ei testattu</label></div>
      <div class="skip-reason" id="rw_${t.code}" ${sk ? '' : 'hidden'}><span>Syy</span><select id="reason_${t.code}">${SKIP_REASONS.map((r) => `<option ${r === sk ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="fg-inputs" id="in_${t.code}">${t.fields.map((f) => inp(f[0], f[1], f[2])).join('')}</div>
    </div>`; };

  const back = el('<div class="modal-backdrop"></div>');
  const modal = el(`
    <div class="modal">
      <h2>${isEdit ? 'Muokkaa testiä' : 'Lisää testitulokset'}: ${esc(p.name)}</h2>
      <p class="psub">${isEdit ? 'Korjaa tietoja, esimerkiksi väärä päivämäärä. Muutokset tallentuvat tähän testiin.' : 'Täytä vain ne testit jotka tehtiin. Tyhjä kenttä tarkoittaa "ei mitattu", ei nollaa.'} Rastita "ei testattu" merkitäksesi syyn.</p>
      <div class="form-grid">
        <div class="fgroup"><h4>Perustiedot</h4>
          <label class="fld"><span>Päivämäärä</span><input id="f_date" type="date" value="${src.date || today}" max="${today}"></label>
          ${p.birthDate ? '<label class="fld"><span>Ikä testissä <em>(automaattinen)</em></span><input id="f_age" type="text" readonly></label>' : ''}
          ${HAS_LEAGUES ? `<label class="fld"><span>Sarjataso</span><select id="f_league">${D.leagues.map((l) => `<option value="${l.code}" ${l.code === src.league ? 'selected' : ''}>${l.code}</option>`).join('')}</select></label>` : ''}
          <label class="fld"><span>Pituus <em>cm</em></span><input id="f_height" type="number" step="any" value="${isEdit && src.heightCm != null ? src.heightCm : ''}"></label>
          <label class="fld"><span>Paino <em>kg</em></span><input id="f_weight" type="number" step="any" value="${isEdit && src.weightKg != null ? src.weightKg : ''}"></label>
        </div>
        ${TF.map(block).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn-ghost" id="f_cancel">Peruuta</button>
        <button class="btn-primary" id="f_save">${isEdit ? 'Tallenna muutokset' : 'Tallenna testi'}</button>
      </div>
    </div>`);
  back.appendChild(modal);
  document.body.appendChild(back);

  TF.forEach((t) => {
    const cb = $('#skip_' + t.code);
    const upd = () => { $('#rw_' + t.code).hidden = !cb.checked; const box = $('#in_' + t.code); box.style.opacity = cb.checked ? '.4' : '1'; box.querySelectorAll('input').forEach((i) => i.disabled = cb.checked); };
    cb.onchange = upd; upd();
  });
  /* Empty stays null. Only a number entered by the user becomes a measurement. */
  const gv = (id) => { const n = $('#f_' + id); if (!n || n.value.trim() === '') return null; const v = parseFloat(n.value); return Number.isFinite(v) ? v : null; };
  const ageBox = $('#f_age');
  const updateAge = () => { if (!ageBox) return; const d = $('#f_date').value; ageBox.value = d ? ((parseD(d) - parseD(p.birthDate)) / YEAR).toFixed(1) + ' v' : ''; };
  $('#f_date').oninput = updateAge; updateAge();

  const close = () => back.remove();
  back.onclick = (e) => { if (e.target === back) close(); };
  $('#f_cancel').onclick = close;
  $('#f_save').onclick = () => {
    const date = $('#f_date').value;
    if (!date) { alert('Anna päivämäärä.'); return; }
    const lgSel = $('#f_league');
    const league = lgSel ? lgSel.value : null;
    const ageYears = p.birthDate ? Math.round(((parseD(date) - parseD(p.birthDate)) / YEAR) * 10) / 10 : null;
    const skips = {}, skipped = (c) => $('#skip_' + c).checked;
    const meas = {
      cmj: skipped('cmj') ? { both: null, right: null, left: null } : { both: gv('cmj_b'), right: gv('cmj_r'), left: gv('cmj_l') },
      sj: skipped('sj') ? { both: null, right: null, left: null } : { both: gv('sj_b'), right: gv('sj_r'), left: gv('sj_l') },
      snap: skipped('snap') ? { right: null, left: null } : { right: gv('sn_r'), left: gv('sn_l') },
      snapFixed: skipped('snapFixed') ? { right: null, left: null, loadKg: null } : { right: gv('sf_r'), left: gv('sf_l'), loadKg: gv('sf_load') },
      keiser: skipped('keiser') ? { watts: null, wattsPerKg: null } : { watts: gv('k_w'), wattsPerKg: gv('k_wk') },
      legPress: skipped('legPress') ? null : gv('lp'),
    };
    for (const t of TF) if (skipped(t.code)) skips[t.code] = $('#reason_' + t.code).value;

    const fields = {
      date, ageYears, heightCm: gv('height'), weightKg: gv('weight'),
      league, leagueLevel: league ? leagueOf(league).level : null,
      measurements: meas, skips,
    };
    if (isEdit) {
      Object.assign(existing, fields);
      persistOverride(existing.id, fields);
    } else {
      const session = { id: 'padd-' + Date.now() + '-' + Math.round(Math.random() * 1e4), flagged: false, userAdded: true, ...fields };
      p.sessions.push(session);
      persistAdded(p.id, session);
    }
    refreshDerived(p);
    close();
    state.view = 'player'; state.playerId = p.id;
    render();
  };
}

/* ---------- annotation form (players and admins) ---------- */
function openAnnotationForm(p) {
  const today = D.meta.todayIso;
  const types = [['injury', 'Loukkaantuminen'], ['illness', 'Sairaus'], ['growth', 'Kasvupyrähdys'], ['position', 'Pelipaikan vaihto'], ['training', 'Harjoittelujakso'], ['other', 'Muu huomio']];
  const back = el('<div class="modal-backdrop"></div>');
  const modal = el(`
    <div class="modal modal-narrow">
      <h2>Lisää merkintä: ${esc(p.name)}</h2>
      <p class="psub">Merkitse loukkaantuminen tai muu huomio, joka auttaa tulkitsemaan tuloksia. Loppupäivä on valinnainen (jätä tyhjäksi jos jatkuu).</p>
      <div class="form-col">
        <label class="fld"><span>Tyyppi</span><select id="a_type">${types.map((t) => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></label>
        <label class="fld"><span>Otsikko</span><input id="a_title" type="text" placeholder="esim. Nilkan nyrjähdys"></label>
        <div class="two-col">
          <label class="fld"><span>Alkupäivä</span><input id="a_start" type="date" value="${today}" max="${today}"></label>
          <label class="fld"><span>Loppupäivä <em>(valinnainen)</em></span><input id="a_end" type="date" max="${today}"></label>
        </div>
        <label class="fld"><span>Vakavuus <em>(loukkaantuminen)</em></span><select id="a_sev"><option value="">-</option><option>lievä</option><option>kohtalainen</option><option>vakava</option></select></label>
        <label class="fld"><span>Kuvaus</span><textarea id="a_note" rows="3" placeholder="Lisätiedot ja vaikutus harjoitteluun..."></textarea></label>
      </div>
      <div class="modal-actions"><button class="btn-ghost" id="a_cancel">Peruuta</button><button class="btn-primary" id="a_save">Tallenna merkintä</button></div>
    </div>`);
  back.appendChild(modal);
  document.body.appendChild(back);
  const close = () => back.remove();
  back.onclick = (e) => { if (e.target === back) close(); };
  $('#a_cancel').onclick = close;
  $('#a_save').onclick = () => {
    const start = $('#a_start').value;
    if (!start) { alert('Anna alkupäivä.'); return; }
    const typeCode = $('#a_type').value;
    const title = $('#a_title').value.trim() || types.find((t) => t[0] === typeCode)[1];
    const ann = { id: 'ann-' + Date.now() + '-' + Math.round(Math.random() * 1e4), type: typeCode, title, startDate: start, endDate: $('#a_end').value || null, severity: $('#a_sev').value || null, note: $('#a_note').value.trim(), userAdded: true };
    p.annotations.push(ann);
    persistAnnot(p.id, ann);
    close();
    render();
  };
}

/* =========================================================================
   SVG CHARTS
   ========================================================================= */
function plotFrame(W, H, mg, xTicks, yTicks, xToPx, yToPx) {
  let g = '';
  for (const yt of yTicks) {
    const y = yToPx(yt);
    g += `<line x1="${mg.l}" y1="${y}" x2="${W - mg.r}" y2="${y}" stroke="var(--line)" stroke-width="1"/>`;
    g += `<text x="${mg.l - 8}" y="${y + 4}" fill="var(--muted)" font-size="11" text-anchor="end">${yt}</text>`;
  }
  for (const xt of xTicks) g += `<text x="${xToPx(xt.v)}" y="${H - mg.b + 18}" fill="var(--muted)" font-size="11" text-anchor="middle">${xt.label}</text>`;
  return g;
}
function ticks(lo, hi, n = 5) {
  const step = (hi - lo) / n, out = [];
  for (let i = 0; i <= n; i++) out.push(Math.round((lo + step * i) * 10) / 10);
  return [...new Set(out)];
}
function lineChart(points, opts) {
  const W = 600, H = 280, mg = { l: 44, r: 16, t: 14, b: 34 };
  const refs = (opts.refPoints || []).filter((r) => r.y != null);
  const xs = points.map((p) => p.t), ys = points.map((p) => p.y).concat(refs.map((r) => r.y));
  const xlo = Math.min(...xs), xhi = Math.max(...xs);
  let ylo = Math.min(...ys), yhi = Math.max(...ys);
  const pad = (yhi - ylo) * 0.18 || 1; ylo -= pad; yhi += pad;
  const xToPx = (t) => mg.l + (xhi === xlo ? 0.5 : (t - xlo) / (xhi - xlo)) * (W - mg.l - mg.r);
  const yToPx = (v) => H - mg.b - (v - ylo) / (yhi - ylo) * (H - mg.t - mg.b);
  const xTicks = points.map((p) => ({ v: p.t, label: fmtD(p.s.date) })).filter((_, i, a) => a.length <= 6 || i % Math.ceil(a.length / 6) === 0 || i === a.length - 1);
  const yTk = ticks(ylo + pad * 0.4, yhi - pad * 0.4, 4);
  let spans = '';
  for (const s of (opts.injurySpans || [])) {
    const x1 = xToPx(Math.max(xlo, s.start)), x2 = xToPx(Math.min(xhi, s.end));
    spans += `<rect x="${x1}" y="${mg.t}" width="${Math.max(2, x2 - x1)}" height="${H - mg.t - mg.b}" fill="var(--red)" opacity="0.10"/>`;
    spans += `<text x="${(x1 + x2) / 2}" y="${mg.t + 12}" fill="var(--red)" font-size="10" text-anchor="middle" opacity=".8">vamma</text>`;
  }
  let refLine = '';
  if (refs.length) {
    const rp = refs.slice().sort((a, b) => a.t - b.t);
    const rpath = rp.map((r, i) => `${i ? 'L' : 'M'}${xToPx(r.t).toFixed(1)},${yToPx(r.y).toFixed(1)}`).join(' ');
    const rdots = rp.map((r) => `<rect x="${(xToPx(r.t) - 3).toFixed(1)}" y="${(yToPx(r.y) - 3).toFixed(1)}" width="6" height="6" fill="none" stroke="#9aa7b8" stroke-width="1.5"><title>${opts.refLabel || 'Vertailutaso'} ${r.label || ''}: ${r.y}${opts.unit}</title></rect>`).join('');
    refLine = `<path d="${rpath}" fill="none" stroke="#9aa7b8" stroke-width="1.8" stroke-dasharray="5 4" opacity=".85"/>${rdots}`;
  }
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${xToPx(p.t).toFixed(1)},${yToPx(p.y).toFixed(1)}`).join(' ');
  const area = `M${xToPx(points[0].t).toFixed(1)},${H - mg.b} ` + points.map((p) => `L${xToPx(p.t).toFixed(1)},${yToPx(p.y).toFixed(1)}`).join(' ') + ` L${xToPx(points[points.length - 1].t).toFixed(1)},${H - mg.b} Z`;
  const dots = points.map((p) => {
    const ctx = [p.s.ageYears == null ? null : p.s.ageYears + 'v', p.s.league, p.s.flagged ? 'vamma-ajanjakso' : null].filter(Boolean);
    const fill = p.s.league == null ? opts.color : leagueColor(p.s.league);
    return `<circle cx="${xToPx(p.t).toFixed(1)}" cy="${yToPx(p.y).toFixed(1)}" r="5" fill="${fill}" stroke="${p.s.flagged ? 'var(--ink)' : 'var(--bg)'}" stroke-width="${p.s.flagged ? 2.5 : 1.5}"><title>${fmtD(p.s.date)} · ${p.y}${opts.unit}${ctx.length ? ' · ' + ctx.join(' · ') : ''}</title></circle>`;
  }).join('');
  return el(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">
    ${spans}${plotFrame(W, H, mg, xTicks, yTk, xToPx, yToPx)}
    <path d="${area}" fill="${opts.color}" opacity="0.08"/><path d="${path}" fill="none" stroke="${opts.color}" stroke-width="2.5"/>${refLine}${dots}</svg>`);
}
function scatterChart(data, opts) {
  const W = 600, H = 300, mg = { l: 44, r: 16, t: 14, b: 34 };
  const xlo = opts.xlo != null ? opts.xlo : 12, xhi = opts.xhi != null ? opts.xhi : 26;
  let ylo = Math.min(...data.map((d) => d.y)), yhi = Math.max(...data.map((d) => d.y));
  const pad = (yhi - ylo) * 0.12 || 1; ylo -= pad; yhi += pad;
  const xToPx = (a) => mg.l + (a - xlo) / (xhi - xlo) * (W - mg.l - mg.r);
  const yToPx = (v) => H - mg.b - (v - ylo) / (yhi - ylo) * (H - mg.t - mg.b);
  const span = xhi - xlo;
  const step = span <= 6 ? 1 : 2;
  const xTicks = [];
  for (let v = Math.ceil(xlo); v <= xhi; v += step) xTicks.push({ v, label: v + 'v' });
  const yTk = ticks(ylo + pad * 0.3, yhi - pad * 0.3, 4);
  let vline = '';
  if (opts.vline != null && opts.vline >= xlo && opts.vline <= xhi) {
    const vx = xToPx(opts.vline);
    vline = `<line x1="${vx}" y1="${mg.t}" x2="${vx}" y2="${H - mg.b}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 4" opacity=".5"/><text x="${vx}" y="${mg.t + 10}" fill="var(--muted)" font-size="10" text-anchor="middle" opacity=".85">vertailuikä</text>`;
  }
  const dots = data.map((d) => {
    const r = d.self ? 8 : 5, stroke = d.self ? 'var(--ink)' : 'var(--bg)';
    return `<circle data-pid="${d.pid || ''}" cx="${xToPx(d.x).toFixed(1)}" cy="${yToPx(d.y).toFixed(1)}" r="${r}" fill="${leagueColor(d.league)}" stroke="${stroke}" stroke-width="${d.self ? 2.5 : 1}" opacity="${d.self ? 1 : 0.85}"><title>${esc(d.name)} · ${d.x}v · ${d.league} · ${d.y}${opts.unit}</title></circle>`;
  }).join('');
  const present = [...new Set(data.map((d) => d.league))].map((c) => leagueOf(c)).sort((a, b) => a.level - b.level);
  const legend = present.map((l, i) => `<g transform="translate(${mg.l + i * 66},${H - 2})"><circle cx="4" cy="-4" r="4" fill="${leagueColor(l.code)}"/><text x="12" y="0" fill="var(--muted)" font-size="10">${l.code}</text></g>`).join('');
  return el(`<svg viewBox="0 0 ${W} ${H + 16}" width="100%" role="img">${plotFrame(W, H, mg, xTicks, yTk, xToPx, yToPx)}${vline}${dots}${legend}</svg>`);
}
/* Several series on one frame. `x` is either an age in years or a timestamp,
   depending on opts.xMode, so the same chart serves age-matched comparison and
   plain calendar-time trends. */
function multiLineChart(series, opts) {
  const W = 620, H = 320, mg = { l: 44, r: 16, t: 14, b: 34 };
  const byDate = opts.xMode === 'date';
  const allPts = series.flatMap((s) => s.points);
  if (!allPts.length) return el('<div class="empty">Ei dataa.</div>');
  const xsAll = allPts.map((p) => p.x);
  let xlo = Math.min(...xsAll), xhi = Math.max(...xsAll);
  if (!byDate) { xlo -= 0.3; xhi += 0.3; }
  if (xhi === xlo) { xhi = xlo + 1; }
  let ylo = Math.min(...allPts.map((p) => p.y)), yhi = Math.max(...allPts.map((p) => p.y));
  const pad = (yhi - ylo) * 0.12 || 1;
  /* A percentage gap or a power figure cannot be negative; padding below zero
     would draw axis labels for values that cannot occur. */
  ylo = opts.zeroFloor === false ? ylo - pad : Math.max(0, ylo - pad);
  yhi += pad;
  const xToPx = (a) => mg.l + (a - xlo) / (xhi - xlo) * (W - mg.l - mg.r);
  const yToPx = (v) => H - mg.b - (v - ylo) / (yhi - ylo) * (H - mg.t - mg.b);

  const xTicks = [];
  if (byDate) {
    const stamps = [...new Set(xsAll)].sort((a, b) => a - b);
    const stride = Math.ceil(stamps.length / 6);
    stamps.forEach((t, i) => {
      if (i % stride === 0 || i === stamps.length - 1) {
        const d = new Date(t);
        xTicks.push({ v: t, label: `${d.getUTCDate()}.${d.getUTCMonth() + 1}.` });
      }
    });
  } else {
    const step = (xhi - xlo) <= 6 ? 1 : 2;
    for (let v = Math.ceil(xlo); v <= xhi; v += step) xTicks.push({ v, label: v + 'v' });
  }
  const yTk = ticks(ylo + pad * 0.3, yhi - pad * 0.3, 4);

  const lines = series.filter((s) => !s.focus).map((s) => {
    const pts = s.points.slice().sort((a, b) => a.x - b.x);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xToPx(p.x).toFixed(1)},${yToPx(p.y).toFixed(1)}`).join(' ');
    const col = s.color || (s.league == null ? '#8896ab' : leagueColor(s.league));
    const dots = s.showDots ? pts.map((p) => `<circle cx="${xToPx(p.x).toFixed(1)}" cy="${yToPx(p.y).toFixed(1)}" r="3.5" fill="${col}" stroke="var(--bg)" stroke-width="1.2"/>`).join('') : '';
    return `<g><path d="${d}" fill="none" stroke="${col}" stroke-width="${s.showDots ? 2.2 : 1.8}" opacity="${s.showDots ? 0.95 : 0.6}"/>${dots}`
      + `<path data-pid="${s.pid || ''}" d="${d}" fill="none" stroke="transparent" stroke-width="12"><title>${esc(s.name)}${s.league ? ` (${s.league})` : ''}</title></path></g>`;
  }).join('');
  const f = series.find((s) => s.focus);
  let focusLine = '';
  if (f) {
    const pts = f.points.slice().sort((a, b) => a.x - b.x);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xToPx(p.x).toFixed(1)},${yToPx(p.y).toFixed(1)}`).join(' ');
    const lbl = (p) => byDate ? fmtD(p.s.date) : p.x + 'v';
    const dots = pts.map((p) => `<circle cx="${xToPx(p.x).toFixed(1)}" cy="${yToPx(p.y).toFixed(1)}" r="4" fill="var(--teal)" stroke="var(--bg)" stroke-width="1.5"><title>${esc(f.name)} · ${lbl(p)} · ${p.y}${opts.unit}</title></circle>`).join('');
    focusLine = `<path data-pid="${f.pid || ''}" d="${d}" fill="none" stroke="var(--teal)" stroke-width="3"/>${dots}`;
  }
  return el(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${plotFrame(W, H, mg, xTicks, yTk, xToPx, yToPx)}${lines}${focusLine}</svg>`);
}

function reportCurve(points, refPoints) {
  const W = 560, H = 190, mg = { l: 36, r: 14, t: 12, b: 24 };
  const refs = (refPoints || []).filter((r) => r.y != null);
  const xs = points.map((p) => p.t), ys = points.map((p) => p.y).concat(refs.map((r) => r.y));
  const xlo = Math.min(...xs), xhi = Math.max(...xs);
  let ylo = Math.min(...ys), yhi = Math.max(...ys);
  const pad = (yhi - ylo) * 0.18 || 1; ylo -= pad; yhi += pad;
  const xToPx = (t) => mg.l + (xhi === xlo ? 0.5 : (t - xlo) / (xhi - xlo)) * (W - mg.l - mg.r);
  const yToPx = (v) => H - mg.b - (v - ylo) / (yhi - ylo) * (H - mg.t - mg.b);
  const grid = ticks(ylo + pad * 0.4, yhi - pad * 0.4, 4).map((yt) => { const y = yToPx(yt); return `<line x1="${mg.l}" y1="${y}" x2="${W - mg.r}" y2="${y}" stroke="#e7e0d5"/><text x="${mg.l - 6}" y="${y + 3}" fill="#a49c90" font-size="10" text-anchor="end">${yt}</text>`; }).join('');
  const xt = points.filter((_, i, a) => a.length <= 6 || i % Math.ceil(a.length / 6) === 0 || i === a.length - 1)
    .map((p) => `<text x="${xToPx(p.t).toFixed(1)}" y="${H - 8}" fill="#a49c90" font-size="10" text-anchor="middle">${fmtD(p.s.date)}</text>`).join('');
  let refLine = '';
  if (refs.length) {
    const rp = refs.slice().sort((a, b) => a.t - b.t);
    refLine = `<path d="${rp.map((r, i) => `${i ? 'L' : 'M'}${xToPx(r.t).toFixed(1)},${yToPx(r.y).toFixed(1)}`).join(' ')}" fill="none" stroke="#c4bcae" stroke-width="1.6" stroke-dasharray="5 4"/>`;
  }
  const line = `<path d="${points.map((p, i) => `${i ? 'L' : 'M'}${xToPx(p.t).toFixed(1)},${yToPx(p.y).toFixed(1)}`).join(' ')}" fill="none" stroke="#6f9c8f" stroke-width="2.4"/>`;
  const dots = points.map((p) => `<circle cx="${xToPx(p.t).toFixed(1)}" cy="${yToPx(p.y).toFixed(1)}" r="4.5" fill="${p.s.league == null ? '#6f9c8f' : leagueColor(p.s.league)}" stroke="${p.s.flagged ? '#b06a5d' : '#faf8f4'}" stroke-width="${p.s.flagged ? 2.5 : 1.5}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${grid}${xt}${refLine}${line}${dots}</svg>`;
}

function renderReport(pid, sid) {
  const p = D.players.find((x) => x.id === pid);
  if (!p) return el('<div class="empty">Pelaajaa ei löytynyt.</div>');
  const sessions = p.sessions;
  const session = sessions.find((s) => s.id === sid) || last(p);
  const idx = sessions.indexOf(session);
  const prev = idx > 0 ? sessions[idx - 1] : null;
  const mm = session.measurements;

  const chg = (m, ref) => { if (!ref) return null; const a = m.get(ref), b = m.get(session); if (a == null || b == null || a === 0) return null; return (m.hb ? (b - a) / a : (a - b) / a) * 100; };

  // injuries overlapping the interval [prev..this]
  const intervalStart = prev ? prev.date : session.date;
  const injuries = p.annotations.filter((a) => a.type === 'injury' && a.startDate <= session.date && (a.endDate == null || a.endDate >= intervalStart));
  const activeInjury = injuries.length > 0;
  const otherEvents = p.annotations.filter((a) => a.type !== 'injury' && a.startDate <= session.date && (a.endDate == null || a.endDate >= intervalStart));

  /* Only tests this session actually carries, and compare each against the last
     session that measured it rather than the immediately preceding session. */
  const prevWith = (m) => { for (let i = idx - 1; i >= 0; i--) if (m.get(sessions[i]) != null) return sessions[i]; return null; };
  const firstWith = (m) => { for (const q of sessions) if (m.get(q) != null) return q; return null; };
  const rows = METRICS.filter((m) => m.get(session) != null).map((m) => {
    const pv = prevWith(m), fv = firstWith(m);
    const now = m.get(session), prevV = pv ? m.get(pv) : null, base = fv ? m.get(fv) : null;
    const peers = matchedValuesAtAgeLeague(session.ageYears, session.league, m, p.id);
    return { m, now, prevV, base, prevS: pv, cP: chg(m, pv), cB: chg(m, fv === session ? null : fv), pc: percentileRank(now, peers, m.hb), nPeers: peers.length };
  });

  const cmj = mm.cmj;
  const hasCmj = cmj.both != null && cmj.right != null && cmj.left != null;
  const hasSj = mm.sj.both != null;
  const ssc = hasCmj && hasSj ? ((cmj.both - mm.sj.both) / mm.sj.both) * 100 : null;
  const asymCmj = hasCmj ? Math.abs(cmj.right - cmj.left) / ((cmj.right + cmj.left) / 2) * 100 : null;
  const weakSide = hasCmj && cmj.right < cmj.left ? 'oikea' : 'vasen';
  const snapAsym = mm.snap.right != null && mm.snap.left != null ? Math.abs(mm.snap.right - mm.snap.left) / ((mm.snap.right + mm.snap.left) / 2) * 100 : null;
  /* Head-line metric: CMJ when measured, otherwise whatever this session has. */
  const headRow = rows.find((r) => r.m.code === 'cmj') || rows[0] || null;

  // overall verdict from average change vs baseline
  const cbVals = rows.map((r) => r.cB).filter((v) => v != null);
  const avgCb = cbVals.length ? cbVals.reduce((a, c) => a + c, 0) / cbVals.length : null;
  let verdict;
  if (!prev) verdict = 'Ensimmäinen testi. Lähtötaso on nyt kirjattu seurantaa varten.';
  else if (avgCb == null) verdict = 'Vakaa profiili.';
  else if (avgCb > 4) verdict = 'Selkeästi kehittyvä profiili, ohjelma toimii.';
  else if (avgCb > 1) verdict = 'Kehittyvä profiili.';
  else if (avgCb > -1) verdict = 'Vakaa profiili, kehitys tasaista.';
  else verdict = activeInjury ? 'Tilapäinen notkahdus, loukkaantuminen huomioiden. Trendi on tärkeämpi kuin yksittäinen tulos.' : 'Laskeva suunta, syytä seurata.';
  const bestB = rows.filter((r) => r.cB != null && r.cB > 0).sort((a, b) => b.cB - a.cB)[0];

  // strengths and development areas
  const strengths = [];
  rows.forEach((r) => { if (r.pc != null && r.pc >= 66) strengths.push(`${r.m.label}: vahva sarjassa (percentiili ${r.pc}.)`); });
  rows.forEach((r) => { if (r.cB != null && r.cB > 6) strengths.push(`${r.m.label}: +${r.cB.toFixed(1)} % lähtötasosta`); });
  if (asymCmj != null && asymCmj < 5) strengths.push('Tasapainoinen ponnistus, CMJ-sivuasymmetria alle 5 %');
  if (ssc != null && ssc >= 8) strengths.push('Hyvä elastisuus (SSC)');
  const strengthsU = [...new Set(strengths)].slice(0, 5);
  if (!strengthsU.length) strengthsU.push('Tasainen profiili ilman selkeitä huippuja.');

  const devAreas = [];
  rows.forEach((r) => { if (r.pc != null && r.pc <= 33) devAreas.push(`${r.m.label}: alle sarjatason (percentiili ${r.pc}.)`); });
  rows.forEach((r) => { if (r.cP != null && r.cP < -3) devAreas.push(`${r.m.label}: ${r.cP.toFixed(1)} % edellisestä${activeInjury ? ', loukkaantuminen huomioiden' : ''}`); });
  if (asymCmj != null && asymCmj > 8) devAreas.push(`Sivuasymmetria ${asymCmj.toFixed(1)} % (tavoite alle 5 %), heikompi ${weakSide}`);
  if (ssc != null && ssc < 3) devAreas.push('Matala elastisuus (SSC)');
  if (snapAsym != null && snapAsym > 8) devAreas.push(`Snap Drive -sivuasymmetria ${snapAsym.toFixed(1)} % (tavoite alle 5 %)`);
  const devU = [...new Set(devAreas)].slice(0, 5);
  if (!devU.length) devU.push('Ei merkittäviä kehityskohteita tässä testissä.');

  const recs = [];
  if (activeInjury) recs.push('Hallittu progressio: vältä maksimikuormia ja kovia iskutuksia kunnes oireet ovat rauhoittuneet. Painota kuormituksen seurantaa.');
  if (asymCmj != null && asymCmj > 8) recs.push(`Yksijalkaharjoittelu heikommalle puolelle (${weakSide}): lateraaliset loikat ja yhden jalan plyometria.`);
  if (ssc != null && ssc < 3) recs.push('Elastisuuden kehitys: reaktiiviset hypyt ja plyometria matalalla kontaktiajalla.');
  if (headRow && headRow.pc != null && headRow.pc < 40) recs.push('Räjähtävän voiman pohja: hallittu voimaharjoittelu ikätasolla ja hyppytekniikka.');
  if (snapAsym != null && snapAsym > 8) recs.push('Yhden jalan tehon tasapainotus: kohdennettu snap drive -työ heikommalle puolelle.');
  recs.push('Jatkuvuus ja terveys: säännöllinen seuranta ja riittävä palautuminen tukevat kehitystä.');

  const ctxItems = [
    ...injuries.map((a) => `<li><b>${esc(a.title)}</b>${a.severity ? ` (${a.severity})` : ''}: ${a.endDate ? `${fmtD(a.startDate)} ... ${fmtD(a.endDate)}` : `${fmtD(a.startDate)} alkaen`}. ${esc(a.note)}</li>`),
    ...otherEvents.map((a) => `<li><b>${esc(a.title)}</b>: ${esc(a.note)}</li>`),
  ];

  const fmtChg = (c) => c == null ? '<span class="rp-mut">-</span>' : `<span class="${c > 1.5 ? 'rp-up' : c < -1.5 ? 'rp-down' : 'rp-mut'}">${c > 0 ? '+' : ''}${c.toFixed(1)} %</span>`;

  // development chart (CMJ) with the shifting own-league benchmark
  const cm = headRow ? headRow.m : metric('cmj');
  const cpts = p.sessions.map((s) => ({ t: parseD(s.date).getTime(), y: cm.get(s), s })).filter((pt) => pt.y != null);
  const ownBase = p.baseline2025 ? p.baseline2025[cm.code] : null;
  const crefs = HAS_PEERS
    ? p.sessions.map((s) => { const v = matchedValuesAtAgeLeague(s.ageYears, s.league, cm, p.id); return { t: parseD(s.date).getTime(), y: v.length ? Math.round((v.reduce((a, c) => a + c, 0) / v.length) * 10) / 10 : null }; })
    : (ownBase == null ? [] : cpts.map((pt) => ({ t: pt.t, y: ownBase })));
  const refName = HAS_PEERS ? 'oman sarjan taso' : 'kauden 2025 taso';
  const chartLeagues = HAS_LEAGUES ? [...new Set(p.sessions.map((s) => s.league).filter(Boolean))].sort((a, b) => leagueOf(a).level - leagueOf(b).level) : [];
  const chartLegend = `<div class="rp-legend"><span class="lg-item"><span class="lg-line" style="background:#6f9c8f"></span>oma ${esc(cm.label)}</span>${crefs.length ? `<span class="lg-item"><span class="lg-line dashed"></span>${refName}</span>` : ''}${chartLeagues.map((c) => `<span class="lg-item">${leagueSwatch(c)}${esc(c)}</span>`).join('')}</div>`;

  const container = el('<div class="report"></div>');
  const actions = el('<div class="report-actions no-print"></div>');
  const back = el('<button class="btn-ghost">← Takaisin pelaajaan</button>');
  back.onclick = () => openPlayer(p.id);
  const print = el('<button class="btn-primary">Tulosta tai tallenna PDF</button>');
  print.onclick = () => window.print();
  actions.appendChild(back); actions.appendChild(print);
  container.appendChild(actions);

  container.appendChild(el(`
    <div class="report-doc">
      <header class="rp-head">
        <div>
          <div class="rp-title">${esc(p.name)}</div>
          <div class="rp-kicker">SBAQ-analyysi</div>
        </div>
        <div class="rp-meta">
          ${[session.ageYears == null ? null : session.ageYears + ' v', p.position].filter(Boolean).length ? `<div>${[session.ageYears == null ? null : session.ageYears + ' v', esc(p.position || '')].filter(Boolean).join(' · ')}</div>` : ''}
          ${[session.heightCm == null ? null : session.heightCm + ' cm', session.weightKg == null ? null : session.weightKg + ' kg', session.league].filter(Boolean).length ? `<div>${[session.heightCm == null ? null : session.heightCm + ' cm', session.weightKg == null ? null : session.weightKg + ' kg', session.league].filter(Boolean).join(' · ')}</div>` : ''}
          <div>Testipäivä ${fmtDLong(session.date)}</div>
        </div>
      </header>

      <section><h4>Tiivistelmä</h4>
        <div class="rp-tldr">
          <div class="rp-cardlet"><div class="k">${headRow ? esc(headRow.m.label) : 'Tulos'} nyt</div><div class="v">${!headRow || headRow.now == null ? '-' : num(headRow.now, headRow.m.unit) + ' ' + headRow.m.unit}</div><div class="s">vs edellinen ${fmtChg(headRow && headRow.cP)}</div></div>
          <div class="rp-cardlet"><div class="k">Suurin kehitys</div><div class="v">${bestB ? '+' + bestB.cB.toFixed(1) + ' %' : '-'}</div><div class="s">${bestB ? esc(bestB.m.label) : 'lähtötasosta'}</div></div>
          ${HAS_PEERS && headRow
            ? `<div class="rp-cardlet"><div class="k">${esc(headRow.m.label)} sarjassa ${esc(session.league)}</div><div class="v">${headRow.pc == null ? '-' : headRow.pc + '.'}</div><div class="s">percentiili${headRow.pc == null ? ', liian pieni joukko' : ' (' + headRow.nPeers + ' vertailtavaa)'}</div></div>`
            : `<div class="rp-cardlet"><div class="k">Mitattu</div><div class="v">${rows.length}</div><div class="s">testiä tällä kerralla</div></div>`}
          <div class="rp-cardlet"><div class="k">Kehitys lähtötasosta</div><div class="v">${avgCb == null ? '-' : (avgCb > 0 ? '+' : '') + avgCb.toFixed(1) + ' %'}</div><div class="s">keskimäärin testeittäin</div></div>
        </div>
        <div class="rp-verdict"><b>Kokonaisarvio:</b> ${verdict}</div>
      </section>

      ${ctxItems.length ? `<section><h4>Konteksti</h4><ul class="rp-list">${ctxItems.join('')}</ul></section>` : ''}

      ${cpts.length >= 2 ? `<section><h4>Kehityskaari (${esc(cm.label)})</h4><div class="rp-chart">${reportCurve(cpts, crefs)}</div>${chartLegend}</section>` : ''}

      <section><h4>Kehitys testeittäin</h4>
        <table class="rp-table">
          <thead><tr><th>Testi</th><th>Lähtö</th><th>Edellinen</th><th>Nyt</th><th>vs edellinen</th><th>vs lähtö</th>${HAS_PEERS ? `<th>Percentiili (${esc(session.league)})</th>` : ''}</tr></thead>
          <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.m.label)} <span class="rp-mut">${r.m.unit}</span></td>
            <td>${num(r.base, r.m.unit)}</td>
            <td>${r.prevV == null ? '<span class="rp-mut">-</span>' : num(r.prevV, r.m.unit)}</td>
            <td><b>${num(r.now, r.m.unit)}</b></td>
            <td>${fmtChg(r.cP)}</td>
            <td>${fmtChg(r.cB)}</td>
            ${HAS_PEERS ? `<td>${r.pc == null ? '<span class="rp-mut">-</span>' : r.pc + '.'}</td>` : ''}
          </tr>`).join('')}
          </tbody>
        </table>
      </section>

      <section><h4>Suhdeluvut (SBAQ-profiilin laatu)</h4>
        <ul class="rp-ratios">
          <li>SSC eli elastisuus (CMJ vs SJ): <b>${ssc == null ? '-' : ssc.toFixed(1) + ' %'}</b> <span class="rp-mut">(optimi +10...15 %)</span></li>
          <li>Bilateraalinen suhde: <b>${hasCmj ? (cmj.both / (cmj.right + cmj.left)).toFixed(2) : '-'}</b> <span class="rp-mut">(normaali 0,90...1,10)</span></li>
          <li>CMJ-sivuasymmetria: <b>${asymCmj == null ? '-' : asymCmj.toFixed(1) + ' %'}</b> <span class="rp-mut">(optimi alle 5 %)</span></li>
          <li>Snap Drive -sivuasymmetria: <b>${snapAsym == null ? '-' : snapAsym.toFixed(1) + ' %'}</b> <span class="rp-mut">(optimi alle 5 %)</span></li>
          <li>Keiser, teho suhteessa painoon: <b>${mm.keiser.wattsPerKg == null ? '-' : mm.keiser.wattsPerKg.toFixed(1) + ' W/kg'}</b> <span class="rp-mut">${mm.keiser.watts == null ? '' : '(' + mm.keiser.watts + ' W)'}</span></li>
        </ul>
      </section>

      <section><h4>Vahvuudet ja kehityskohteet</h4>
        <div class="rp-cols">
          <div class="rp-col good"><h5>Vahvuudet</h5><ul class="rp-list">${strengthsU.map((o) => `<li>${o}</li>`).join('')}</ul></div>
          <div class="rp-col dev"><h5>Kehityskohteet</h5><ul class="rp-list">${devU.map((o) => `<li>${o}</li>`).join('')}</ul></div>
        </div>
      </section>

      <section><h4>Suositukset</h4><ul class="rp-list">${recs.map((o) => `<li>${o}</li>`).join('')}</ul></section>

      <footer class="rp-foot">Automaattinen luonnos SBAQ-datasta. Lopullisessa versiossa AI täydentää sanallisen analyysin. Tulostettavissa PDF:ksi selaimen tulostustoiminnolla.</footer>
    </div>`));
  return container;
}

/* ---------- router ---------- */
function render() {
  renderTabs();
  const app = $('#app');
  app.innerHTML = '';
  let node;
  if (state.view === 'compare') node = renderCompare();
  else if (state.view === 'player') node = renderPlayer(state.playerId);
  else if (state.view === 'report') node = renderReport(state.playerId, state.reportSid);
  else node = renderRoster();
  app.appendChild(node);
  window.scrollTo({ top: 0 });
}

/* ---------- boot ---------- */
mergeAll();
/* Say which dataset is loaded. Real measurements and a synthetic demo must
   never be mistaken for one another. */
$('#dataNote').textContent = D.meta.dataset === 'real'
  ? `Oikeat mittaustulokset (${D.meta.playerCount} pelaajaa, ${D.players.reduce((a, p) => a + p.sessions.length, 0)} testikertaa) · nimet pseudonymisoitu · numerot lasketaan datasta`
  : `Demo · synteettinen data (${D.meta.playerCount} pelaajaa) · numerot lasketaan datasta, eivät ole oikeita henkilöitä`;
initRole();
/* Suora linkki: app/#p1 avaa pelaajan, app/#vertailu vertailun. */
(function () {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'vertailu') state.view = 'compare';
  else if (h && D.players.some((pl) => pl.id === h)) { state.view = 'player'; state.playerId = h; }
})();
render();
