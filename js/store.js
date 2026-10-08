// Shared state, persistence and a tiny event bus.
export const $ = (s, e = document) => e.querySelector(s);
export const $$ = (s, e = document) => [...e.querySelectorAll(s)];
export const fmt = n => Math.round(n).toLocaleString('en-US');
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const parseDate = s => { const [a, b, c] = s.split('-').map(Number); return new Date(a, b - 1, c, 12); };

const KEY = 'wmh2';
function defDate() {
  // Default trip: two weekends out in summer, otherwise the second Saturday of next July.
  const d = new Date(), m = d.getMonth();
  let t = (m >= 4 && m <= 7) ? new Date(d.getTime() + 14 * 864e5) : new Date(d.getFullYear() + (m > 7 ? 1 : 0), 6, 10);
  while (t.getDay() !== 6) t.setDate(t.getDate() + 1);
  return iso(t);
}
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* storage unavailable */ }

// st: everything the user chooses. Persisted in this browser.
export const st = Object.assign({
  peak: 'rainier', route: null, tab: 'route', date: defDate(), team: 3, pace: 1, walk: 'auto',
  camps: {}, fcMode: 'live', fc: {}, chk: {}, sheet: {}, log: [], layer: 'satellite',
  // Date finder: a range (null = rolling, from today) and the weekdays every trip day must fall on, 0 = Sunday.
  win: { from: null, to: null, dow: [0, 1, 2, 3, 4, 5, 6] }
}, saved);
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } };

// cur: the loaded peak and selected route. live: what the network has returned so far.
export const cur = { index: null, peak: null, route: null };
export const live = { fc: null, fcState: 'idle', fcErr: '', nws: null, alerts: null, avy: null, nps: null, updates: null };
// peakView: the top-down look at every route on a mountain, shown before a route is picked.
export const ui = { hazView: false, hot: -1, editing: false, peakView: false };

const subs = {};
export const on = (evt, fn) => { (subs[evt] ||= []).push(fn); };
export const emit = (evt, data) => { (subs[evt] || []).forEach(fn => fn(data)); };
