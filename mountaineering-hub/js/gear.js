// Gear rules. Each item decides from the trip context whether it belongs on the list.
// Route "kit" flags that drive it: axe, axe1 (early season only), glacier, helmet, helmet0 (optional),
// ice, rock, rock0 (small rack), rap, blue (waste bags required), bear, avy.
import { st, cur } from './store.js';
import { plan, FC, tempAt, chill, monthF, nightLow } from './calc.js';

export function gearContext() {
  const R = cur.route, M = cur.peak, pl = plan(), f = FC(), k = {}; (R.kit || []).forEach(x => k[x] = 1); const m = monthF();
  if (k.axe1 && m < 7) k.axe = 1;
  const hiE = R.waypoints[pl.hi].ele, Ts = tempAt(M.elev), snow = R.sections.some(s => /snow|glacier|ice/.test(s.terrain));
  return {
    R, M, k, team: st.team, nights: pl.nights, days: pl.days.length, m, Ts, Tc: pl.nights ? nightLow(pl.hi) : null, chill: chill(Ts, f.wind), wind: f.wind, snow,
    snowCamp: pl.nights > 0 && hiE > (M.snowline || 7000) - 600, nav: Math.max(0, ...R.sections.map(s => (s.hazards || {}).nav || 0)),
    avy: k.avy || (R.sections.some(s => (s.hazards || {}).avy) && (m < 5.3 || m >= 10.5 || f.snow >= 6))
  };
}
const G = (id, cat, n, oz, when, team) => ({ id, cat, n, oz, when: when || (() => 1), team });
const NAV = 'Navigation and safety', BOOT = 'Boots and traction', ROPE = 'Rope and rescue', CLO = 'Clothing', CAMP = 'Camp', FOOD = 'Food and water';
export const GEAR = [
  G('map', NAV, 'Map, compass and GPS with the route saved offline', 8),
  G('lamp', NAV, 'Headlamp and spare batteries', 4),
  G('sun', NAV, 'Glacier glasses, SPF 50 sunscreen, lip balm', 6),
  G('fa', NAV, 'First-aid kit and blister care', 10, 0, 1),
  G('sat', NAV, 'Satellite communicator or PLB', 4, 0, 1),
  G('bivy', NAV, 'Emergency bivy sack', 6),
  G('gog', NAV, 'Goggles', 5, c => c.snow && (c.wind >= 25 || c.Ts < 22) && 'For wind and cold on top'),
  G('wand', NAV, 'Wands, about 20', 12, c => c.snow && c.nav >= 2 && 'Mark the descent before cloud rolls in', 1),
  G('avy', NAV, 'Avalanche beacon, shovel, probe', 38, c => c.avy && 'Snowpack is not in its summer cycle'),
  G('boots', BOOT, 'Mountaineering boots, crampon-compatible', 72, c => c.k.axe),
  G('shoes', BOOT, c => c.k.rock ? 'Approach shoes you can climb 5.6 in' : 'Sturdy hiking boots', 34, c => !c.k.axe),
  G('cramp', BOOT, 'Crampons, fitted to your boots', 30, c => c.k.axe),
  G('axe', BOOT, 'Ice axe', 16, c => c.k.axe && (c.k.axe1 ? 'Snow lingers high on the route into July' : 1)),
  G('helm', BOOT, 'Climbing helmet', 12, c => c.k.helmet ? 1 : c.k.helmet0 ? 'Optional; useful when snow covers loose rock' : 0),
  G('pole', BOOT, 'Trekking poles', 16),
  G('gait', BOOT, 'Gaiters', 8, c => c.snow),
  G('harn', ROPE, 'Harness', 12, c => c.k.glacier || c.k.rock || c.k.rap),
  G('rope', ROPE, c => c.k.glacier ? `Glacier rope, ${Math.ceil(c.team / 4)} × 40–60 m` : c.k.rock ? '60 m single rope' : '30 m rope for the rappel', 110, c => c.k.glacier || c.k.rock || c.k.rap || c.k.rock0, 1),
  G('resc', ROPE, 'Crevasse rescue kit: 2 prusiks, pulley, progress capture, 3 lockers, 2 slings', 22, c => c.k.glacier),
  G('pick', ROPE, 'Snow picket', 14, c => c.k.glacier && 'One per climber'),
  G('screw', ROPE, c => c.k.ice ? 'Ice screws, 6 for the team' : 'Ice screws, 2 for the team', 20, c => c.k.ice ? 1 : (c.k.glacier && c.m >= 7 && c.m < 10) ? 'Bare glacier ice late in the season' : 0, 1),
  G('tool', ROPE, 'Second ice tool', 18, c => c.k.ice),
  G('rack', ROPE, c => c.k.rock ? 'Light alpine rack: nuts, cams to 2 in, 8 slings' : 'Small rack: a few nuts and slings', 36, c => c.k.rock ? 1 : c.k.rock0 ? 'For the summit block' : 0, 1),
  G('belay', ROPE, 'Belay and rappel device with locker', 4, c => c.k.rock || c.k.rap || c.k.ice),
  G('base', CLO, 'Wicking base layers, top and bottom', 12),
  G('hood', CLO, 'Sun hoody', 7, c => c.m >= 4 && c.m < 9.5),
  G('soft', CLO, 'Softshell pants', 14),
  G('mid', CLO, 'Fleece or light synthetic midlayer', 12),
  G('shell', CLO, 'Hardshell jacket and pants', 24),
  G('puff', CLO, c => c.Ts < 15 || (c.Tc !== null && c.Tc < 18) ? 'Expedition-weight down parka' : 'Insulated belay jacket', 20),
  G('glove', CLO, 'Liner gloves and midweight gloves', 6),
  G('mitt', CLO, 'Expedition mitts', 9, c => c.chill < 8 && `Wind chill near ${Math.round(c.chill)}°F on top`),
  G('hat', CLO, 'Warm hat and neck gaiter', 4),
  G('sock', CLO, c => `Wool socks, ${c.nights + 1} pair${c.nights ? 's' : ''}`, 5),
  G('tent', CAMP, c => `${Math.ceil(c.team / 2)} × ${c.snowCamp ? '4-season' : '3-season'} tent`, 90, c => c.nights > 0, 1),
  G('bag', CAMP, c => `Sleeping bag rated ${c.Tc < 15 ? '0°F' : c.Tc < 28 ? '15–20°F' : '30°F'}`, 40, c => c.nights > 0 && `Estimated low at high camp ${Math.round(c.Tc)}°F`),
  G('pad', CAMP, c => c.snowCamp ? 'Foam pad plus inflatable pad (R 5+)' : 'Sleeping pad', 20, c => c.nights > 0),
  G('stove', CAMP, 'Stove, pot, lighter', 16, c => c.nights > 0, 1),
  G('fuel', CAMP, c => `Canister fuel, about ${Math.ceil(c.team * c.nights * (c.snowCamp ? 5 : 2.5) / 4) * 4} oz`, 16, c => c.nights > 0 && (c.snowCamp ? 'Sized for melting snow' : 1), 1),
  G('shov', CAMP, 'Snow shovel for tent platforms', 20, c => c.snowCamp, 1),
  G('blue', CAMP, 'Blue bags or WAG bags', 2, c => c.k.blue ? 'Required: pack out human waste' : c.snow ? 'Recommended above treeline' : 0),
  G('bear', CAMP, 'Bear canister', 40, c => c.k.bear && c.nights > 0 && 'Check the food-storage rules for your camps', 1),
  G('water', FOOD, c => `${c.snow ? 2 : 3} L of water capacity`, 6),
  G('filt', FOOD, 'Water filter or treatment', 3, c => !c.snowCamp),
  G('food', FOOD, c => `Food for ${c.days} day${c.days > 1 ? 's' : ''}, 3,500–4,500 kcal each`, 0, c => `About ${c.days * 2} lb`),
  G('snack', FOOD, 'Summit-day snacks you can eat with gloves on', 0)
];
export function gearList(c = gearContext()) {
  return GEAR.map(g => { const w = g.when(c); if (!w) return null; return { id: g.id, cat: g.cat, n: typeof g.n === 'function' ? g.n(c) : g.n, note: typeof w === 'string' ? w : '', oz: g.oz, team: g.team }; }).filter(Boolean);
}
