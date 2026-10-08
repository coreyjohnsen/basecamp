// Live sources: Open-Meteo forecast, NWS text forecast and alerts, avalanche center, NPS alerts.
// Every function resolves to data or throws; callers show a per-source status instead of failing the page.
import { CONFIG } from './config.js';

const mem = new Map();
async function cached(key, ttlMin, fn) {
  const now = Date.now(), hit = mem.get(key);
  if (hit && now - hit.t < ttlMin * 6e4) return hit.v;
  try { const s = JSON.parse(sessionStorage.getItem('wmh2.c.' + key)); if (s && now - s.t < ttlMin * 6e4) { mem.set(key, s); return s.v; } } catch (e) { /* ignore */ }
  const v = await fn(), rec = { t: now, v };
  mem.set(key, rec);
  try { sessionStorage.setItem('wmh2.c.' + key, JSON.stringify(rec)); } catch (e) { /* ignore */ }
  return v;
}
/** Forget everything fetched so far, so the next request goes to the network. */
export function clearCache() {
  mem.clear();
  try { Object.keys(sessionStorage).filter(k => k.startsWith('wmh2.c.')).forEach(k => sessionStorage.removeItem(k)); } catch (e) { /* ignore */ }
}
async function getJSON(url, opts) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message || 'network error'); }
  finally { clearTimeout(timer); }
}

/* ---------- Open-Meteo ---------- */
const HOURLY = ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'precipitation', 'snowfall', 'cloud_cover', 'freezing_level_height', 'weather_code', 'snow_depth', 'wind_speed_850hPa', 'wind_speed_700hPa', 'wind_speed_600hPa'];
/** Hourly forecast for every waypoint of a route, each at its own elevation. */
export function forecast(route) {
  const w = route.waypoints, W = CONFIG.weather;
  const key = 'fc.' + w.map(p => p.at.map(n => n.toFixed(3)).join(',') + ',' + p.ele).join('|');
  return cached(key, W.ttlMinutes, async () => {
    const q = new URLSearchParams({
      latitude: w.map(p => p.at[1].toFixed(4)).join(','), longitude: w.map(p => p.at[0].toFixed(4)).join(','),
      elevation: w.map(p => Math.round(p.ele * 0.3048)).join(','), hourly: HOURLY.join(','),
      temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', timezone: W.timezone, forecast_days: W.days
    });
    let j = await getJSON(W.url + '?' + q);
    if (!Array.isArray(j)) j = [j];
    if (j[0]?.error) throw new Error(j[0].reason || 'forecast error');
    const du = (j[0].hourly_units || {}).snow_depth, depthIn = du === 'ft' ? 12 : du === 'm' ? 39.37 : du === 'cm' ? 0.3937 : 1;
    return {
      fetched: Date.now(),
      pts: j.map((o, i) => { const h = o.hourly; return {
        eleM: w[i].ele * 0.3048, time: h.time, t: h.temperature_2m, w10: h.wind_speed_10m, gust: h.wind_gusts_10m, pr: h.precipitation, sn: h.snowfall,
        cc: h.cloud_cover, fl: h.freezing_level_height.map(v => v == null ? null : v * 3.28084), code: h.weather_code,
        depth: (h.snow_depth || []).map(v => v == null ? null : v * depthIn), w850: h.wind_speed_850hPa, w700: h.wind_speed_700hPa, w600: h.wind_speed_600hPa
      }; })
    };
  });
}
// Free-air wind at a waypoint's height, interpolated between pressure levels (850 hPa ≈ 4,800 ft, 700 ≈ 9,900 ft, 600 ≈ 13,800 ft).
function ridgeWind(p, i) {
  const L = [[1457, p.w850?.[i]], [3012, p.w700?.[i]], [4206, p.w600?.[i]]].filter(x => x[1] != null), z = p.eleM, s = p.w10[i] ?? 0;
  if (!L.length) return s;
  if (z <= L[0][0]) { const f = Math.max(0, z / L[0][0]); return Math.max(s, s + (L[0][1] - s) * f * 0.7); }
  for (let k = 1; k < L.length; k++) if (z <= L[k][0]) { const f = (z - L[k - 1][0]) / (L[k][0] - L[k - 1][0]); return L[k - 1][1] + (L[k][1] - L[k - 1][1]) * f; }
  return L[L.length - 1][1];
}
const hourOf = t => +t.slice(11, 13);
const agg = (p, idx, arr, lo, hi, fn) => { const v = idx.filter(i => hourOf(p.time[i]) >= lo && hourOf(p.time[i]) <= hi).map(i => arr(i)).filter(x => x != null); return v.length ? fn(v) : null; };
const max = v => Math.max(...v), min = v => Math.min(...v), mean = v => v.reduce((a, b) => a + b, 0) / v.length, sum = v => v.reduce((a, b) => a + b, 0);
/** Planning numbers for one waypoint on one calendar day (YYYY-MM-DD, Pacific). Null when the day is outside the forecast. */
export function daySummary(fc, pi, date) {
  const p = fc?.pts?.[pi]; if (!p) return null;
  const idx = []; p.time.forEach((t, i) => { if (t.startsWith(date)) idx.push(i); });
  if (idx.length < 12) return null;
  const first = idx[0], six = idx.find(i => hourOf(p.time[i]) === 6) ?? first;
  let snow48 = 0; for (let i = Math.max(0, six - 48); i < six; i++) snow48 += p.sn[i] || 0;
  const pr = sum(idx.map(i => p.pr[i] || 0)), cc = agg(p, idx, i => p.cc[i], 4, 14, mean) ?? 0;
  return {
    hi: agg(p, idx, i => p.t[i], 9, 17, max), lo: agg(p, idx, i => p.t[i], 0, 8, min),
    wind: agg(p, idx, i => ridgeWind(p, i), 2, 14, max) ?? 0, gust: agg(p, idx, i => p.gust[i], 2, 14, max) ?? 0,
    pr, sn: sum(idx.map(i => p.sn[i] || 0)), cc, fl: agg(p, idx, i => p.fl[i], 6, 15, mean), snow48,
    code: agg(p, idx, i => p.code[i], 4, 16, max) ?? 0, depth: p.depth[six] ?? null,
    sky: pr >= 0.1 || cc >= 85 ? 2 : cc >= 40 ? 1 : 0
  };
}
export const forecastDates = fc => [...new Set((fc?.pts?.[0]?.time || []).map(t => t.slice(0, 10)))];
/** Conditions at a waypoint for the current hour. */
export function nowAt(fc, pi) {
  const p = fc?.pts?.[pi]; if (!p) return null;
  const pac = new Date(new Date().toLocaleString('en-US', { timeZone: CONFIG.weather.timezone }));
  const key = pac.getFullYear() + '-' + String(pac.getMonth() + 1).padStart(2, '0') + '-' + String(pac.getDate()).padStart(2, '0') + 'T' + String(pac.getHours()).padStart(2, '0');
  const i = p.time.findIndex(t => t.startsWith(key)); if (i < 0) return null;
  return { t: p.t[i], wind: ridgeWind(p, i), code: p.code[i] };
}
const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail' };
export const wmo = c => WMO[c] || '—';

