// The 3D view: MapLibre terrain with satellite or topo imagery, draped routes and HTML markers.
import { CONFIG } from './config.js';
import { st, cur, live, ui, save, emit, $, fmt, esc } from './store.js';
import { sectionCoords, routeCoords, bounds, bearing, miles } from './data.js';
import { plan, hzMax } from './calc.js';
import { nowAt, wmo } from './live.js';

export const ROUTE_COLORS = ['#ff6a4d', '#4fc3f7', '#ffd24a', '#c792ea', '#7bd88f'];
const HAZ_COLORS = ['#4fd08c', '#ffd43b', '#ff922b', '#ff3b30'];
const POI_GLYPH = { hazard: '!', crux: '×', water: 'W', viewpoint: 'V', toilet: 'T', ranger: 'R' };
let map, markers = [], peakMarkers = [], popup, fly = null, spin = false, framing = false, clickOnce = null, ready = false, hoverRid = '';

export const getMap = () => map;
export function initMap() {
  const M = CONFIG.map, ix = cur.index;
  if (!window.maplibregl) { mapMsg('The map library did not load, so the 3D view is off. Route details, planning and gear all still work in the panel.'); return Promise.resolve(false); }
  const sources = { dem: { type: 'raster-dem', tiles: M.dem.tiles, encoding: M.dem.encoding, tileSize: 256, maxzoom: M.dem.maxzoom, attribution: M.dem.attribution } };
  const layers = [];
  for (const id in M.layers) {
    sources[id] = { type: 'raster', tiles: M.layers[id].tiles, tileSize: 256, maxzoom: M.layers[id].maxzoom, attribution: M.layers[id].attribution };
    layers.push({ id: 'base-' + id, type: 'raster', source: id, layout: { visibility: id === st.layer ? 'visible' : 'none' } });
  }
  try {
    map = new maplibregl.Map({
      container: 'map', center: ix.center || [-121.3, 47.4], zoom: ix.zoom || 6.6, pitch: 0, maxPitch: 80, attributionControl: { compact: true },
      style: { version: 8, sources, layers, terrain: { source: 'dem', exaggeration: M.exaggeration },
        sky: { 'sky-color': '#7fb4e0', 'horizon-color': '#dfe9f1', 'fog-color': '#dfe9f1', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.2 } }
    });
  } catch (e) { mapMsg('WebGL is unavailable in this browser, so the 3D view is off. Everything in the panel still works.'); return Promise.resolve(false); }
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right');
  popup = new maplibregl.Popup({ offset: 14, closeButton: false, maxWidth: '280px' });

  // Any direct interaction stops the idle spin.
  const stopSpin = () => { framing = false; if (spin) setSpin(false); };
  ['mousedown', 'touchstart', 'wheel'].forEach(e => map.on(e, stopSpin));
  map.on('moveend', e => { if (e.framing) framing = false; });
  map.on('click', e => {
    if (clickOnce) { const fn = clickOnce; clickOnce = null; map.getCanvas().style.cursor = ''; fn([+e.lngLat.lng.toFixed(5), +e.lngLat.lat.toFixed(5)]); return; }
    const f = hit(e.point); if (!f) return;
    if (ui.peakView || f.properties.rid !== cur.route.id) emit('go', { route: f.properties.rid }); else emit('pick-section', f.properties.si);
  });
  let lastHover = 0;
  map.on('mousemove', e => {
    if (clickOnce || performance.now() - lastHover < 50) return; lastHover = performance.now();
    const f = hit(e.point); map.getCanvas().style.cursor = f ? 'pointer' : '';
    if (ui.peakView) { const rid = f ? f.properties.rid : ''; if (rid !== hoverRid) { hoverRid = rid; map.setFilter('r-hot', ['==', ['get', 'rid'], rid]); } return; }
    const si = f && f.properties.rid === cur.route.id ? f.properties.si : -1;
    if (si !== ui.hot) emit('hot', si);
  });
  map.on('error', e => { if (!ready) console.warn('[map]', e.error?.message || e); });

  let last = performance.now();
  (function tick(now) {
    requestAnimationFrame(tick); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden || !ready) return;
    if (fly) flyStep(now); else if (spin && !framing && !map.isMoving()) map.setBearing(map.getBearing() + dt * 2.2);
  })(last);

  return new Promise(res => map.once('load', () => {
    map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const sel = ['get', 'sel'], w = (a, b) => ['case', sel, a, b];
    map.addLayer({ id: 'r-case', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#08111b', 'line-width': w(8, 4.5), 'line-opacity': w(0.55, 0.3) } });
    map.addLayer({ id: 'r-hot', type: 'line', source: 'routes', filter: ['==', ['get', 'k'], ''], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': 0.75 } });
    map.addLayer({ id: 'r-line', type: 'line', source: 'routes', filter: ['!', ['get', 'approx']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': w(4.5, 2.2), 'line-opacity': w(1, 0.75) } });
    // Lines that were hand-placed rather than recorded are drawn dashed.
    map.addLayer({ id: 'r-line-approx', type: 'line', source: 'routes', filter: ['get', 'approx'], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': w(4.5, 2.2), 'line-opacity': w(1, 0.75), 'line-dasharray': [2.2, 1.2] } });
    ready = true; drawPeakMarkers(); document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'); res(true);
  }));
}
function mapMsg(t) { const m = $('#mapMsg'); m.textContent = t; m.hidden = false; }
function hit(pt) { if (!ready) return null; const b = [[pt.x - 6, pt.y - 6], [pt.x + 6, pt.y + 6]]; const f = map.queryRenderedFeatures(b, { layers: ['r-case'] }); return f.find(x => x.properties.sel) || f[0] || null; }

function mk(cls, glyph, label) {
  const el = document.createElement('div'); el.className = 'mk ' + cls;
  el.innerHTML = `<i>${glyph || ''}</i>` + (label ? `<span class="lab ${cls.includes('camp') ? 'lc' : ''} ${cls.includes('sleep') ? 'sleep' : ''} ${cls.includes('summit') ? 'summit' : ''}">${label}</span>` : '');
  return el;
}
function addMarker(el, at, opts = {}) { const m = new maplibregl.Marker({ element: el, anchor: 'center', ...opts }).setLngLat(at).addTo(map); markers.push(m); return m; }
function showPopup(at, html) { popup.setLngLat(at).setHTML(html).addTo(map); }

/** A marker on every summit in the region, so the overview is navigable. */
export function drawPeakMarkers() {
  if (!ready) return;
  peakMarkers.forEach(m => m.remove()); peakMarkers = [];
  for (const p of cur.index.peaks) {
    if (!p.summit || (cur.peak && p.id === cur.peak.id)) continue;
    const el = mk('peak', '', `<b>${esc(p.short || p.name)}</b>${fmt(p.elev)}`);
    el.addEventListener('click', e => { e.stopPropagation(); emit('go', { peak: p.id }); });
    peakMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(p.summit).addTo(map));
  }
}

/** Redraws route lines and markers for the current peak. Call after any change to route, camps, hazards or data. */
export function drawRoutes() {
  if (!ready || !cur.peak) return;
  const M = cur.peak, feats = [];
  M.routes.forEach((R, ri) => {
    // In the peak view every route is drawn at full strength.
    const sel = ui.peakView || R === cur.route, color = ROUTE_COLORS[ri % ROUTE_COLORS.length], approx = (R.line?.quality || 'approximate') === 'approximate';
    R.sections.forEach((s, i) => feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: sectionCoords(R, i).map(p => [p[0], p[1]]) },
      properties: { rid: R.id, si: i, k: R.id + ':' + i, sel, approx, color: sel && ui.hazView && !ui.peakView ? HAZ_COLORS[hzMax(R, i)] : color } }));
  });
  map.getSource('routes').setData({ type: 'FeatureCollection', features: feats });
  markers.forEach(m => m.remove()); markers = []; popup.remove(); hoverRid = '';
  if (ui.peakView) { drawPeakView(); return; }
  const R = cur.route, pl = plan(R);
  R.waypoints.forEach((p, i) => {
    const sleep = pl.camps.includes(i), cls = (p.type === 'camp' ? 'mcamp ' : p.type === 'summit' ? 'summit ' : '') + (sleep ? 'sleep ' : '') + (ui.editing ? 'drag' : '');
    const el = mk(cls, '', `<b>${esc(p.name)}</b>${fmt(p.ele)}`);
    const m = addMarker(el, p.at, { draggable: ui.editing });
    if (ui.editing) m.on('dragend', () => { const l = m.getLngLat(); emit('wp-moved', { i, at: [+l.lng.toFixed(5), +l.lat.toFixed(5)] }); });
    el.addEventListener('click', e => {
      e.stopPropagation(); if (ui.editing) return;
      const n = nowAt(live.fc, i);
      showPopup(p.at, `<b>${esc(p.name)}</b><span class="mono">${fmt(p.ele)} ft · ${p.type}${sleep ? ' · sleeping here' : ''}</span>${p.note ? esc(p.note) : ''}${n ? `<span class="mono" style="margin-top:6px">Now: ${Math.round(n.t)}°F, ${wmo(n.code).toLowerCase()}, wind ${Math.round(n.wind)} mph</span>` : ''}`);
    });
  });
  for (const q of M.pois || []) {
    if (q.routes && q.routes.length && !q.routes.includes(R.id)) continue;
    const el = mk('poi ' + q.type, POI_GLYPH[q.type] || '•'); el.title = q.name;
    addMarker(el, q.at);
    el.addEventListener('click', e => { e.stopPropagation(); showPopup(q.at, `<b>${esc(q.name)}</b><span class="mono">${q.ele ? fmt(q.ele) + ' ft · ' : ''}${q.type}</span>${esc(q.note || '')}`); });
  }
  setHot(ui.hot);
}
/** Peak view markers: the summit, plus a name tag partway along each route that picks it. */
function drawPeakView() {
  const M = cur.peak;
  addMarker(mk('summit', '', `<b>${esc(M.name)}</b>${fmt(M.elev)}`), M.summit);
  M.routes.forEach((R, ri) => {
    const pts = routeCoords(R), at = pts[Math.floor(pts.length * (0.35 + 0.3 * ri / Math.max(1, M.routes.length - 1)))] || pts[0];
    const el = document.createElement('button'); el.className = 'rtag'; el.type = 'button';
    el.innerHTML = `<i style="background:${ROUTE_COLORS[ri % ROUTE_COLORS.length]}"></i><b>${esc(R.name)}</b><span>${esc(R.grade)}</span>`;
    el.onclick = e => { e.stopPropagation(); emit('go', { route: R.id }); };
    el.onmouseenter = () => map.setFilter('r-hot', ['==', ['get', 'rid'], R.id]);
    el.onmouseleave = () => map.setFilter('r-hot', ['==', ['get', 'rid'], '']);
    addMarker(el, [at[0], at[1]]);
  });
  setHot(-1);
}
export function setHot(i) { if (ready && map.getLayer('r-hot')) map.setFilter('r-hot', ['==', ['get', 'k'], i >= 0 && cur.route ? cur.route.id + ':' + i : '']); }

/** Flies the camera to frame the selected route, looking from the trailhead toward the summit. */
export function frame(fast) {
  if (!ready || !cur.route) return; stopFly();
  const R = cur.route, pts = routeCoords(R), th = R.waypoints[0].at, top = R.waypoints[R.waypoints.length - 1].at;
  framing = true;
  const stage = $('#stage'), tall = stage.clientHeight > stage.clientWidth;
  // Fit the route as if looking straight down, then pull back to leave room for the tilt and the relief.
  const b = bearing(th, top) - 25, cam = map.cameraForBounds(bounds(pts), { bearing: b, padding: { top: tall ? 110 : 130, bottom: 90, left: 50, right: tall ? 50 : 90 } });
  if (!cam) { framing = false; return; }
  map.flyTo({ center: cam.center, zoom: Math.min(cam.zoom - 0.85, 14), bearing: b, pitch: 58, duration: fast ? 0 : 2400 }, { framing: true });
}
/** Looks straight down on the whole mountain so every route can be compared. */
export function framePeak(fast) {
  if (!ready || !cur.peak) return; stopFly(); setSpin(false);
  const M = cur.peak, pts = [M.summit, ...M.routes.flatMap(routeCoords)], stage = $('#stage');
  const cam = map.cameraForBounds(bounds(pts), { bearing: 0, padding: stage.clientWidth < 700 ? { top: 120, bottom: 150, left: 40, right: 70 } : { top: 200, bottom: 110, left: 70, right: 150 } });
  if (!cam) return;
  framing = true;
  map.flyTo({ center: cam.center, zoom: Math.min(cam.zoom, 14), bearing: 0, pitch: 0, duration: fast ? 0 : 2200 }, { framing: true });
}
export function overview() {
  if (!ready) return; stopFly(); setSpin(false);
  const pts = cur.index.peaks.filter(p => p.summit).map(p => p.summit);
  map.fitBounds(bounds(pts), { padding: 70, pitch: 0, bearing: 0, duration: 1800 });
}

export function setSpin(on) { spin = on; $('#bSpin').setAttribute('aria-pressed', on); }
export const toggleSpin = () => setSpin(!spin);
export function setLayer(id) {
  st.layer = id; save(); if (!ready) return;
  for (const k in CONFIG.map.layers) map.setLayoutProperty('base-' + k, 'visibility', k === id ? 'visible' : 'none');
}
/** Next map click calls fn([lon, lat]) instead of selecting. Used by the editor. */
export function onNextClick(fn) { clickOnce = fn; if (ready) map.getCanvas().style.cursor = 'crosshair'; }
export const cancelClick = () => { clickOnce = null; if (ready) map.getCanvas().style.cursor = ''; };

/* ---------- fly the route ---------- */
export function toggleFly() {
  if (!ready) return; if (fly) { stopFly(); return; }
  const R = cur.route, secs = R.sections.map((s, i) => sectionCoords(R, i)), pts = [], cum = [0], secEnd = [];
  secs.forEach((c, si) => { c.forEach((p, j) => { if (si && !j) return; if (pts.length) cum.push(cum[cum.length - 1] + miles(pts[pts.length - 1], p)); pts.push(p); }); secEnd.push(cum[cum.length - 1]); });
  const el = document.createElement('div'); el.className = 'mk summit'; el.innerHTML = '<i style="width:16px;height:16px;left:-8px;top:-8px;background:#fff;border-color:#ff6a4d;border-width:4px"></i>';
  fly = { pts, cum, secEnd, len: cum[cum.length - 1], t0: performance.now(), dur: Math.max(14000, R.sections.length * 4500), b0: bearing(R.waypoints[0].at, R.waypoints[R.waypoints.length - 1].at) - 40,
    dot: new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(pts[0]).addTo(map) };
  setSpin(false); $('#bFly').textContent = 'Stop'; $('#flyOut').hidden = false;
}
function flyStep(now) {
  const t = (now - fly.t0) / fly.dur; if (t >= 1) { stopFly(); frame(); return; }
  const d = t * fly.len; let i = 1; while (i < fly.cum.length - 1 && fly.cum[i] < d) i++;
  const f = (d - fly.cum[i - 1]) / ((fly.cum[i] - fly.cum[i - 1]) || 1), a = fly.pts[i - 1], b = fly.pts[i], p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  fly.dot.setLngLat(p);
  map.jumpTo({ center: p, bearing: fly.b0 + t * 110, pitch: 66, zoom: 14.2 });
  const R = cur.route; let si = fly.secEnd.findIndex(e => d <= e); if (si < 0) si = R.sections.length - 1;
  const s0 = si ? fly.secEnd[si - 1] : 0, sf = (d - s0) / ((fly.secEnd[si] - s0) || 1), w0 = R.waypoints[si], w1 = R.waypoints[si + 1];
  $('#flyOut').textContent = `${fmt(w0.ele + (w1.ele - w0.ele) * sf)} ft · ${w0.name} → ${w1.name}`;
}
export function stopFly() { if (!fly) return; fly.dot.remove(); fly = null; $('#flyOut').hidden = true; $('#bFly').textContent = 'Fly route'; }
