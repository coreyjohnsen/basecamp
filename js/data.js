// Loading, validating and measuring peak data. See README.md for the file format.
import { CONFIG } from './config.js';

export const WAYPOINT_TYPES = ['trailhead', 'camp', 'waypoint', 'summit'];
export const TERRAINS = ['trail', 'snow', 'glacier', 'scramble', 'rock', 'ice'];
export const HAZARDS = ['crev', 'rock', 'ice', 'avy', 'fall', 'nav', 'alt'];
export const POI_TYPES = ['hazard', 'crux', 'water', 'viewpoint', 'toilet', 'ranger'];

const DRAFT = 'wmh2.draft.';
const getJSON = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' → ' + r.status); return r.json(); };

export function draftIds() {
  const ids = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(DRAFT)) ids.push(k.slice(DRAFT.length)); } } catch (e) { /* ignore */ }
  return ids;
}
export function saveDraft(peak) { try { localStorage.setItem(DRAFT + peak.id, JSON.stringify(peak)); } catch (e) { /* ignore */ } }
export function discardDraft(id) { try { localStorage.removeItem(DRAFT + id); } catch (e) { /* ignore */ } }
function readDraft(id) { try { return JSON.parse(localStorage.getItem(DRAFT + id)); } catch (e) { return null; } }

export async function loadIndex() {
  const index = await getJSON(CONFIG.dataRoot + 'index.json');
  // Peaks that exist only as a local draft (made in the editor, not yet committed) join the list.
  for (const id of draftIds()) {
    if (!index.peaks.some(p => p.id === id)) {
      const d = readDraft(id);
      if (d) index.peaks.push({ id, short: d.short || d.name, name: d.name, elev: d.elev, summit: d.summit, draftOnly: true });
    }
  }
  return index;
}

export async function loadPeak(id) {
  const draft = readDraft(id);
  if (draft) { draft._draft = true; return draft; }
  const peak = await getJSON(CONFIG.dataRoot + 'peaks/' + id + '.json');
  const problems = validate(peak);
  if (problems.length) console.warn(`[data] ${id}.json:`, problems);
  return peak;
}

export const loadUpdates = () => getJSON(CONFIG.dataRoot + 'updates.json');

const isLL = p => Array.isArray(p) && p.length >= 2 && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
/** Returns a list of human-readable problems. Empty means the peak is safe to load. */
export function validate(peak) {
  const out = [];
  if (!peak.id || !/^[a-z0-9-]+$/.test(peak.id)) out.push('Peak id must be lowercase letters, digits or dashes.');
  if (!peak.name) out.push('Peak has no name.');
  if (!(peak.elev > 0)) out.push('Peak elevation (feet) is missing.');
  if (!isLL(peak.summit)) out.push('Peak summit must be [longitude, latitude].');
  if (!Array.isArray(peak.routes) || !peak.routes.length) out.push('Peak has no routes.');
  for (const r of peak.routes || []) {
    const w = r.waypoints || [], s = r.sections || [], tag = `Route "${r.name || r.id}": `;
    if (!r.id) out.push(tag + 'missing id.');
    if (w.length < 2) { out.push(tag + 'needs at least a trailhead and a summit.'); continue; }
    if (s.length !== w.length - 1) out.push(tag + `has ${w.length} waypoints, so it needs ${w.length - 1} sections (found ${s.length}).`);
    if (w[w.length - 1].type !== 'summit') out.push(tag + 'last waypoint should have type "summit".');
    w.forEach((p, i) => {
      if (!p.name) out.push(tag + `waypoint ${i + 1} has no name.`);
      if (!WAYPOINT_TYPES.includes(p.type)) out.push(tag + `waypoint "${p.name}" has unknown type "${p.type}".`);
      if (!(p.ele >= 0)) out.push(tag + `waypoint "${p.name}" has no elevation.`);
      if (!isLL(p.at)) out.push(tag + `waypoint "${p.name}" has no [longitude, latitude].`);
    });
    s.forEach((x, i) => {
      if (!TERRAINS.includes(x.terrain)) out.push(tag + `section ${i + 1} has unknown terrain "${x.terrain}".`);
      if (!(x.miles > 0)) out.push(tag + `section ${i + 1} has no mileage.`);
      for (const k in x.hazards || {}) if (!HAZARDS.includes(k)) out.push(tag + `section ${i + 1} has unknown hazard "${k}".`);
    });
    if (!Array.isArray(r.season) || !Array.isArray(r.prime)) out.push(tag + 'needs "season" and "prime" month ranges.');
  }
  return out;
}

