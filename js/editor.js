// In-app data editor: move waypoints, trace or import route lines, edit sections and markers,
// then download the peak file to commit. Edits live in this browser as a draft until then.
import { st, cur, ui, save, emit, $, $$, fmt, esc } from './store.js';
import { validate, saveDraft, discardDraft, demFeet, parseGPX, applyTrack, lineMiles, sectionCoords, WAYPOINT_TYPES, TERRAINS, HAZARDS, POI_TYPES } from './data.js';
import { HZS, TER } from './calc.js';
import { onNextClick, cancelClick, getMap } from './map.js';

const clean = peak => JSON.stringify(peak, (k, v) => k.startsWith('_') ? undefined : v, 1);
let drawing = null, checkHtml = '', newPeakOpen = false;

/** Persist the draft and refresh the map (and optionally this panel). */
function changed(rerender, structural) {
  const M = cur.peak; M._draft = true;
  if (structural) delete st.camps[cur.route.id];
  saveDraft(JSON.parse(clean(M))); save();
  emit('data-changed');
  if (rerender) renderEditor($('#pane'), true);
}
const opt = (list, v, lab = x => x) => list.map(x => `<option value="${x}" ${x === v ? 'selected' : ''}>${esc(lab(x))}</option>`).join('');
const field = (path, v, attrs = '') => `<input data-b="${path}" value="${esc(v ?? '')}" ${attrs}>`;

