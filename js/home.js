// Landing page: skyline, peak and route cards, latest reports. Reads the same data files as the map.
import { $, $$, fmt, esc } from './store.js';
import { loadIndex, loadPeak, loadUpdates } from './data.js';
import { LEVEL } from './calc.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEVEL_SHORT = ['', 'Hiker', 'Glacier', 'Intermediate', 'Advanced'];
const link = (p, r) => `map.html#${encodeURIComponent(p.id)}${r ? '/' + encodeURIComponent(r.id) : ''}`;
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';

// Month position today, 0 = Jan 1. Season ranges may run past 12 for winter routes.
const now = (() => { const d = new Date(); return d.getMonth() + (d.getDate() - 1) / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); })();
const inRange = (m, [a, b]) => (m >= a && m <= b) || (m + 12 >= a && m + 12 <= b);
const months = ([a, b]) => { const x = MON[Math.floor(a) % 12], y = MON[Math.floor(b) % 12]; return x === y ? x : `${x}–${y}`; };
const routeStats = R => ({
  miles: R.sections.reduce((t, s) => t + (+s.miles || 0), 0),
  gain: R.waypoints.reduce((t, w, i) => i && w.ele > R.waypoints[i - 1].ele ? t + w.ele - R.waypoints[i - 1].ele : t, 0)
});

const f = { level: 0, season: false };
let peaks = [];

function skyline(list) {
  // West to east, evenly spaced; height follows elevation.
  const W = 1000, H = 230, base = 228, top = 40, byLon = [...list].sort((a, b) => a.summit[0] - b.summit[0]);
  const hi = Math.max(...list.map(p => p.elev)), lo = Math.min(...list.map(p => p.elev)) - 3000, step = W / byLon.length;
  const y = e => base - (e - lo) / (hi - lo) * (base - top);
  const shapes = byLon.map((p, i) => {
    const x = step * (i + .5), t = y(p.elev), w = step * .95 + (base - t) * .35, cap = t + (base - t) * .28;
    return `<a href="${link(p)}" aria-label="${esc(p.name)}, ${fmt(p.elev)} ft">
      <polygon class="mt" points="${x - w},${base} ${x},${t} ${x + w},${base}"/>
      <polygon class="cap" points="${x - w * .28},${cap} ${x},${t} ${x + w * .28},${cap} ${x + w * .1},${cap - 6} ${x - w * .08},${cap + 4}"/>
      <text x="${x}" y="${t - 16}">${esc(p.short || p.name)}</text><text class="e" x="${x}" y="${t - 4}">${fmt(p.elev)}</text>
    </a>`;
  }).join('');
  $('#skyline').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="Peaks west to east">${shapes}</svg>`;
}

function stats(list) {
  const routes = list.flatMap(p => p.routes);
  const open = routes.filter(r => inRange(now, r.season)).length;
  $('#hstats').innerHTML = [[list.length, 'peaks'], [routes.length, 'routes'], [fmt(Math.max(...list.map(p => p.elev))) + ' ft', 'highest summit'], [open, 'in season this month']]
    .map(([v, k]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function routeRow(p, R) {
  const s = routeStats(R), prime = inRange(now, R.prime), open = inRange(now, R.season);
  return `<a class="rt" href="${link(p, R)}">
    <span class="rn"><b>${esc(R.name)}</b>${open ? `<em class="${prime ? 'pr' : 'sh'}">${prime ? 'Prime now' : 'In season'}</em>` : ''}</span>
    <span class="rg">${esc(R.grade)}</span>
    <span class="rm"><span class="pips" title="${esc(LEVEL[R.level] || '')}">${[1, 2, 3, 4].map(i => `<i class="${i <= R.level ? 'on' : ''}"></i>`).join('')}</span>
      <span>${s.miles ? s.miles.toFixed(1) + ' mi' : ''}</span><span>+${fmt(s.gain)} ft</span>
      <span>${R.days[0] === R.days[1] ? R.days[0] : R.days.join('–')} day${R.days[1] > 1 ? 's' : ''}</span><span>Prime ${months(R.prime)}</span></span>
  </a>`;
}

function renderCards() {
  let shown = 0, total = 0;
  const html = peaks.map(p => {
    const rs = p.routes.filter(r => (!f.level || r.level === f.level) && (!f.season || inRange(now, r.season)));
    total += rs.length; if (!rs.length) return ''; shown++;
    return `<article class="card">
      <header><a href="${link(p)}"><h3>${esc(p.name)}</h3></a><span class="mono">${fmt(p.elev)} ft</span></header>
      <p class="prange">${esc(p.range || '')}${p._draft ? ' · <span class="badge">local draft</span>' : ''}</p>
      <p class="bl">${esc(p.blurb || '')}</p>
      <div class="rts">${rs.map(r => routeRow(p, r)).join('')}</div>
    </article>`;
  }).join('');
  $('#cards').innerHTML = html || `<p class="sub">No routes match. ${f.season ? 'Most routes are out of season now; try turning off “In season now”.' : ''}</p>`;
  $('#count').textContent = `${total} route${total === 1 ? '' : 's'} on ${shown} peak${shown === 1 ? '' : 's'}`;
}

function filters() {
  $('#fLevel').innerHTML = LEVEL_SHORT.map((l, i) => `<button data-l="${i}" aria-pressed="${f.level === i}" title="${i ? esc(LEVEL[i]) : 'Every level'}">${i ? i + ' · ' + l : 'All'}</button>`).join('');
  $$('#fLevel button').forEach(b => b.onclick = () => { f.level = +b.dataset.l; filters(); renderCards(); });
  $('#fSeason').onclick = e => { f.season = !f.season; e.currentTarget.setAttribute('aria-pressed', f.season); renderCards(); };
}

function reports(u, byId) {
  const items = [...(u.items || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  if (u.checked) $('#checked').textContent = `Curated route and access conditions. Feed last checked ${u.checked}.`;
  $('#reps').innerHTML = items.length ? items.map(it => {
    const p = byId[it.peak], R = p?.routes.find(r => r.id === it.route), url = safeUrl(it.url);
    return `<article class="rep">
      <span class="mono">${esc(it.date)} · ${p ? `<a href="${link(p, R)}">${esc(p.name)}${R ? ' · ' + esc(R.name) : ''}</a>` : 'All peaks'}</span>
      <b>${esc(it.title)}</b><p>${esc(it.body)}</p>
      ${url ? `<a class="srcl" href="${esc(url)}" target="_blank" rel="noopener">${esc(it.source || 'Source')} ↗</a>` : it.source ? `<span class="sub">${esc(it.source)}</span>` : ''}
    </article>`;
  }).join('') : '<p class="sub">No reports yet.</p>';
}

(async function boot() {
  filters();
  try {
    const index = await loadIndex();
    const got = await Promise.all(index.peaks.map(e => loadPeak(e.id).catch(err => { console.error(err); return null; })));
    peaks = got.filter(p => p && p.routes?.length).sort((a, b) => b.elev - a.elev);
    skyline(peaks); stats(peaks); renderCards();
    const byId = Object.fromEntries(peaks.map(p => [p.id, p]));
    loadUpdates().then(u => reports(u, byId), e => { $('#reps').innerHTML = `<p class="sub">Reports did not load (${esc(e.message)}).</p>`; });
  } catch (e) {
    $('#cards').innerHTML = `<p class="sub">Peak data did not load (${esc(e.message)}). If you opened this file from disk, serve the folder instead (for example <span class="mono">python3 -m http.server</span>).</p>`;
    $('#reps').innerHTML = '';
  }
})();
