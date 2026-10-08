// The tabbed planning panel.
import { CONFIG } from './config.js';
import { st, cur, live, ui, save, emit, $, $$, fmt, esc, iso, parseDate } from './store.js';
import { HZ, HZS, TER, LEVEL, secTime, plan, totals, startDate, summitDate, monthF, fmtDate, fmtDay, seasonState, seasFL, FC, tempAt, chill,
  waypointWx, nightLow, hzAdj, hzMax, flags, rateDay, sun, moon, tm, hrs, summitTimes } from './calc.js';
import { daySummary, forecastDates, wmo, wmoShort } from './live.js';
import { gearList, gearContext } from './gear.js';
import { lineMiles, sectionCoords } from './data.js';
import { renderEditor } from './editor.js';

const TABS = [['route', 'Route'], ['plan', 'Plan'], ['wx', 'Weather'], ['updates', 'Updates'], ['gear', 'Gear'], ['sheet', 'Sheet'], ['log', 'Log']];
const pane = () => $('#pane');
const R_ = {};

export function renderTabs() {
  const tabs = ui.editing ? [['edit', 'Editor'], ...TABS] : TABS;
  $('#tabs').innerHTML = tabs.map(t => `<button role="tab" data-t="${t[0]}" aria-selected="${st.tab === t[0]}">${t[1]}</button>`).join('');
  $$('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.t));
}
export function setTab(t) { st.tab = t; save(); renderTabs(); renderPane(); }
export function renderPane(keepScroll) {
  if (!cur.route) return;
  const p = pane(), y = p.scrollTop;
  if (st.tab === 'edit' && !ui.editing) st.tab = 'route';
  (st.tab === 'edit' ? renderEditor : R_[st.tab] || R_.route)(p);
  p.scrollTop = keepScroll ? y : 0;
}
/** Called when live data arrives: refresh only the tabs that show it, without losing the reader's place. */
export function liveChanged() { if (['wx', 'updates', 'route', 'plan', 'gear'].includes(st.tab)) renderPane(true); }

function seasonStrip(R) {
  const seg = (a, b, c) => `<u class="${c}" style="left:${a / 12 * 100}%;width:${(b - a) / 12 * 100}%"></u>`;
  const bar = ([s, e], c) => e > 12 ? seg(s, 12, c) + seg(0, e - 12, c) : seg(s, e, c);
  return `<div class="season" role="img" aria-label="Season by month">${bar(R.season, '')}${bar(R.prime, 'prime')}<em style="left:${monthF() / 12 * 100}%"></em>${'JFMAMJJASOND'.split('').map(l => `<span>${l}</span>`).join('')}</div>`;
}
const chips = o => Object.keys(o).filter(k => o[k]).sort((a, b) => o[b] - o[a]).map(k => `<span class="hz l${o[k]}" title="${['', 'Low', 'Moderate', 'High'][o[k]]}">${HZ[k]}</span>`).join('');
const SRC_LABEL = { live: 'the live forecast', manual: 'your own numbers', seasonal: 'seasonal typicals' };
function lineBadge(R) {
  const q = R.line?.quality || 'approximate';
  return q === 'approximate' ? `<span class="badge" title="${esc(R.line?.source || '')}">approximate line</span>` : `<span class="tag" title="${esc(R.line?.source || '')}">${q === 'gps' ? 'GPS track' : esc(q)}${R.line?.asOf ? ' · ' + esc(R.line.asOf) : ''}</span>`;
}

/* ---------- Route ---------- */
R_.route = p => {
  const R = cur.route, M = cur.peak, t = totals(R), ss = seasonState(), f = FC();
  p.innerHTML = `<div><h2>${esc(R.name)}</h2><div class="grade">${esc(R.grade)} ${lineBadge(R)}</div></div>
  <p>${esc(R.summary)}</p>
  <div class="stats"><div><b>${t.mi.toFixed(1)} mi</b><span>Round trip</span></div><div><b>${fmt(t.gain)} ft</b><span>Total gain</span></div><div><b>${R.days[0] === R.days[1] ? R.days[0] : R.days[0] + '–' + R.days[1]} day${R.days[1] > 1 ? 's' : ''}</b><span>Typical</span></div><div><b>${Math.round(t.h)} h</b><span>Moving time</span></div></div>
  <div><h3>Experience required</h3><div class="pips">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= R.level ? 'on' : ''}"></i>`).join('')}<b>${LEVEL[R.level] || ''}</b></div><ul class="plain">${(R.skills || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
  <div><h3>Season</h3>${seasonStrip(R)}<p class="sub" style="margin-top:6px">Solid bar is prime season, pale bar is the shoulder. The marker is your summit day, ${fmtDate(summitDate())}: <b>${ss[0].toLowerCase()}</b>.</p></div>
  <div><h3>Route by section</h3><div class="secs">${R.sections.map((s, i) => { const a = R.waypoints[i], b = R.waypoints[i + 1], d = b.ele - a.ele; return `<div class="sec" data-i="${i}"><span class="n">${i + 1}</span><div><div class="h">${esc(a.name)} → ${esc(b.name)}</div><div class="m">${fmt(a.ele)} → ${fmt(b.ele)} ft · ${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))} · ${s.miles} mi · ${TER[s.terrain]} · ${hrs(secTime(R, i, 1))} up</div></div><div class="t">${esc(s.note || '')}</div><div class="chips">${chips(hzAdj(R, i)) || '<span class="hz l0">No notable hazards</span>'}</div></div>`; }).join('')}</div>
  <p class="sub" style="margin-top:6px">Hazard ratings are adjusted for your summit day using ${SRC_LABEL[f.src]}. Times use your pace setting and include short breaks.</p></div>
  <div><h3>Permits and rules</h3><p>${esc(M.permit || '')}</p><div class="links" style="margin-top:8px">${M.manager ? `<a href="${esc(M.manager.url)}" target="_blank" rel="noopener">${esc(M.manager.name)} ↗</a>` : ''}</div><p class="sub" style="margin-top:6px">Rules and fees change. Confirm with the land manager before you go.</p></div>
  ${(R.line?.quality || 'approximate') === 'approximate' ? `<p class="sub">The line on the map is hand-placed between known points and is drawn dashed. Import a GPS track in <b>Edit data</b> to replace it.</p>` : ''}`;
  $$('.sec', p).forEach(el => { el.onmouseenter = () => emit('hot', +el.dataset.i); el.onmouseleave = () => emit('hot', -1); el.onclick = () => emit('hot', +el.dataset.i); });
  markHot();
};
export function markHot() { $$('.sec', pane()).forEach(el => el.classList.toggle('hot', +el.dataset.i === ui.hot)); }
export function scrollToSection(i) { const el = $(`.sec[data-i="${i}"]`, pane()); el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

/* ---------- Plan ---------- */
function profile(pl) {
  const R = cur.route, W = 410, H = 180, l = 40, r = 10, t = 22, b = 22, cum = [0]; R.sections.forEach(s => cum.push(cum[cum.length - 1] + s.miles));
  // Build the trace. Sections with recorded elevations (GPS tracks) show real relief; others are straight lines.
  const trace = R.sections.map((s, i) => {
    const c = sectionCoords(R, i), a = R.waypoints[i], z = R.waypoints[i + 1], pts = [[cum[i], a.ele]];
    if (c.slice(1, -1).every(q => q.length > 2) && c.length > 2) { const len = lineMiles(c) || 1; let d = 0; for (let k = 1; k < c.length - 1; k++) { d += lineMiles([c[k - 1], c[k]]); pts.push([cum[i] + d / len * s.miles, c[k][2]]); } }
    pts.push([cum[i + 1], z.ele]); return pts;
  });
  const es = trace.flat().map(q => q[1]), lo = Math.floor(Math.min(...es) / 1000) * 1000, hi = Math.ceil(Math.max(...es) / 1000) * 1000 || 1000, tot = cum[cum.length - 1] || 1;
  const x = m => l + m / tot * (W - l - r), y = e => t + (1 - (e - lo) / ((hi - lo) || 1)) * (H - t - b); let g = '';
  const step = hi - lo > 6000 ? 2000 : 1000; for (let e = lo; e <= hi; e += step) g += `<line x1="${l}" x2="${W - r}" y1="${y(e)}" y2="${y(e)}" stroke="var(--line)" stroke-width="1"/><text x="${l - 5}" y="${y(e) + 3}" text-anchor="end">${fmt(e)}</text>`;
  g += `<path d="M${x(0)},${y(lo)} ${trace.flat().map(q => `L${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join(' ')} L${x(tot)},${y(lo)}Z" fill="var(--ice)" opacity=".12"/>`;
  trace.forEach((pts, i) => { const c = hzMax(R, i); g += `<polyline points="${pts.map(q => x(q[0]).toFixed(1) + ',' + y(q[1]).toFixed(1)).join(' ')}" fill="none" stroke="var(--${c ? 'h' + c : 'hok'})" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`; });
  R.waypoints.forEach((p, i) => {
    const X = x(cum[i]), Y = y(p.ele), sl = pl.camps.includes(i);
    if (p.type === 'camp') g += `<path d="M${X - 5},${Y + 4} L${X},${Y - 6} L${X + 5},${Y + 4}Z" fill="${sl ? 'var(--accent)' : 'var(--panel)'}" stroke="${sl ? 'var(--accent)' : 'var(--ink)'}" stroke-width="1.5"/>`;
    else g += `<circle cx="${X}" cy="${Y}" r="${p.type === 'summit' ? 4 : 2.5}" fill="var(--ink)"/>`;
    if ((p.type === 'camp' && sl) || p.type === 'summit' || p.type === 'trailhead') { const an = X > W - 90 ? 'end' : X < l + 40 ? 'start' : 'middle'; g += `<text class="nm" x="${X}" y="${p.type === 'trailhead' ? Y + 13 : Y - 10}" text-anchor="${an}">${esc(p.name)} ${fmt(p.ele)}</text>`; }
  });
  g += `<text x="${l}" y="${H - 6}">0 mi</text><text x="${W - r}" y="${H - 6}" text-anchor="end">${tot.toFixed(1)} mi one way</text>`;
  return `<svg class="prof" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile with camps">${g}</svg>`;
}
function planOut() {
  const R = cur.route, pl = plan(), T = summitTimes(pl), s = sun(); let h = '';
  h += `<div><h3>Camps</h3><div class="secs">${R.waypoints.map((p, i) => p.type === 'camp' ? `<div class="camp"><b>${esc(p.name)} <span class="mono" style="font-size:12px;font-weight:400">${fmt(p.ele)} ft</span></b><span class="sub">${esc(p.note || '')} Overnight low about ${Math.round(nightLow(i))}°F.</span><button class="btn ghost" data-camp="${i}" aria-pressed="${pl.camps.includes(i)}">${pl.camps.includes(i) ? 'Sleeping here' : 'Sleep here'}</button></div>` : '').join('') || '<div class="camp"><span class="sub">This route is climbed car to car in a day. There are no established camps.</span></div>'}</div></div>`;
  h += `<div><h3>Elevation profile</h3><div class="box">${profile(pl)}<div class="legend" style="margin-top:6px"><span><i style="background:var(--hok)"></i>Low</span><span><i style="background:var(--h1)"></i>Some</span><span><i style="background:var(--h2)"></i>Moderate</span><span><i style="background:var(--h3)"></i>High hazard</span><span>▲ camp</span></div></div></div>`;
  h += `<div><h3>Itinerary · ${pl.days.length} day${pl.days.length > 1 ? 's' : ''}</h3><div style="display:grid;gap:8px">`;
  pl.days.forEach((d, i) => {
    const dt = fmtDay(new Date(startDate().getTime() + i * 864e5)), cls = d.h > 15 ? 'd' : d.h > 12 ? 'w' : '', bar = `<div class="bar"><i class="${cls}" style="width:${Math.min(100, d.h / 16 * 100)}%"></i></div>`, W = R.waypoints;
    if (d.type === 'approach') { const st0 = d.h > 8 ? 360 : 480; h += `<div class="day"><div class="hd"><b>Day ${i + 1} · ${esc(W[d.from].name)} to ${esc(W[d.to].name)}</b><span>${dt}</span></div><div class="sub mono">${d.mi.toFixed(1)} mi · +${fmt(d.up)} ft · ${hrs(d.h)}</div>${bar}<div class="tl"><span>${tm(st0)}</span><span>Leave ${esc(W[d.from].name)}</span><span>${tm(st0 + d.h * 60)}</span><span>In camp at ${fmt(W[d.to].ele)} ft. Eat, melt water, sleep early.</span></div></div>`; }
    else if (d.type === 'summit') { h += `<div class="day"><div class="hd"><b>Day ${i + 1} · Summit${pl.same && pl.hi ? ' and walk out' : ''}</b><span>${dt}</span></div><div class="sub mono">${d.mi.toFixed(1)} mi · +${fmt(d.upft)} ft · ${hrs(d.h)}</div>${bar}<div class="tl"><span>${tm(T.wake)}</span><span>Wake${T.wake < 0 ? ' (the evening before)' : ''}</span><span>${tm(T.dep)}</span><span>Leave ${esc(W[d.from].name)}</span><span>${tm(T.top)}</span><span>Summit, ${hrs(d.up.h)} up</span><span>${tm(T.turn)}</span><span><b>Turnaround deadline.</b> ${T.snowy ? 'Later than this and the snow is softening above you.' : 'Later than this and you finish in the dark.'}</span><span>${tm(T.back)}</span><span>Back at ${esc(W[d.to].name)}</span></div>${d.h > 14 ? `<div class="flag l3">A ${Math.round(d.h)}-hour summit day. ${W.some(q => q.type === 'camp') ? 'Add or move up a camp, or pick a faster pace only if you have done days like this.' : 'Start in the dark and carry a headlamp for the descent.'}</div>` : ''}</div>`; }
    else h += `<div class="day"><div class="hd"><b>Day ${i + 1} · Walk out</b><span>${dt}</span></div><div class="sub mono">${d.mi.toFixed(1)} mi · −${fmt(d.dn)} ft${d.up ? ' · +' + fmt(d.up) + ' ft' : ''} · ${hrs(d.h)}</div>${bar}</div>`;
  });
  h += `</div><p class="sub" style="margin-top:6px">Sunrise ${tm(s.rise)}, sunset ${tm(s.set)} ${s.tz} on summit day.</p></div>`;
  $('#planOut').innerHTML = h;
  $$('#planOut [data-camp]').forEach(b => b.onclick = () => { const i = +b.dataset.camp, a = st.camps[cur.route.id], j = a.indexOf(i); j < 0 ? a.push(i) : a.splice(j, 1); save(); planOut(); emit('redraw'); });
}
R_.plan = p => {
  const R = cur.route;
  p.innerHTML = `<div><h2>Plan the climb</h2><div class="grade">${esc(cur.peak.name)} · ${esc(R.name)}</div></div>
  <div class="box form">
   <label>Start date<input type="date" id="fDate" value="${st.date}"></label>
   <label>Team size<input type="number" id="fTeam" min="1" max="12" value="${st.team}"></label>
   <label>Pace<select id="fPace"><option value="0.8">Fast, fit and acclimatized</option><option value="1">Steady</option><option value="1.25">Relaxed or first big peak</option></select></label>
   <label>After the summit<select id="fWalk"><option value="auto">Decide for me</option><option value="same">Walk out the same day</option><option value="next">Sleep at camp, walk out next day</option></select></label>
  </div>
  <div>${seasonStrip(R)}<p class="sub" style="margin-top:6px" id="planSeason"></p></div>
  <div id="planOut" style="display:flex;flex-direction:column;gap:18px"></div>`;
  $('#fPace').value = String(st.pace); $('#fWalk').value = st.walk;
  const up = () => { st.date = $('#fDate').value || st.date; st.team = Math.max(1, Math.min(12, +$('#fTeam').value || 1)); st.pace = +$('#fPace').value; st.walk = $('#fWalk').value; save(); $('#planSeason').textContent = `Summit day ${fmtDate(summitDate())}: ${seasonState()[0].toLowerCase()}.`; $('.season em', p).style.left = monthF() / 12 * 100 + '%'; planOut(); emit('redraw'); };
  ['fDate', 'fTeam', 'fPace', 'fWalk'].forEach(id => $('#' + id).onchange = up); up();
};

/* ---------- Weather ---------- */
function srcLine() {
  const f = live.fc;
  if (live.fcState === 'loading') return `<div class="src wait"><i></i>Loading the forecast from Open-Meteo…</div>`;
  if (live.fcState === 'error') return `<div class="src err"><i></i>Forecast did not load (${esc(live.fcErr)}). <button data-retry>Try again</button></div>`;
  if (!f) return '';
  return `<div class="src"><i></i>Open-Meteo forecast, loaded ${new Date(f.fetched).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. <button data-retry>Refresh</button></div>`;
}
function dayStrip() {
  const f = live.fc, R = cur.route; if (!f) return '';
  const n = R.waypoints.length - 1, sd = iso(summitDate());
  return `<div><h3>Summit forecast, next ${forecastDates(f).length} days</h3><div class="days">${forecastDates(f).map(d => {
    const s = daySummary(f, n, d); if (!s) return '';
    return `<button class="dayc r${rateDay(s)}" data-day="${d}" aria-pressed="${d === sd}" title="${wmo(s.code)}. Plan the summit for this day."><b>${parseDate(d).toLocaleDateString('en-US', { weekday: 'short' })} ${+d.slice(8)}</b><span class="t">${Math.round(s.hi)}°/${Math.round(s.lo)}°</span><span>${Math.round(s.wind)} mph</span><span>FL ${(s.fl / 1000).toFixed(1)}</span><span>${s.sn >= 0.5 ? s.sn.toFixed(0) + '″ snow' : s.pr >= 0.05 ? s.pr.toFixed(2) + '″ rain' : wmoShort(s.code)}</span></button>`;
  }).join('')}</div><p class="sub" style="margin-top:6px">High and low at ${fmt(cur.peak.elev)} ft, ridge-top wind, freezing level in thousands of feet. Bar color: green workable, orange caution, red poor. Pick a day to make it your summit day.</p></div>`;
}
function wxOut() {
  const R = cur.route, M = cur.peak, f = FC(), s = sun(), mo = moon(), fl = flags(), keys = Object.keys(HZ).filter(k => R.sections.some(x => (x.hazards || {})[k]));
  const worst = fl[0][0], sd = summitDate(), inFc = !!(live.fc && daySummary(live.fc, 0, iso(sd)));
  let basis;
  if (f.src === 'live') basis = `Using the live forecast for summit day, ${fmtDay(sd)}: freezing level ${fmt(f.fl)} ft, ridge wind ${f.wind} mph, ${f.snow} in new snow in the prior 48 h.`;
  else if (f.src === 'manual') basis = `Using your own numbers for ${fmtDay(sd)}.`;
  else basis = live.fc && !inFc ? `Forecasts reach ${CONFIG.weather.days} days out. Your summit day, ${fmtDate(sd)}, is beyond that, so the numbers below are seasonal typicals (freezing level ${fmt(f.fl)} ft). Pick a day above to plan for this week.` : `Using seasonal typicals for ${fmtDate(sd)} (freezing level ${fmt(f.fl)} ft) until the forecast loads.`;
  const anyLive = R.waypoints.some((_, i) => waypointWx(i).live), showDepth = anyLive && R.waypoints.some((_, i) => waypointWx(i).depth != null);
  $('#wxOut').innerHTML = `
  <p class="sub">${basis}</p>
  <div><h3>Read: ${worst >= 3 ? 'poor window' : worst === 2 ? 'go with caution' : 'looks workable'}</h3><div style="display:grid;gap:6px">${fl.map(x => `<div class="flag l${x[0]}">${x[1]}</div>`).join('')}</div></div>
  <div><h3>By waypoint, ${fmtDay(sd)}</h3><div class="box scroll"><table><tr><th>Waypoint</th><th>Elev</th><th>High</th><th>Low</th><th>Wind</th><th>Chill</th>${showDepth ? '<th>Snow</th>' : ''}</tr>${R.waypoints.map((p, i) => [p, waypointWx(i)]).reverse().map(([p, w]) => `<tr><td>${esc(p.name)}</td><td class="mono">${fmt(p.ele)}</td><td class="mono">${Math.round(w.hi)}°</td><td class="mono">${Math.round(w.lo)}°</td><td class="mono">${Math.round(w.wind)}</td><td class="mono">${Math.round(w.chill)}°</td>${showDepth ? `<td class="mono">${w.depth == null ? '–' : Math.round(w.depth) + '″'}</td>` : ''}</tr>`).join('')}</table></div>
  <p class="sub" style="margin-top:6px">°F and mph. ${anyLive ? 'Each row is the forecast at that waypoint\'s own elevation. Wind is the free-air wind at that height, a fair guide on ridges and summits and an overestimate in trees.' + (showDepth ? ' Snow is modelled depth on the ground and is rough in steep terrain.' : '') : 'Estimated from the freezing level with a 3.5°F per 1,000 ft lapse rate; wind is scaled down from the summit value.'}</p></div>
  <div><h3>Hazards by section</h3><div class="box scroll"><table><tr><th>Section</th>${keys.map(k => `<th title="${HZ[k]}">${HZS[k]}</th>`).join('')}</tr>${R.sections.map((x, i) => { const a = hzAdj(R, i); return `<tr><td>${i + 1}. ${esc(R.waypoints[i].name)} → ${esc(R.waypoints[i + 1].name)}</td>${keys.map(k => `<td class="c"><i class="l${a[k]}" title="${HZ[k]}: ${['none', 'low', 'moderate', 'high'][a[k]]}">${a[k] || '·'}</i></td>`).join('')}</tr>`; }).join('')}</table></div>
  <p class="sub" style="margin-top:6px">${keys.map(k => HZS[k] + ' ' + HZ[k].toLowerCase()).join(' · ')}. Scale 1 low to 3 high. Each section starts from its normal-season rating, then shifts: crevasses and icy slopes worsen from August, rockfall and icefall worsen when the freezing level sits above the section, avalanche rises with new snow or a winter snowpack, and navigation worsens in cloud.</p></div>
  <div><h3>Light on summit day</h3><div class="box sun"><div><b>${tm(s.rise)}</b><span>Sunrise ${s.tz}</span></div><div><b>${tm(s.set)}</b><span>Sunset</span></div><div><b>${hrs((s.set - s.rise) / 60)}</b><span>Daylight</span></div><div><b>${mo.ill}%</b><span>${mo.name}</span></div></div></div>
  <div><h3>National Weather Service, summit grid</h3>${live.nws ? (live.nws.error ? `<div class="src err"><i></i>NWS forecast did not load (${esc(live.nws.error)}).</div>` : `<div class="box">${live.nws.periods.slice(0, 4).map(q => `<div class="upd"><b>${esc(q.name)}</b><span>${esc(q.text)}</span></div>`).join('')}</div>`) : '<div class="src wait"><i></i>Loading…</div>'}
  <div class="links" style="margin-top:8px"><a href="https://forecast.weather.gov/MapClick.php?lat=${M.summit[1]}&lon=${M.summit[0]}" target="_blank" rel="noopener">Full NWS point forecast ↗</a><a href="${CONFIG.avalanche.site}" target="_blank" rel="noopener">NWAC mountain weather ↗</a></div></div>`;
}
R_.wx = p => {
  const f = FC(), manual = st.fcMode === 'manual';
  p.innerHTML = `<div><h2>Weather</h2><div class="grade">${esc(cur.route.name)} · summit day ${fmtDate(summitDate())}</div></div>
  ${srcLine()}
  ${dayStrip()}
  <div class="row"><div class="seg" role="group" aria-label="Numbers used for hazards and gear"><button data-mode="live" aria-pressed="${!manual}">Forecast</button><button data-mode="manual" aria-pressed="${manual}">My numbers</button></div><span class="sub">drive the hazard ratings and gear list</span></div>
  ${manual ? `<div class="box form">
   <label class="wide"><span class="rng">Freezing level <b id="vFl">${fmt(f.fl)} ft</b></span><input type="range" id="cFl" min="1000" max="17000" step="500" value="${f.fl}"></label>
   <label><span class="rng">Summit wind <b id="vWind">${f.wind} mph</b></span><input type="range" id="cWind" min="0" max="70" step="5" value="${f.wind}"></label>
   <label><span class="rng">New snow, 48 h <b id="vSnow">${f.snow} in</b></span><input type="range" id="cSnow" min="0" max="30" step="1" value="${f.snow}"></label>
   <label>Sky<select id="cSky"><option value="0">Clear</option><option value="1">Partly cloudy</option><option value="2">In cloud or precipitation</option></select></label>
   <label>&nbsp;<button class="btn ghost" id="cReset">Reset to seasonal typical</button></label></div>` : ''}
  <div id="wxOut" style="display:flex;flex-direction:column;gap:18px"></div>`;
  $$('[data-retry]', p).forEach(b => b.onclick = () => emit('refresh-live'));
  $$('[data-mode]', p).forEach(b => b.onclick = () => { st.fcMode = b.dataset.mode; save(); R_.wx(p); emit('redraw'); });
  $$('[data-day]', p).forEach(b => b.onclick = () => { const d = parseDate(b.dataset.day); st.date = iso(new Date(d.getTime() - plan().summitIdx * 864e5)); st.fcMode = 'live'; save(); R_.wx(p); emit('redraw'); });
  if (manual) {
    $('#cSky').value = String(f.sky);
    const up = () => { st.fc = { fl: +$('#cFl').value, wind: +$('#cWind').value, snow: +$('#cSnow').value, sky: +$('#cSky').value }; save(); $('#vFl').textContent = fmt(st.fc.fl) + ' ft'; $('#vWind').textContent = st.fc.wind + ' mph'; $('#vSnow').textContent = st.fc.snow + ' in'; wxOut(); emit('redraw'); };
    ['cFl', 'cWind', 'cSnow'].forEach(id => $('#' + id).oninput = up); $('#cSky').onchange = up;
    $('#cReset').onclick = () => { st.fc = {}; save(); R_.wx(p); emit('redraw'); };
  }
  wxOut();
};

/* ---------- Updates ---------- */
R_.updates = p => {
  const M = cur.peak, R = cur.route;
  const wait = '<div class="src wait"><i></i>Loading…</div>', err = (what, e) => `<div class="src err"><i></i>${what} did not load (${esc(e)}).</div>`;
  let alerts = wait;
  if (live.alerts) alerts = live.alerts.error ? err('NWS alerts', live.alerts.error) : live.alerts.length ? `<div style="display:grid;gap:6px">${live.alerts.map(a => `<div class="flag l${/Extreme|Severe/.test(a.severity) ? 3 : 2}"><b>${esc(a.event)}</b>${a.ends ? ` until ${new Date(a.ends).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}<br>${esc(a.headline || '')}</div>`).join('')}</div>` : '<div class="flag l0">No active weather alerts for the summit.</div>';
  let avy = wait;
  if (live.avy) {
    const a = live.avy;
    avy = a.error ? err('The avalanche forecast', a.error) : `<div class="box"><div class="row"><span class="danger"${a.color ? ` style="background:${esc(a.color)};color:#111"` : ''}>${a.level > 0 ? a.level + ' · ' : ''}${esc(a.label)}</span><b>${esc(a.zone)}</b>${a.inside ? '' : '<span class="sub">nearest forecast zone; this peak is outside it</span>'}</div>
    <p class="sub" style="margin-top:8px">${a.offSeason || a.level <= 0 ? 'No danger rating is posted. Avalanche centers stop daily forecasts outside winter and spring, but slides still happen on steep snow after storms.' : esc(a.advice)}</p>
    <div class="links" style="margin-top:8px"><a href="${esc(a.link)}" target="_blank" rel="noopener">Full ${esc(CONFIG.avalanche.center)} forecast ↗</a></div></div>`;
  }
  let nps = '';
  if (live.nps) nps = `<div><h3>Park alerts</h3>${live.nps.error ? err('Park alerts', live.nps.error) : live.nps.length ? `<div class="box">${live.nps.map(a => `<div class="upd"><b>${esc(a.title)}</b><span class="sub mono">${esc(a.category)} · ${esc(a.date)}</span><span>${esc(a.text)}</span>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">Details ↗</a>` : ''}</div>`).join('')}</div>` : '<p class="sub">No park alerts posted.</p>'}</div>`;
  let feed = wait;
  if (live.updates) {
    const list = live.updates.error ? [] : (live.updates.items || []).filter(u => u.peak === M.id || u.peak === '*').filter(u => !u.route || u.route === R.id).sort((a, b) => b.date.localeCompare(a.date));
    feed = live.updates.error ? err('The updates feed', live.updates.error) : list.length ? `<div class="box">${list.map(u => `<div class="upd"><b>${esc(u.title)}</b><span class="sub mono">${esc(u.date)}${u.source ? ' · ' + esc(u.source) : ''}</span><span>${esc(u.body)}</span>${u.url ? `<a href="${esc(u.url)}" target="_blank" rel="noopener">Source ↗</a>` : ''}</div>`).join('')}</div>` : `<p class="sub">Nothing posted for ${esc(M.name)} yet. Entries come from <span class="mono">data/updates.json</span> in the site's repository.</p>`;
  }
  p.innerHTML = `<div><h2>Updates</h2><div class="grade">${esc(M.name)}</div></div>
  <div><h3>Weather alerts</h3>${alerts}</div>
  <div><h3>Avalanche forecast</h3>${avy}</div>
  ${nps}
  <div><h3>Route and access reports</h3>${feed}${live.updates && !live.updates.error && live.updates.checked ? `<p class="sub" style="margin-top:6px">Feed last checked ${esc(live.updates.checked)}. Reports go stale quickly: open the source before relying on one.</p>` : ''}</div>
  <div><h3>Check at the source</h3><div class="links">${[M.manager && { label: M.manager.name, url: M.manager.url }, ...(M.links || [])].filter(Boolean).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div></div>`;
};

/* ---------- Gear ---------- */
function checkRows(items) { return items.map(g => `<label><input type="checkbox" data-chk="${g.id}" ${st.chk[g.id] ? 'checked' : ''}><span>${esc(g.n)}${g.note ? `<small>${esc(g.note)}</small>` : ''}</span><span class="w">${g.team ? 'team' : g.oz ? (g.oz / 16).toFixed(1) + ' lb' : ''}</span></label>`).join(''); }
function bindChecks(p, cb) { $$('[data-chk]', p).forEach(c => c.onchange = () => { st.chk[c.dataset.chk] = c.checked; save(); cb && cb(); }); }
R_.gear = p => {
  const c = gearContext(), L = gearList(c), cats = [...new Set(L.map(g => g.cat))];
  const per = L.reduce((s, g) => s + (g.team ? g.oz * (g.id === 'tent' ? Math.ceil(c.team / 2) : 1) / c.team : g.oz), 0) / 16, food = c.days * 2, water = (c.snow ? 2 : 3) * 2.2;
  p.innerHTML = `<div><h2>Gear</h2><div class="grade">${esc(cur.route.name)} · ${c.team} climber${c.team > 1 ? 's' : ''} · ${c.nights} night${c.nights === 1 ? '' : 's'}</div></div>
  <div class="box"><div class="row" style="justify-content:space-between"><b class="mono" id="gCount"></b><span class="mono">≈ ${Math.round(per + food + water)} lb per person</span></div><div class="meter"><i id="gBar"></i></div>
  <p class="sub" style="margin-top:8px">${per.toFixed(0)} lb of gear including boots and a share of team kit, ${food} lb of food, ${water.toFixed(0)} lb of water. Built for a summit near ${Math.round(c.Ts)}°F${c.Tc !== null ? ` and a camp low near ${Math.round(c.Tc)}°F` : ''}, from ${SRC_LABEL[FC().src]}. Change the date, camps or forecast and the list updates.</p></div>
  ${cats.map(cat => `<div><h3>${cat}</h3><div class="box gear">${checkRows(L.filter(g => g.cat === cat))}</div></div>`).join('')}
  <div><button class="btn ghost" id="gClear">Uncheck everything</button></div>`;
  const cnt = () => { const n = L.filter(g => st.chk[g.id]).length; $('#gCount').textContent = `${n} of ${L.length} packed`; $('#gBar').style.width = n / L.length * 100 + '%'; };
  bindChecks(p, cnt); cnt(); $('#gClear').onclick = () => { L.forEach(g => delete st.chk[g.id]); save(); R_.gear(p); };
};

/* ---------- Trip sheet ---------- */
const PRE = [['p1', 'Read the forecast and avalanche tabs this morning'], ['p2', 'Permits and passes printed or saved offline'], ['p3', 'GPS track downloaded; phone and communicator charged'], ['p4', 'Team agreed on the turnaround time out loud'], ['p5', 'Trip sheet sent to the home contact'], ['p6', 'Signed the trailhead or ranger register']];
function sheetText() {
  const R = cur.route, M = cur.peak, W = R.waypoints, pl = plan(), T = summitTimes(pl), f = FC(), s = st.sheet, L = [];
  const end = new Date(startDate().getTime() + (pl.days.length - 1) * 864e5);
  L.push(`${M.name.toUpperCase()} · ${R.name}`, `${R.grade}`, `Dates: ${fmtDate()}${pl.days.length > 1 ? ' to ' + fmtDay(end) : ''}`, `Party (${st.team}): ${s.party || '—'}`, `Vehicle at ${W[0].name}: ${s.car || '—'}`, `Home contact: ${s.home || '—'}`, '', 'ITINERARY');
  pl.days.forEach((d, i) => {
    if (d.type === 'approach') L.push(`Day ${i + 1}: ${W[d.from].name} to ${W[d.to].name} (${fmt(W[d.to].ele)} ft), ${d.mi.toFixed(1)} mi, ${hrs(d.h)}`);
    else if (d.type === 'summit') L.push(`Day ${i + 1}: Summit day from ${W[d.from].name}. Leave ${tm(T.dep)}, summit about ${tm(T.top)}, back at ${W[d.to].name} about ${tm(T.back)}`, `       TURNAROUND ${tm(T.turn)}, no exceptions`);
    else L.push(`Day ${i + 1}: Walk out to ${W[0].name}, ${hrs(d.h)}`);
  });
  const last = pl.days[pl.days.length - 1], outBy = last.type === 'summit' ? T.back : 480 + last.h * 60;
  L.push('', `Expected out: ${fmtDay(end)} about ${tm(outBy)}`, `If you have not heard from us by ${tm(Math.min(outBy + 360, 1439))} that night, call 911 and ask for the county sheriff (search and rescue). Give them this sheet.`, '');
  L.push(`PLANNED FOR (${SRC_LABEL[f.src]})`, `Freezing level ${fmt(f.fl)} ft, summit wind ${f.wind} mph, ${f.snow} in new snow, ${['clear', 'partly cloudy', 'in cloud'][f.sky]}`, '', 'MAIN HAZARDS');
  R.sections.forEach((x, i) => { const a = hzAdj(R, i), k = Object.keys(a).filter(k => a[k] >= 2); if (k.length) L.push(`${W[i].name} to ${W[i + 1].name}: ${k.map(k => HZ[k].toLowerCase()).join(', ')}`); });
  L.push('', 'WAYPOINTS (lat, lon)'); W.forEach(w => L.push(`${w.name}: ${w.at[1].toFixed(4)}, ${w.at[0].toFixed(4)} · ${fmt(w.ele)} ft`));
  if ((R.line?.quality || 'approximate') === 'approximate') L.push('(Coordinates are approximate. Do not navigate by them.)');
  return L.join('\n');
}
R_.sheet = p => {
  const s = st.sheet;
  p.innerHTML = `<div><h2>Trip sheet</h2><div class="grade">Leave this with someone at home</div></div>
  <div class="box form"><label class="wide">Party names<input type="text" id="sParty" value="${esc(s.party)}" placeholder="Who is on the rope"></label><label>Vehicle and plate<input type="text" id="sCar" value="${esc(s.car)}"></label><label>Home contact<input type="text" id="sHome" value="${esc(s.home)}" placeholder="Name and phone"></label></div>
  <pre class="sheet" id="sTxt"></pre>
  <div class="row"><button class="btn" id="sCopy">Copy trip sheet</button><span class="sub" id="sMsg"></span></div>
  <div><h3>Before you leave the trailhead</h3><div class="box gear">${checkRows(PRE.map(q => ({ id: q[0], n: q[1] })))}</div></div>
  <div><button class="btn ghost" id="sLog">Log this climb when you are back</button></div>`;
  const up = () => { st.sheet = { party: $('#sParty').value, car: $('#sCar').value, home: $('#sHome').value }; save(); $('#sTxt').textContent = sheetText(); };
  ['sParty', 'sCar', 'sHome'].forEach(id => $('#' + id).oninput = up); up(); bindChecks(p);
  $('#sCopy').onclick = () => copyText($('#sTxt'), $('#sMsg'));
  $('#sLog').onclick = () => setTab('log');
};
export function copyText(el, msg) {
  const t = el.textContent || el.value, ok = () => msg.textContent = 'Copied.', no = () => { if (el.select) el.select(); else { const r = document.createRange(); r.selectNodeContents(el); const g = getSelection(); g.removeAllRanges(); g.addRange(r); } msg.textContent = 'Selected. Press copy.'; };
  try { navigator.clipboard.writeText(t).then(ok, no); } catch (e) { no(); }
}

/* ---------- Log ---------- */
R_.log = p => {
  const sums = st.log.filter(l => l.ok), ft = sums.reduce((s, l) => s + (l.gain || 0), 0), label = cur.peak.name + ', ' + cur.route.name;
  p.innerHTML = `<div><h2>Climb log</h2><div class="grade">Saved in this browser</div></div>
  <div class="stats" style="grid-template-columns:repeat(3,1fr)"><div><b>${st.log.length}</b><span>Trips</span></div><div><b>${sums.length}</b><span>Summits</span></div><div><b>${fmt(ft)} ft</b><span>Climbed on summits</span></div></div>
  <div class="box form"><label>Date<input type="date" id="lDate" value="${st.date}"></label><label>Result<select id="lOk"><option value="1">Summit</option><option value="0">Turned around</option></select></label>
   <label class="wide">Climb<input type="text" id="lWhat" value="${esc(label)}"></label>
   <label class="wide">Notes<textarea id="lNote" rows="3" placeholder="Conditions, times, what you would change"></textarea></label>
   <div class="wide"><button class="btn" id="lAdd">Add to log</button></div></div>
  <div><h3>Entries</h3><div class="box">${st.log.length ? st.log.map((l, i) => `<div class="logrow"><b>${esc(l.what)}</b><span class="tag">${l.ok ? 'Summit' : 'Turned around'}</span><span class="sub">${esc(l.date)}${l.note ? ' · ' + esc(l.note) : ''}</span><button data-del="${i}">Remove</button></div>`).join('') : '<p class="sub">No climbs yet. The form above is filled in with the route you are planning; add it once you are home.</p>'}</div></div>`;
  $('#lAdd').onclick = () => { const what = $('#lWhat').value.trim(); if (!what) return; st.log.unshift({ date: $('#lDate').value, ok: $('#lOk').value === '1', what, note: $('#lNote').value.trim(), gain: what === label ? totals(cur.route).gain : 0 }); save(); R_.log(p); };
  $$('[data-del]', p).forEach(b => b.onclick = () => { st.log.splice(+b.dataset.del, 1); save(); R_.log(p); });
};