/* ---------- National Weather Service ---------- */
const ll4 = at => at[1].toFixed(4) + ',' + at[0].toFixed(4);
export function nwsForecast(at) {
  return cached('nws.' + ll4(at), 60, async () => {
    const h = { headers: { Accept: 'application/geo+json' } };
    const pt = await getJSON(`${CONFIG.nws}/points/${ll4(at)}`, h);
    const f = await getJSON(pt.properties.forecast, h);
    return { updated: f.properties.updateTime || f.properties.updated, periods: f.properties.periods.slice(0, 6).map(p => ({ name: p.name, text: p.detailedForecast, short: p.shortForecast })) };
  });
}
export function nwsAlerts(at) {
  return cached('alerts.' + ll4(at), 15, async () => {
    const j = await getJSON(`${CONFIG.nws}/alerts/active?point=${ll4(at)}`, { headers: { Accept: 'application/geo+json' } });
    return (j.features || []).map(f => ({ event: f.properties.event, headline: f.properties.headline, severity: f.properties.severity, ends: f.properties.ends || f.properties.expires, text: f.properties.description, url: f.properties['@id'] }));
  });
}

/* ---------- Avalanche center ---------- */
function inRing(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function polys(g) { return !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; }
/** Avalanche danger for the forecast zone containing (or nearest to) a point. */
export async function avalanche(at) {
  const A = CONFIG.avalanche;
  const layer = await cached('avy.' + A.center, 60, () => getJSON(A.url + A.center));
  let best = null, bd = Infinity, inside = false;
  for (const f of layer.features || []) {
    const P = polys(f.geometry);
    if (P.some(p => inRing(at, p[0]))) { best = f; inside = true; break; }
    for (const p of P) for (const v of p[0]) { const d = (v[0] - at[0]) ** 2 + (v[1] - at[1]) ** 2; if (d < bd) { bd = d; best = f; } }
  }
  if (!best) throw new Error('no forecast zones returned');
  const p = best.properties, lvl = +p.danger_level;
  return { zone: p.name, inside, level: lvl, label: lvl > 0 ? ['', 'Low', 'Moderate', 'Considerable', 'High', 'Extreme'][lvl] : 'No rating', advice: p.travel_advice || '', link: p.link || A.site, offSeason: !!p.off_season, color: lvl > 0 ? p.color : null, ends: p.end_date };
}

/* ---------- National Park Service alerts (optional key) ---------- */
export function npsAlerts(parkCode) {
  if (!CONFIG.npsApiKey || !parkCode) return Promise.resolve(null);
  return cached('nps.' + parkCode, 60, async () => {
    const j = await getJSON(`https://developer.nps.gov/api/v1/alerts?parkCode=${parkCode}&limit=20&api_key=${CONFIG.npsApiKey}`);
    return (j.data || []).map(a => ({ title: a.title, text: a.description, category: a.category, url: a.url, date: (a.lastIndexedDate || '').slice(0, 10) }));
  });
}
/** One-word sky for tight spaces. */
export const wmoShort = c => c === 0 || c === 1 ? 'Clear' : c === 2 ? 'Some cloud' : c === 3 ? 'Cloudy' : c < 50 ? 'Fog' : c < 70 || (c >= 80 && c < 85) ? 'Rain' : c < 80 || c < 90 ? 'Snow' : 'Storm';
