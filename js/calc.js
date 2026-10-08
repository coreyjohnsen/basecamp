// Planning maths: times, itinerary, conditions, hazard ratings, sun and moon. No DOM, no network.
import { st, cur, live, iso, parseDate } from './store.js';
import { CONFIG } from './config.js';
import { daySummary } from './live.js';

export const HZ = { crev: 'Crevasses', rock: 'Rockfall', ice: 'Icefall', avy: 'Avalanche', fall: 'Exposure', nav: 'Whiteout / nav', alt: 'Altitude' };
export const HZS = { crev: 'Crv', rock: 'Rck', ice: 'Ice', avy: 'Avy', fall: 'Exp', nav: 'Nav', alt: 'Alt' };
export const TER = { trail: 'Trail', snow: 'Snow', glacier: 'Glacier', scramble: 'Scramble', rock: '5th-class rock', ice: 'Steep ice' };
export const LEVEL = ['', 'Fit hiker with ice-axe basics', 'Basic glacier travel', 'Intermediate alpine', 'Advanced alpine', 'Expert'];

/* ---------- time and itinerary ---------- */
// Munter-style rates (km-effort per hour) by terrain. Descents run 1.6× faster; thin air slows the climb.
const RATE = { trail: 4.6, snow: 3.6, glacier: 3.2, scramble: 2.6, rock: 1.5, ice: 1.6 };
export function secTime(R, i, dir) {
  const a = R.waypoints[i], b = R.waypoints[i + 1], s = R.sections[i], de = (b.ele - a.ele) * dir * 0.3048, km = s.miles * 1.609, top = Math.max(a.ele, b.ele);
  let h = de >= 0 ? (km + de / 100) / RATE[s.terrain] : (km - de / 100) / (RATE[s.terrain] * 1.6);
  h *= top > 12000 ? (de >= 0 ? 1.25 : 1.08) : top > 10000 ? (de >= 0 ? 1.12 : 1.04) : 1;
  return h * st.pace;
}
export function leg(R, a, b) {
  let mi = 0, up = 0, dn = 0, h = 0; const dir = b > a ? 1 : -1;
  for (let i = Math.min(a, b); i < Math.max(a, b); i++) { mi += R.sections[i].miles; const de = (R.waypoints[i + 1].ele - R.waypoints[i].ele) * dir; if (de > 0) up += de; else dn -= de; h += secTime(R, i, dir); }
  return { mi, up, dn, h };
}
export function campsFor(R) {
  if (!st.camps[R.id]) st.camps[R.id] = R.waypoints.map((p, i) => p.sleep ? i : -1).filter(i => i > 0);
  // Drop anything that no longer points at a camp (the data may have been edited).
  st.camps[R.id] = st.camps[R.id].filter(i => R.waypoints[i]?.type === 'camp');
  return st.camps[R.id];
}
export function plan(R = cur.route) {
  const n = R.waypoints.length - 1, camps = campsFor(R).slice().sort((a, b) => a - b), stops = [0, ...camps], days = [];
  for (let j = 0; j < stops.length - 1; j++) days.push({ type: 'approach', from: stops[j], to: stops[j + 1], ...leg(R, stops[j], stops[j + 1]) });
  const hi = stops[stops.length - 1], up = leg(R, hi, n), out = leg(R, hi, 0);
  const same = hi === 0 || st.walk === 'same' || (st.walk === 'auto' && camps.length <= 1 && out.h <= 4.5);
  const dn = leg(R, n, same ? 0 : hi);
  days.push({ type: 'summit', from: hi, to: same ? 0 : hi, up, dn, mi: up.mi + dn.mi, upft: up.up + dn.up, h: up.h + dn.h });
  if (!same) days.push({ type: 'out', from: hi, to: 0, ...out });
  return { days, camps, hi, same, nights: days.length - 1, summitIdx: days.findIndex(d => d.type === 'summit') };
}
export function totals(R) { const n = R.waypoints.length - 1, u = leg(R, 0, n), d = leg(R, n, 0); return { mi: u.mi * 2, gain: u.up + d.up, h: u.h + d.h }; }