export function renderEditor(p, keep) {
  const M = cur.peak, R = cur.route, y = p.scrollTop, probs = validate(M);
  p.innerHTML = `<div class="ed" style="display:flex;flex-direction:column;gap:14px">
  <div><h2>Editor</h2><div class="grade">${esc(M.name)} ${M._draft ? '<span class="badge">local draft</span>' : ''}</div></div>
  <p class="sub">Edits show on the map straight away and are kept in this browser as a draft. To publish, download the file and commit it to <span class="mono">data/peaks/${esc(M.id)}.json</span>. Drag any waypoint on the map to move it.</p>
  ${probs.length ? `<ul class="probs">${probs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}

  <fieldset><legend>Peak</legend><div class="form">
    <label>Name${field('peak.name', M.name)}</label><label>Short name${field('peak.short', M.short)}</label>
    <label>Summit elevation, ft${field('peak.elev', M.elev, 'type="number"')}</label><label>Area${field('peak.range', M.range)}</label>
    <label class="wide">Permits and rules<textarea data-b="peak.permit" rows="2">${esc(M.permit || '')}</textarea></label>
    <div class="wide row"><button class="btn ghost" id="eNewPeak">New peak…</button></div>
    ${newPeakOpen ? `<label>New peak id (lowercase)<input id="npId" placeholder="mount-daniel"></label><label>Name<input id="npName" placeholder="Mount Daniel"></label><label>Elevation, ft<input id="npElev" type="number"></label><label>&nbsp;<button class="btn" id="npGo">Create at map centre</button></label><p class="sub wide" id="npMsg">Pan the map so the summit is in the middle first. You can drag it afterwards.</p>` : ''}
  </div></fieldset>

  <fieldset><legend>Route</legend><div class="form">
    <label class="wide">Editing<select id="eRoute">${M.routes.map(r => `<option value="${esc(r.id)}" ${r === R ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}<option value="+">+ New route</option></select></label>
    <label>Name${field('route.name', R.name)}</label><label>Grade line${field('route.grade', R.grade)}</label>
    <label>Experience level, 1–4${field('route.level', R.level, 'type="number" min="1" max="5"')}</label><label>Typical days, min–max<span class="row" style="flex-wrap:nowrap">${field('route.days.0', R.days[0], 'type="number" min="1"')}${field('route.days.1', R.days[1], 'type="number" min="1"')}</span></label>
    <label>Season, months 0–12<span class="row" style="flex-wrap:nowrap">${field('route.season.0', R.season[0], 'type="number" step="0.1"')}${field('route.season.1', R.season[1], 'type="number" step="0.1"')}</span></label>
    <label>Prime season<span class="row" style="flex-wrap:nowrap">${field('route.prime.0', R.prime[0], 'type="number" step="0.1"')}${field('route.prime.1', R.prime[1], 'type="number" step="0.1"')}</span></label>
    <label class="wide">Summary<textarea data-b="route.summary" rows="3">${esc(R.summary || '')}</textarea></label>
    <label class="wide">Kit flags, comma-separated (axe, glacier, helmet, ice, rock, rap, blue, bear, avy)<input id="eKit" value="${esc((R.kit || []).join(', '))}"></label>
    <div class="wide row"><label class="btn ghost" style="cursor:pointer;flex-direction:row;color:var(--ink)">Import GPX track<input type="file" id="eGpx" accept=".gpx,application/gpx+xml" hidden></label>
      <span class="sub">Line: ${esc(R.line?.quality || 'approximate')}${R.line?.source ? ' · ' + esc(R.line.source) : ''}</span></div>
    <p class="sub wide">Month numbers: 0 is January 1, 5.5 is mid-June, 12 is December 31. A winter season can wrap past 12 (11 to 17.5 is December to mid-May). A GPX track replaces the line; waypoints snap to it in order and section mileage is re-measured.</p>
    ${M.routes.length > 1 ? '<div class="wide"><button class="btn ghost" id="eDelRoute">Delete this route</button></div>' : ''}
  </div></fieldset>

  <fieldset><legend>Waypoints</legend>
    ${R.waypoints.map((w, i) => `<div class="wp">
      ${field(`route.waypoints.${i}.name`, w.name, 'aria-label="Name"')}
      <select data-b="route.waypoints.${i}.type" aria-label="Type">${opt(WAYPOINT_TYPES, w.type)}</select>
      ${field(`route.waypoints.${i}.ele`, w.ele, 'type="number" aria-label="Elevation, ft"')}
      <input class="full" data-b="route.waypoints.${i}.note" value="${esc(w.note || '')}" placeholder="Note shown on the map and in the plan" aria-label="Note">
      <div class="full row"><button class="btn ghost" data-place="${i}">Place on map</button><button class="btn ghost" data-dem="${i}">Elevation from terrain</button>
        ${w.type === 'camp' ? `<label style="flex-direction:row;align-items:center;gap:4px;text-transform:none;letter-spacing:0;font-size:12px"><input type="checkbox" data-sleep="${i}" ${w.sleep ? 'checked' : ''} style="width:auto"> default camp</label>` : ''}
        ${i > 0 && i < R.waypoints.length - 1 ? `<button class="btn ghost" data-delwp="${i}">Remove</button>` : ''}<span class="sub mono">${w.at[1].toFixed(4)}, ${w.at[0].toFixed(4)}</span></div>
    </div>`).join('')}
    <div class="row" style="margin-top:8px"><button class="btn ghost" id="eAddWp">Add waypoint before the summit</button><button class="btn ghost" id="eCheck">Check elevations against terrain</button></div>
    <div id="eCheckOut" class="sub" style="margin-top:6px">${checkHtml}</div>
  </fieldset>

  <fieldset><legend>Sections</legend>
    ${R.sections.map((s, i) => `<div class="wp" style="grid-template-columns:minmax(0,1fr) 78px">
      <b class="full" style="font:600 15px var(--f-display);text-transform:uppercase">${i + 1}. ${esc(R.waypoints[i].name)} → ${esc(R.waypoints[i + 1].name)}</b>
      <select data-b="route.sections.${i}.terrain" aria-label="Terrain">${opt(TERRAINS, s.terrain, x => TER[x])}</select>
      ${field(`route.sections.${i}.miles`, s.miles, 'type="number" step="0.1" aria-label="Miles"')}
      <div class="full hzrow">${HAZARDS.map(k => `<label>${HZS[k]}<select data-hz="${i}.${k}">${opt([0, 1, 2, 3], (s.hazards || {})[k] || 0)}</select></label>`).join('')}</div>
      <input class="full" data-b="route.sections.${i}.note" value="${esc(s.note || '')}" placeholder="What this section is like" aria-label="Note">
      <div class="full row"><button class="btn ghost" data-draw="${i}">Trace on map</button><button class="btn ghost" data-straight="${i}">Straighten</button><button class="btn ghost" data-measure="${i}">Miles from line</button><span class="sub mono">${(s.via || []).length} shaping pts · ${lineMiles(sectionCoords(R, i)).toFixed(1)} mi drawn</span></div>
    </div>`).join('')}
  </fieldset>

  <fieldset><legend>Markers</legend>
    ${(M.pois || []).map((q, i) => `<div class="wp" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
      ${field(`peak.pois.${i}.name`, q.name, 'aria-label="Name"')}<select data-b="peak.pois.${i}.type" aria-label="Type">${opt(POI_TYPES, q.type)}</select>
      <input class="full" data-b="peak.pois.${i}.note" value="${esc(q.note || '')}" placeholder="Note" aria-label="Note">
      <div class="full row"><button class="btn ghost" data-placepoi="${i}">Place on map</button><button class="btn ghost" data-delpoi="${i}">Remove</button><span class="sub">${q.routes?.length ? 'shown on: ' + esc(q.routes.join(', ')) : 'shown on every route'}</span></div>
    </div>`).join('') || '<p class="sub">No markers yet.</p>'}
    <div style="margin-top:8px"><button class="btn ghost" id="eAddPoi">Add marker to this route</button></div>
  </fieldset>

  <fieldset><legend>Publish</legend>
    <div class="row"><button class="btn" id="eDown">Download ${esc(M.id)}.json</button><button class="btn ghost" id="eCopy">Copy JSON</button>${M._draft ? '<button class="btn ghost" id="eDiscard">Discard draft</button>' : ''}<span class="sub" id="eMsg"></span></div>
    <textarea id="eJson" rows="4" class="mono" style="margin-top:8px;font-size:11px" readonly hidden></textarea>
    <p class="sub" style="margin-top:6px">A new peak also needs one line in <span class="mono">data/index.json</span>: <span class="mono">{"id":"${esc(M.id)}","short":"${esc(M.short || M.name)}","name":"${esc(M.name)}","elev":${+M.elev || 0},"summit":[${M.summit.join(', ')}]}</span></p>
  </fieldset></div>`;
  if (keep) p.scrollTop = y;
  bind(p);
}

function setPath(path, raw, el) {
  const parts = path.split('.'), root = parts.shift() === 'peak' ? cur.peak : cur.route; let o = root;
  while (parts.length > 1) o = o[parts.shift()];
  const k = parts[0]; o[k] = el.type === 'number' ? +raw : raw;
}
function bind(p) {
  const M = cur.peak, R = cur.route;
  $$('[data-b]', p).forEach(el => el.onchange = () => { setPath(el.dataset.b, el.value, el); changed(/\.type$|\.name$/.test(el.dataset.b)); });
  $$('[data-hz]', p).forEach(el => el.onchange = () => { const [i, k] = el.dataset.hz.split('.'), s = R.sections[+i]; s.hazards ||= {}; if (+el.value) s.hazards[k] = +el.value; else delete s.hazards[k]; changed(); });
  $$('[data-sleep]', p).forEach(el => el.onchange = () => { const w = R.waypoints[+el.dataset.sleep]; if (el.checked) w.sleep = true; else delete w.sleep; changed(false, true); });
  $('#eKit').onchange = e => { R.kit = e.target.value.split(',').map(s => s.trim()).filter(Boolean); changed(); };

  $('#eRoute').onchange = e => {
    if (e.target.value !== '+') { emit('go', { route: e.target.value }); return; }
    const a = R.waypoints[0], z = R.waypoints[R.waypoints.length - 1]; let n = M.routes.length + 1, id = 'route-' + n; while (M.routes.some(r => r.id === id)) id = 'route-' + (++n);
    M.routes.push({ id, name: 'New route', grade: 'Grade ?', level: 2, days: [1, 2], season: [5.5, 8.8], prime: [6, 8], kit: [], summary: '', skills: [],
      line: { quality: 'approximate', asOf: new Date().toISOString().slice(0, 7), source: 'Placed in the editor' },
      waypoints: [{ name: 'Trailhead', type: 'trailhead', ele: a.ele, at: [+(a.at[0] + 0.01).toFixed(5), a.at[1]] }, { name: z.name, type: 'summit', ele: z.ele, at: z.at.slice() }],
      sections: [{ miles: 1, terrain: 'trail', hazards: {}, note: '', via: [] }] });
    saveDraft(JSON.parse(clean(M))); M._draft = true; emit('go', { route: id });
  };
  const del = $('#eDelRoute'); if (del) del.onclick = () => { if (del.dataset.sure) { M.routes.splice(M.routes.indexOf(R), 1); saveDraft(JSON.parse(clean(M))); M._draft = true; emit('go', { route: M.routes[0].id }); } else { del.dataset.sure = 1; del.textContent = 'Click again to delete'; } };

  $('#eGpx').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { applyTrack(R, parseGPX(await f.text()), f.name); checkHtml = `Imported ${esc(f.name)}. Check that each waypoint landed in the right place, then drag any that did not.`; changed(true, true); emit('frame'); }
    catch (err) { $('#eCheckOut').textContent = 'Import failed: ' + err.message; }
  };

  $$('[data-place]', p).forEach(b => b.onclick = () => { const i = +b.dataset.place; hint(`Click the map where ${R.waypoints[i].name} is.`); onNextClick(at => { moveWaypoint(i, at); hint(''); }); });
  $$('[data-dem]', p).forEach(b => b.onclick = async () => { const w = R.waypoints[+b.dataset.dem]; b.textContent = 'Reading…'; try { w.ele = Math.round(await demFeet(w.at)); changed(true); } catch (e) { b.textContent = 'Terrain unavailable'; } });
  $$('[data-delwp]', p).forEach(b => b.onclick = () => {
    const i = +b.dataset.delwp, a = R.sections[i - 1], z = R.sections[i], hz = { ...a.hazards }; for (const k in z.hazards || {}) hz[k] = Math.max(hz[k] || 0, z.hazards[k]);
    R.sections.splice(i - 1, 2, { miles: +(a.miles + z.miles).toFixed(1), terrain: a.terrain, hazards: hz, note: [a.note, z.note].filter(Boolean).join(' '), via: [...(a.via || []), R.waypoints[i].at, ...(z.via || [])] });
    R.waypoints.splice(i, 1); changed(true, true);
  });
  $('#eAddWp').onclick = () => {
    const n = R.waypoints.length - 1, s = R.sections[n - 1], c = sectionCoords(R, n - 1), mid = Math.floor(c.length / 2), a = R.waypoints[n - 1], z = R.waypoints[n];
    const at = c.length > 2 ? c[mid].slice(0, 2) : [+((a.at[0] + z.at[0]) / 2).toFixed(5), +((a.at[1] + z.at[1]) / 2).toFixed(5)];
    const via = s.via || [], cut = c.length > 2 ? mid - 1 : 0, half = +(s.miles / 2).toFixed(1);
    R.waypoints.splice(n, 0, { name: 'New waypoint', type: 'waypoint', ele: Math.round((a.ele + z.ele) / 2), at });
    R.sections.splice(n - 1, 1, { ...s, miles: half, via: via.slice(0, cut) }, { ...s, hazards: { ...s.hazards }, miles: half, via: via.slice(cut + (c.length > 2 ? 1 : 0)) });
    changed(true, true);
  };
  $('#eCheck').onclick = async () => {
    $('#eCheckOut').textContent = 'Reading terrain…';
    try {
      const rows = await Promise.all(R.waypoints.map(async w => { const d = Math.round(await demFeet(w.at)), diff = d - w.ele; return `<div style="color:${Math.abs(diff) > 300 ? 'var(--h3)' : 'inherit'}">${esc(w.name)}: listed ${fmt(w.ele)} ft, terrain ${fmt(d)} ft (${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))})${Math.abs(diff) > 300 ? ' — probably misplaced' : ''}</div>`; }));
      checkHtml = rows.join('') + '<div>Terrain data is about 30 ft accurate on gentle ground and worse on cliffs and sharp summits.</div>';
    } catch (e) { checkHtml = 'Terrain tiles could not be read.'; }
    $('#eCheckOut').innerHTML = checkHtml;
  };

  $$('[data-draw]', p).forEach(b => b.onclick = () => startDraw(+b.dataset.draw));
  $$('[data-straight]', p).forEach(b => b.onclick = () => { R.sections[+b.dataset.straight].via = []; changed(true); });
  $$('[data-measure]', p).forEach(b => b.onclick = () => { const i = +b.dataset.measure; R.sections[i].miles = Math.max(0.1, +lineMiles(sectionCoords(R, i)).toFixed(1)); changed(true); });

  $$('[data-placepoi]', p).forEach(b => b.onclick = () => { const q = M.pois[+b.dataset.placepoi]; hint(`Click the map where ${q.name} is.`); onNextClick(at => { q.at = at; hint(''); changed(true); }); });
  $$('[data-delpoi]', p).forEach(b => b.onclick = () => { M.pois.splice(+b.dataset.delpoi, 1); changed(true); });
  $('#eAddPoi').onclick = () => { const c = getMap()?.getCenter(); (M.pois ||= []).push({ name: 'New marker', type: 'hazard', at: c ? [+c.lng.toFixed(5), +c.lat.toFixed(5)] : M.summit.slice(), note: '', routes: [R.id] }); changed(true); };

  $('#eDown').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([clean(M)], { type: 'application/json' })); a.download = M.id + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); $('#eMsg').textContent = 'Saved to your downloads.'; };
  $('#eCopy').onclick = () => { const t = $('#eJson'); t.hidden = false; t.value = clean(M); t.select(); try { navigator.clipboard.writeText(t.value).then(() => $('#eMsg').textContent = 'Copied.', () => $('#eMsg').textContent = 'Selected. Press copy.'); } catch (e) { $('#eMsg').textContent = 'Selected. Press copy.'; } };
  const dis = $('#eDiscard'); if (dis) dis.onclick = () => { if (dis.dataset.sure) { discardDraft(M.id); emit('go', { peak: M.id, reload: true }); } else { dis.dataset.sure = 1; dis.textContent = 'Click again to discard'; } };

  $('#eNewPeak').onclick = () => { newPeakOpen = !newPeakOpen; renderEditor(p, true); };
  const go = $('#npGo'); if (go) go.onclick = () => {
    const id = $('#npId').value.trim().toLowerCase(), name = $('#npName').value.trim(), elev = +$('#npElev').value, c = getMap()?.getCenter();
    if (!/^[a-z0-9-]+$/.test(id) || !name || !(elev > 0)) { $('#npMsg').textContent = 'Fill in an id (lowercase letters, digits, dashes), a name and an elevation.'; return; }
    if (cur.index.peaks.some(q => q.id === id)) { $('#npMsg').textContent = 'That id is already used.'; return; }
    const at = c ? [+c.lng.toFixed(5), +c.lat.toFixed(5)] : [-121.5, 47.5];
    const peak = { schema: 2, id, name, short: name.replace(/^Mount |^Mt\.? /, ''), elev, summit: at, range: '', blurb: '', treeline: 5500, snowline: 6500, permit: '', manager: { name: 'Land manager', url: 'https://' }, links: [],
      routes: [{ id: 'standard', name: 'Standard route', grade: 'Grade ?', level: 2, days: [1, 2], season: [5.5, 8.8], prime: [6, 8], kit: [], summary: '', skills: [], line: { quality: 'approximate', asOf: new Date().toISOString().slice(0, 7), source: 'Placed in the editor' },
        waypoints: [{ name: 'Trailhead', type: 'trailhead', ele: Math.max(0, elev - 4000), at: [at[0], +(at[1] - 0.03).toFixed(5)] }, { name: 'Summit', type: 'summit', ele: elev, at }], sections: [{ miles: 3, terrain: 'trail', hazards: {}, note: '', via: [] }] }], pois: [] };
    saveDraft(peak); newPeakOpen = false;
    cur.index.peaks.push({ id, short: peak.short, name, elev, summit: at, draftOnly: true });
    emit('go', { peak: id, reload: true });
  };
}