/* ---------- geometry ---------- */
const RAD = Math.PI / 180;
/** Great-circle distance in miles between two [lon, lat] points. */
export function miles(a, b) {
  const dl = (b[1] - a[1]) * RAD, dn = (b[0] - a[0]) * RAD;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dn / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(x));
}
export const lineMiles = pts => pts.reduce((d, p, i) => i ? d + miles(pts[i - 1], p) : 0, 0);
/** Compass bearing in degrees from a to b. */
export function bearing(a, b) {
  const y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
  const x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
/** Every point of section i: start waypoint, shaping points, end waypoint. */
export const sectionCoords = (route, i) => [route.waypoints[i].at, ...(route.sections[i].via || []), route.waypoints[i + 1].at];
export const routeCoords = route => route.sections.flatMap((s, i) => sectionCoords(route, i).slice(i ? 1 : 0));
export function bounds(pts) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of pts) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
  return [[w, s], [e, n]];
}

/* ---------- elevation lookups from the same tiles the 3D terrain uses ---------- */
const tiles = new Map();
function demTile(z, x, y) {
  const k = z + '/' + x + '/' + y;
  if (!tiles.has(k)) tiles.set(k, new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); res(g.getImageData(0, 0, 256, 256).data); };
    img.onerror = () => { tiles.delete(k); rej(new Error('Elevation tile failed to load')); };
    img.src = CONFIG.map.dem.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }));
  return tiles.get(k);
}
/** Ground elevation in feet at a [lon, lat], read from the terrain tiles. */
export async function demFeet(at) {
  const z = 13, n = 2 ** z, la = at[1] * RAD;
  const x = (at[0] + 180) / 360 * n, y = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
  const xi = Math.floor(x), yi = Math.floor(y), d = await demTile(z, xi, yi);
  const px = Math.min(255, Math.floor((x - xi) * 256)), py = Math.min(255, Math.floor((y - yi) * 256)), o = (py * 256 + px) * 4;
  return (d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768) * 3.28084;
}

/* ---------- GPX ---------- */
/** Parses GPX text into [[lon, lat, feet?], …], thinned to roughly `tol` metres. */
export function parseGPX(text, tol = 8) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  let pts = [...doc.querySelectorAll('trkpt, rtept')].map(n => {
    const e = n.querySelector('ele'), p = [+(+n.getAttribute('lon')).toFixed(6), +(+n.getAttribute('lat')).toFixed(6)];
    if (e && isFinite(+e.textContent)) p.push(Math.round(+e.textContent * 3.28084));
    return p;
  }).filter(isLL);
  if (pts.length < 2) throw new Error('No track points found in that file.');
  return simplify(pts, tol);
}
function simplify(pts, tolM) {
  // Douglas–Peucker on a local flat projection.
  const la0 = pts[0][1] * RAD, X = p => p[0] * RAD * Math.cos(la0) * 6371000, Y = p => p[1] * RAD * 6371000;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1;
    const ax = X(pts[a]), ay = Y(pts[a]), bx = X(pts[b]), by = Y(pts[b]), L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - Y(pts[i])) - (ax - X(pts[i])) * (by - ay)) / L; if (d > max) { max = d; idx = i; } }
    if (max > tolM) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
/** Lays a GPS track onto a route: waypoints snap to the track in order, sections take the track between them. */
export function applyTrack(route, track, sourceName) {
  // An out-and-back recording ends where it began: keep only the way up (to the highest or farthest point).
  if (track.length > 4 && miles(track[0], track[track.length - 1]) < 0.3) {
    const hasEle = track.every(p => p.length > 2);
    let top = 0, best = -Infinity;
    track.forEach((p, i) => { const v = hasEle ? p[2] : miles(track[0], p); if (v > best) { best = v; top = i; } });
    if (top > 1) track = track.slice(0, top + 1);
  }
  if (!route.waypoints || route.waypoints.length < 2) {
    const a = track[0], b = track[track.length - 1];
    route.waypoints = [{ name: 'Trailhead', type: 'trailhead', ele: a[2] || 0, at: a.slice(0, 2) }, { name: 'Summit', type: 'summit', ele: b[2] || 0, at: b.slice(0, 2) }];
    route.sections = [{ miles: 0, terrain: 'trail', hazards: {}, note: '' }];
  }
  const w = route.waypoints, idx = [];
  let from = 0;
  w.forEach((p, i) => {
    let best = from, bd = Infinity;
    if (i === 0) best = 0; else if (i === w.length - 1) best = track.length - 1;
    else for (let k = from; k < track.length - 1; k++) { const d = miles(p.at, track[k]); if (d < bd) { bd = d; best = k; } }
    idx.push(best); from = best;
  });
  w.forEach((p, i) => { p.at = track[idx[i]].slice(0, 2); });
  route.sections.forEach((s, i) => {
    s.via = track.slice(idx[i] + 1, idx[i + 1]);
    const len = lineMiles(track.slice(idx[i], idx[i + 1] + 1));
    if (len > 0.05) s.miles = +len.toFixed(1);
  });
  route.line = { quality: 'gps', asOf: new Date().toISOString().slice(0, 7), source: sourceName };
  return route;
}