/* ---------- dates ---------- */
export const startDate = () => parseDate(st.date);
export const summitDate = () => new Date(startDate().getTime() + plan().summitIdx * 864e5);
export const monthF = () => { const d = summitDate(); return d.getMonth() + (d.getDate() - 1) / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
export const inRange = (m, [s, e]) => (m >= s && m <= e) || (m + 12 >= s && m + 12 <= e);
export const fmtDate = (d = startDate()) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtDay = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export function seasonState(R = cur.route) { const m = monthF(); return inRange(m, R.prime) ? ['Prime season', 0] : inRange(m, R.season) ? ['Shoulder season', 1] : ['Outside the usual season', 3]; }

/* ---------- conditions ---------- */
// Typical fair-weather freezing level (ft) for the Washington Cascades, mid-month. Used only beyond the forecast range.
const FLM = [4000, 4000, 4500, 6000, 8000, 10500, 13000, 13500, 12000, 9000, 6000, 4500];
export function seasFL() { const m = monthF() - 0.5, i = Math.floor(m), f = m - i; return Math.round((FLM[(i + 12) % 12] * (1 - f) + FLM[(i + 13) % 12] * f) / 500) * 500; }
/** Live forecast summary at the summit for the summit day, or null if that day is out of range. */
export function liveDay(pi = cur.route.waypoints.length - 1) { return live.fc ? daySummary(live.fc, pi, iso(summitDate())) : null; }
/** The four numbers every hazard and gear rule runs on, and where they came from. */
export function FC() {
  if (st.fcMode !== 'manual') {
    const d = liveDay();
    if (d && d.fl != null) return { fl: Math.round(d.fl / 100) * 100, wind: Math.round(d.wind), snow: +d.snow48.toFixed(1), sky: d.sky, src: 'live' };
    return { fl: seasFL(), wind: 15, snow: 0, sky: 0, src: 'seasonal' };
  }
  return { fl: st.fc.fl ?? seasFL(), wind: st.fc.wind ?? 15, snow: st.fc.snow ?? 0, sky: st.fc.sky ?? 0, src: 'manual' };
}
export const tempAt = e => 32 + (FC().fl - e) * 0.0035;   // 3.5°F per 1,000 ft
export function windAt(e) { const R = cur.route, lo = R.waypoints[0].ele, hi = cur.peak.elev; return FC().wind * (0.3 + 0.7 * Math.max(0, Math.min(1, (e - lo) / (hi - lo)))); }
export function chill(T, V) { return (T > 50 || V < 3) ? T : 35.74 + 0.6215 * T - 35.75 * Math.pow(V, 0.16) + 0.4275 * T * Math.pow(V, 0.16); }
/** Per-waypoint row for the conditions table: live values when available, lapse-rate estimates otherwise. */
export function waypointWx(i) {
  const p = cur.route.waypoints[i], d = FC().src === 'live' ? liveDay(i) : null;
  if (d) return { hi: d.hi, lo: d.lo, wind: d.wind, gust: d.gust, chill: chill(d.lo ?? d.hi, d.wind), depth: d.depth, live: true };
  const T = tempAt(p.ele), w = windAt(p.ele);
  return { hi: T, lo: T - 9, wind: w, gust: null, chill: chill(T - 9, w), depth: null, live: false };
}
/** Overnight low estimate at an elevation, from the live series when the camp is a waypoint with data. */
export function nightLow(i) { const w = waypointWx(i); return w.lo ?? tempAt(cur.route.waypoints[i].ele) - 9; }

/* ---------- hazards ---------- */
/** Section ratings 0–3: the authored normal-season value, shifted by date and conditions. */
export function hzAdj(R, i) {
  const s = R.sections[i], top = Math.max(R.waypoints[i].ele, R.waypoints[i + 1].ele), f = FC(), m = monthF(), o = {};
  for (const k in HZ) {
    let v = (s.hazards || {})[k] || 0;
    if (v) {
      if (k === 'crev' && m >= 7 && m < 10) v++;                                   // thin bridges from August
      if (k === 'rock' && f.fl > top && m >= 6 && m < 10) v++;                     // no refreeze above the section
      if (k === 'ice' && f.fl > top + 1000) v++;
      if (k === 'avy') { if (f.snow >= 6 || m < 5 || m >= 10.5) v++; else if (m >= 6.5 && m < 9.5 && f.snow < 2) v--; }
      if (k === 'nav' && f.sky === 2) v++;
      if (k === 'fall' && m >= 7.5 && m < 10 && /glacier|snow|ice/.test(s.terrain)) v++;   // hard late-season ice
    }
    o[k] = Math.max(0, Math.min(3, v));
  }
  return o;
}
export const hzMax = (R, i) => Math.max(0, ...Object.values(hzAdj(R, i)));
export function flags() {
  const R = cur.route, M = cur.peak, f = FC(), out = [], ss = seasonState(), d = f.src === 'live' ? liveDay() : null;
  const any = k => R.sections.some(s => (s.hazards || {})[k]);
  const Ts = d?.lo ?? tempAt(M.elev), wc = chill(Ts, f.wind);
  if (ss[1] === 3) out.push([3, `${fmtDate(summitDate())} is outside the usual season for this route. Expect winter conditions, closed roads or a broken-up glacier.`]);
  if (f.wind >= 40) out.push([3, `Summit winds near ${f.wind} mph. Most parties turn around above 35–40 mph.`]);
  else if (f.wind >= 25) out.push([2, `Summit winds near ${f.wind} mph. Expect to be pushed around on exposed ridges; bring goggles.`]);
  if (d && d.pr >= 0.25) out.push([d.pr >= 0.75 ? 3 : 2, `${d.pr.toFixed(2)} in of precipitation forecast at the summit${d.sn >= 1 ? `, ${d.sn.toFixed(0)} in of it as snow` : ''}.`]);
  if (f.fl > M.elev && (any('crev') || any('rock') || any('ice'))) out.push([2, 'Freezing level is above the summit, so nothing refreezes overnight. Snow bridges soften and rockfall starts early. Leave earlier and be off the upper mountain by mid-morning.']);
  if (wc < 0) out.push([wc < -15 ? 3 : 2, `Wind chill near ${Math.round(wc)}°F on top. Frostbite risk on exposed skin; carry mitts and face cover.`]);
  if (f.snow >= 6 && any('avy')) out.push([f.snow >= 12 ? 3 : 2, `${Math.round(f.snow)} in of new snow in the 48 hours before. Read the avalanche forecast and give it time to settle.`]);
  if (f.sky === 2 && R.sections.some(s => ((s.hazards || {}).nav || 0) >= 2)) { const i = R.sections.findIndex(s => ((s.hazards || {}).nav || 0) >= 2); out.push([2, `In cloud, ${R.waypoints[i].name} to ${R.waypoints[i + 1].name} is hard to navigate. Carry a GPS track and wands.`]); }
  if (!out.length) out.push([0, 'No red flags from these numbers.']);
  return out.sort((a, b) => b[0] - a[0]);
}
/** 0 good, 2 caution, 3 poor: a quick read of one forecast day for the 7-day strip. */
export function rateDay(d, R = cur.route) {
  if (!d) return 0;
  const avy = R.sections.some(s => (s.hazards || {}).avy), nav = R.sections.some(s => ((s.hazards || {}).nav || 0) >= 2);
  if (d.wind >= 40 || d.pr >= 0.75 || (d.snow48 >= 12 && avy)) return 3;
  if (d.wind >= 25 || d.pr >= 0.2 || (d.snow48 >= 6 && avy) || (d.sky === 2 && nav)) return 2;
  return 0;
}

/* ---------- date finder ---------- */
export const today = () => parseDate(iso(new Date()));
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
/** The finder's range, filling in a rolling two weeks from today and never starting in the past. */
export function winRange() {
  const t = today(), w = st.win || {};
  let from = w.from ? parseDate(w.from) : t; if (from < t) from = t;
  let to = w.to ? parseDate(w.to) : addDays(from, 13); if (to < from) to = from;
  return { from, to };
}
/** Weather score 0–100 for a trip starting on `start`, with the reasons behind it. src: live, rough (past the reliable range) or season. */
export function scoreTrip(start, R = cur.route, pl = plan(R)) {
  const n = R.waypoints.length - 1, sd = addDays(start, pl.summitIdx), m = sd.getMonth() + (sd.getDate() - 1) / new Date(sd.getFullYear(), sd.getMonth() + 1, 0).getDate();
  const season = inRange(m, R.prime) ? 0 : inRange(m, R.season) ? 1 : 3;
  const seasonPen = [0, 12, 0, 45][season], seasonWhy = season === 1 ? 'shoulder season' : season === 3 ? 'outside the usual season' : '';
  const d = live.fc ? daySummary(live.fc, n, iso(sd)) : null;
  if (!d) return { score: Math.max(0, 70 - seasonPen), src: 'season', season, why: [seasonWhy || 'prime season'].filter(Boolean) };
  const avy = R.sections.some(s => (s.hazards || {}).avy), nav = R.sections.some(s => ((s.hazards || {}).nav || 0) >= 2);
  const melt = R.sections.some(s => (s.hazards || {}).crev || (s.hazards || {}).rock || (s.hazards || {}).ice);
  const pens = [];
  const pen = (v, why) => { if (v > 0.5) pens.push([v, why]); };
  pen((d.wind - 15) * 1.6, `${Math.round(d.wind)} mph wind on top`);
  pen(d.pr * 70, d.sn >= 1 ? `${d.sn.toFixed(0)} in of snow on summit day` : `${d.pr.toFixed(2)} in of rain on summit day`);
  if (avy) pen((d.snow48 - 2) * 2.5, `${Math.round(d.snow48)} in of new snow before summit day`);
  pen(d.sky === 2 ? (nav ? 20 : 12) : d.sky === 1 ? 4 : 0, d.sky === 2 ? 'in cloud' : 'partly cloudy');
  if (melt && d.fl > cur.peak.elev) pen(8, 'no overnight refreeze');
  const wc = chill(d.lo ?? d.hi, d.wind); pen(wc < -10 ? 10 : wc < 5 ? 4 : 0, `wind chill near ${Math.round(wc)}°F`);
  // The other days of the trip: rain or snow in camp and on the approach.
  pl.days.forEach((_, i) => {
    if (i === pl.summitIdx) return;
    const o = daySummary(live.fc, pl.hi, iso(addDays(start, i)));
    if (o) pen(o.pr * 35, `wet day ${i + 1}`);
  });
  pen(seasonPen, seasonWhy);
  let score = 100 - pens.reduce((a, b) => a + b[0], 0);
  const r = rateDay(d, R); if (r === 3) score = Math.min(score, 45); else if (r === 2) score = Math.min(score, 75);
  const out = Math.round((sd - today()) / 864e5) + 1;
  const good = [d.wind < 20 && 'light wind', d.pr < 0.05 && 'dry', d.sky === 0 && 'clear', d.fl != null && `freezing level ${(Math.round(d.fl / 500) * 500).toLocaleString('en-US')} ft`].filter(Boolean);
  return { score: Math.max(0, Math.round(score)), src: out > (CONFIG.weather.reliableDays || 7) ? 'rough' : 'live', season, day: d,
    why: pens.length ? pens.sort((a, b) => b[0] - a[0]).slice(0, 2).map(p => p[1]) : good.slice(0, 3) };
}
/** Every trip that fits the range with all of its days on allowed weekdays, best first. */
export function findWindows(R = cur.route) {
  const pl = plan(R), len = pl.days.length, { from, to } = winRange(), dow = new Set((st.win || {}).dow || [0, 1, 2, 3, 4, 5, 6]);
  const all = [];
  for (let s = from; addDays(s, len - 1) <= to; s = addDays(s, 1)) {
    let ok = true; for (let i = 0; i < len; i++) if (!dow.has(addDays(s, i).getDay())) { ok = false; break; }
    if (ok) all.push({ start: s, end: addDays(s, len - 1), summit: addDays(s, pl.summitIdx), ...scoreTrip(s, R, pl) });
  }
  const rank = c => c.score - (c.src === 'season' ? 30 : c.src === 'rough' ? 8 : 0);
  return { len, all, best: [...all].sort((a, b) => rank(b) - rank(a) || a.start - b.start).slice(0, 3) };
}
export const scoreLabel = s => s >= 80 ? 'Good' : s >= 60 ? 'Fair' : 'Poor';

/* ---------- sun and moon ---------- */
function pacOff(d) { const y = d.getFullYear(), a = new Date(y, 2, 1), b = new Date(y, 10, 1); const s = new Date(y, 2, 1 + (7 - a.getDay()) % 7 + 7), e = new Date(y, 10, 1 + (7 - b.getDay()) % 7); return d >= s && d < e ? -7 : -8; }
export function sun(d = summitDate()) {
  const [lon, lat] = cur.peak.summit, N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5), g = 2 * Math.PI / 365 * (N - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const la = lat * Math.PI / 180, ha = Math.acos(Math.cos(90.833 * Math.PI / 180) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec)) * 180 / Math.PI, off = pacOff(d) * 60;
  return { rise: 720 - 4 * (lon + ha) - eq + off, set: 720 - 4 * (lon - ha) - eq + off, tz: off === -420 ? 'PDT' : 'PST' };
}
export function moon(d = summitDate()) {
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5, p = ((days / 29.530588853) % 1 + 1) % 1;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return { ill: Math.round((1 - Math.cos(2 * Math.PI * p)) / 2 * 100), name: names[Math.round(p * 8) % 8] };
}
export const tm = m => { m = ((Math.round(m / 5) * 5) % 1440 + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + ':' + String(mm).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); };
export const hrs = h => { const m = Math.round(h * 4) * 15; return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + m % 60 + ' min' : ''); };
export function summitTimes(pl = plan()) {
  const R = cur.route, s = sun(), d = pl.days[pl.summitIdx], n = R.waypoints.length - 1;
  const snowy = R.sections.slice(d.from, n).some(x => /snow|glacier|ice/.test(x.terrain)); let dep, top, turn;
  if (snowy) { top = Math.max(360, Math.min(510, s.rise + 90)); dep = top - d.up.h * 60; if (dep < 60) { dep = 60; top = dep + d.up.h * 60; } turn = Math.min(top + 150, Math.max(720, top)); }
  else { dep = s.rise - 30; top = dep + d.up.h * 60; turn = Math.max(top, s.set - 60 - d.dn.h * 60); }
  return { dep, wake: dep - 60, top, turn, back: top + 30 + d.dn.h * 60, snowy };
}
