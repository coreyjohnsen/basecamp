// Boot and wiring: loads data, owns selection, and connects the map, the panel and the live sources.
import { CONFIG } from './config.js';
import { st, cur, live, ui, save, on, emit, $, $$, fmt, esc } from './store.js';
import { loadIndex, loadPeak, loadUpdates } from './data.js';
import { forecast, nwsForecast, nwsAlerts, avalanche, npsAlerts, clearCache } from './live.js';
import { initMap, drawRoutes, drawPeakMarkers, frame, overview, setHot, toggleFly, stopFly, toggleSpin, setSpin, setLayer, ROUTE_COLORS } from './map.js';
import { renderTabs, renderPane, setTab, liveChanged, markHot, scrollToSection } from './panel.js';
import { waypointMoved, stopEditing } from './editor.js';

function renderChrome() {
  const M = cur.peak;
  $('#peaks').innerHTML = cur.index.peaks.map(m => `<button data-m="${esc(m.id)}" aria-pressed="${m.id === M.id}"><b>${esc(m.short || m.name)}</b><span>${fmt(m.elev)} ft${m.draftOnly ? ' · draft' : ''}</span></button>`).join('');
  $$('#peaks button').forEach(b => b.onclick = () => go({ peak: b.dataset.m }));
  $('#pkName').textContent = M.name; $('#pkElev').innerHTML = `${fmt(M.elev)} ft <em>· ${esc(M.range || '')}</em>`; $('#pkBlurb').textContent = M.blurb || '';
  $('#routes').innerHTML = M.routes.map((r, i) => `<button class="rchip" data-r="${esc(r.id)}" aria-pressed="${r === cur.route}"><i style="background:${ROUTE_COLORS[i % ROUTE_COLORS.length]}"></i><span><b>${esc(r.name)}</b><span>${esc(r.grade)}</span></span></button>`).join('');
  $$('#routes button').forEach(b => b.onclick = () => go({ route: b.dataset.r }));
  document.title = `${M.name} · ${cur.route.name} · Mountaineering Hub`;
}

let liveToken = 0;
function loadLive(peakChanged) {
  const R = cur.route, M = cur.peak, token = ++liveToken, mine = () => token === liveToken;
  live.fc = null; live.fcState = 'loading'; live.fcErr = '';
  forecast(R).then(f => { if (!mine()) return; live.fc = f; live.fcState = 'ok'; }, e => { if (!mine()) return; live.fcState = 'error'; live.fcErr = e.message; })
    .then(() => { if (mine()) { liveChanged(); drawRoutes(); } });
  if (!peakChanged) return;
  live.nws = live.alerts = live.avy = live.nps = null;
  const put = (key, promise) => promise.then(v => v, e => ({ error: e.message })).then(v => { if (cur.peak !== M) return; live[key] = v; liveChanged(); });
  put('nws', nwsForecast(M.summit)); put('alerts', nwsAlerts(M.summit)); put('avy', avalanche(M.summit));
  if (CONFIG.npsApiKey && M.npsParkCode) put('nps', npsAlerts(M.npsParkCode));
}

async function go({ peak, route, reload, first } = {}) {
  const pid = peak || cur.peak?.id || st.peak; let peakChanged = false;
  if (!cur.peak || cur.peak.id !== pid || reload) {
    try { cur.peak = await loadPeak(pid); }
    catch (e) { if (cur.peak) { console.error(e); return; } cur.peak = await loadPeak(cur.index.peaks[0].id); }
    peakChanged = true;
  }
  const M = cur.peak;
  cur.route = M.routes.find(r => r.id === (route || (peakChanged ? st.route : cur.route?.id))) || M.routes[0];
  st.peak = M.id; st.route = cur.route.id; save(); ui.hot = -1; stopFly(); if (ui.editing) stopEditing();
  try { history.replaceState(null, '', '#' + M.id + '/' + cur.route.id); } catch (e) { /* ignore */ }
  renderChrome(); renderPane(); if (peakChanged) drawPeakMarkers(); drawRoutes(); frame(first);
  loadLive(peakChanged);
}

on('go', go);
on('redraw', drawRoutes);
on('frame', () => frame());
on('hot', i => { ui.hot = i; setHot(i); markHot(); });
on('pick-section', i => { if (st.tab !== 'route') setTab('route'); emit('hot', i); scrollToSection(i); });
on('refresh-live', () => { clearCache(); loadLive(true); renderPane(true); });
on('wp-moved', waypointMoved);
on('data-changed', () => {
  const M = cur.peak, e = cur.index.peaks.find(p => p.id === M.id);
  if (e) Object.assign(e, { name: M.name, short: M.short, elev: M.elev, summit: M.summit });
  renderChrome(); drawRoutes();
});

$('#bFly').onclick = toggleFly;
$('#bSpin').onclick = toggleSpin;
$('#bFrame').onclick = () => frame();
$('#bAll').onclick = overview;
$('#bHaz').onclick = e => { ui.hazView = !ui.hazView; e.currentTarget.setAttribute('aria-pressed', ui.hazView); drawRoutes(); };
const layerIds = Object.keys(CONFIG.map.layers), nextLayer = () => layerIds[(layerIds.indexOf(st.layer) + 1) % layerIds.length];
const layerBtn = () => { $('#bLayer').textContent = CONFIG.map.layers[nextLayer()].label; };
$('#bLayer').onclick = () => { setLayer(nextLayer()); layerBtn(); };
$('#bEdit').onclick = e => {
  ui.editing = !ui.editing; e.currentTarget.setAttribute('aria-pressed', ui.editing);
  if (ui.editing) { setSpin(false); st.tab = 'edit'; } else { stopEditing(); st.tab = 'route'; }
  renderTabs(); renderPane(); drawRoutes();
};

(async function boot() {
  if (!CONFIG.map.layers[st.layer]) st.layer = layerIds[0];
  layerBtn();
  try { cur.index = await loadIndex(); }
  catch (e) {
    $('#pane').innerHTML = `<div><h2>Data did not load</h2><p style="margin-top:8px">${esc(e.message)}</p><p class="sub" style="margin-top:8px">If you opened this file directly from disk, serve the folder instead (for example <span class="mono">python3 -m http.server</span>) so the browser can read the data files.</p></div>`;
    return;
  }
  $('#region').textContent = cur.index.region || '';
  const [hp, hr] = location.hash.slice(1).split('/');
  if (hp && cur.index.peaks.some(p => p.id === hp)) { st.peak = hp; if (hr) st.route = hr; }
  if (!cur.index.peaks.some(p => p.id === st.peak)) st.peak = cur.index.peaks[0].id;
  renderTabs();
  const mapReady = initMap();
  await go({ peak: st.peak, route: st.route, first: true });
  loadUpdates().then(v => v, e => ({ error: e.message })).then(v => { live.updates = v; liveChanged(); });
  if (await mapReady) {
    drawPeakMarkers(); drawRoutes(); frame();
  }
})();