function moveWaypoint(i, at) {
  const R = cur.route, w = R.waypoints[i]; w.at = at;
  if (w.type === 'summit') cur.peak.summit = at.slice();
  changed(st.tab === 'edit');
}
export function waypointMoved({ i, at }) { moveWaypoint(i, at); }

function hint(text) {
  let el = $('#editHint');
  if (!text) { el && el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'editHint'; el.className = 'hud editbar'; $('#stage').appendChild(el); }
  el.innerHTML = text;
}
function startDraw(i) {
  const R = cur.route, s = R.sections[i]; drawing = { i, pts: [], before: s.via || [] }; s.via = [];
  const arm = () => onNextClick(at => { if (!drawing) return; drawing.pts.push(at); s.via = drawing.pts.slice(); emit('data-changed'); arm(); });
  hint(`Click along the route from <b>${esc(R.waypoints[i].name)}</b> to <b>${esc(R.waypoints[i + 1].name)}</b>. <button class="btn" id="dDone" style="padding:2px 8px;margin-left:8px">Done</button> <button class="btn ghost" id="dCancel" style="padding:2px 8px;color:#1d1503;border-color:#1d1503">Cancel</button>`);
  const finish = keep => { cancelClick(); hint(''); if (!keep) s.via = drawing.before; else if ((R.line?.quality || 'approximate') === 'approximate' && R.sections.every(x => (x.via || []).length)) R.line = { quality: 'traced', asOf: new Date().toISOString().slice(0, 7), source: 'Traced on imagery in the editor' }; drawing = null; changed(true); };
  $('#dDone').onclick = () => finish(true); $('#dCancel').onclick = () => finish(false);
  emit('data-changed'); arm();
}
export function stopEditing() { if (drawing) { cur.route.sections[drawing.i].via = drawing.before; drawing = null; } cancelClick(); hint(''); }
