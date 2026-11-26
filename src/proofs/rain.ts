import { IS_TOUCH } from '../config';
import { DEFAULT_RAIN, groundY, LevelBuilder, mergeRules, type Level, type RainRules } from '../level';
import type { LevelInfo } from '../levels';
import type { Proof } from './index';

/**
 * ?proof=rain[&play=ren|kohaku] — rain washing vermilion away (docs/summer-design.md section 2), alone on a
 * test scroll with one named station per rule and edge case. A dev-only panel toggles the rain and tunes the
 * wash clock live.
 *
 * URL knobs (all optional): station=<id> starts there; rain=0 starts dry; hold, warn, density set the clock;
 * zones=all rains on the whole scroll; heavy=1 is the perf scene (density 2, rain everywhere); panel=0 hides
 * the panel (for clean captures).
 *
 * Test hooks on window.__rainProof: restart(station), setRain(on, clock), stations. Rules and zones are the
 * game's own (game.rules.rain, game.level.rainZones); per-stroke stage records are on game.rain.log.
 */

export interface Station {
  id: string;
  x: number;
  name: string;
  what: string;
}

export const STATIONS: Station[] = [
  { id: 'dry', x: 150, name: '1 · Dry road', what: 'Vermilion painted outside the rain stays forever, even after you carry on into the storm.' },
  { id: 'edge', x: 1520, name: '2 · Where the rain begins', what: 'The storm wash darkens first; the curtain of streaks starts at the zone edge.' },
  { id: 'under', x: 2150, name: '3 · Under your feet', what: 'A 700 gap. A rain bridge carries you 540: it runs (drips, then fading) for at least a second under you, then goes.' },
  { id: 'others', x: 3080, name: '4 · Other inks', what: 'Indigo, gold and purple never wash. Rain hisses on the blot fire; it never puts it out.' },
  { id: 'short', x: 3720, name: '5 · A short gap', what: 'A 380 gap: one rain bridge clears it if you paint it near the edge.' },
  { id: 'undo', x: 4400, name: '6 · Undo while it runs', what: 'Undo a running bridge (right click, or pause → Undo): the usual half refund.' },
  { id: 'eaves', x: 5340, name: '7 · Under the eaves', what: 'A dry gap between rain zones: bridges here hold.' },
  { id: 'straddle', x: 6030, name: '8 · Straddling the edge', what: 'A stroke that touches rain washes as one piece.' },
];

const ZONES: [number, number][] = [
  [1800, 5300],
  [6350, 7700],
];

interface Settings {
  rain: boolean;
  clock: RainRules;
  allZones: boolean;
}

function buildLevel(s: Settings, station: Station): Level {
  const b = new LevelBuilder('proof-rain', 'Rain proof', '雨', 'spring', 23);
  b.rules({
    runSpeed: 300,
    inkMax: 100,
    inkRegen: 32,
    slowScale: 0.12,
    slowmoDrain: 4,
    inks: ['shu', 'ai', 'kin', 'murasaki'],
    rain: s.rain ? s.clock : false,
  });
  if (!s.allZones) for (const [a, z] of ZONES) b.rain(a, z);

  b.island(0, 1100, 540);
  b.island(1400, 2300, 540);
  b.lantern(1480);
  b.island(3000, 3900, 540);
  b.lantern(3060);
  b.fire(3300, 140, 150);
  b.yokai(3560, 420, 32, 50);
  b.island(4280, 5600, 540);
  b.lantern(4340);
  b.island(6000, 6200, 540);
  b.island(6500, 8400, 540);
  b.lantern(6560);
  b.torii(7900);
  const hintY = [300, 260, 300, 250, 300, 260, 300, 250];
  STATIONS.forEach((st, i) => b.hint(st.x + 220, hintY[i], st.name));
  for (const [k, x, sc] of [['pine', 300, 1.1], ['reeds', 1000, 0.9], ['rock', 1600, 1], ['bamboo', 2200, 1], ['pine', 3800, 0.9], ['maple', 5000, 1], ['reeds', 6100, 0.8], ['pine', 7000, 1.2], ['bamboo', 7600, 0.9]] as const) {
    b.decor(k, x, sc);
  }
  const L = b.finish(8400, 40, 120);
  L.start = { x: station.x, y: groundY(L, station.x) };
  return L;
}

const proof: Proof = ({ game, begin, char, params }) => {
  const num = (k: string, d: number) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isFinite(v) ? v : d;
  };
  const heavy = params.get('heavy') === '1';
  const settings: Settings = {
    rain: params.get('rain') !== '0',
    clock: { hold: num('hold', DEFAULT_RAIN.hold), warn: Math.max(1, num('warn', DEFAULT_RAIN.warn)), density: num('density', heavy ? 2 : 1) },
    allZones: heavy || params.get('zones') === 'all',
  };
  let station = STATIONS.find((s) => s.id === params.get('station')) ?? STATIONS[0];

  const info = (): LevelInfo => ({
    id: 'proof-rain',
    name: 'Rain proof',
    kanji: '雨',
    theme: 'spring',
    blurb: 'Rain washes vermilion away.',
    build: () => buildLevel(settings, station),
  });

  const restart = (id?: string) => {
    station = STATIONS.find((s) => s.id === id) ?? station;
    begin(char, info());
  };
  /** Change the rain live (no restart): strokes already painted keep their in-rain flag. */
  const setRain = (on: boolean, clock?: Partial<RainRules>) => {
    settings.rain = on;
    if (clock) settings.clock = { ...settings.clock, ...clock };
    game.rules.rain = mergeRules(game.rules, { rain: on ? settings.clock : false }).rain;
    if (game.rules.rain) settings.clock = { ...game.rules.rain };
  };
  (window as unknown as { __rainProof: unknown }).__rainProof = { restart, setRain, stations: STATIONS, zones: ZONES, settings };

  restart();
  if (params.get('panel') !== '0') mountPanel(game, settings, setRain, restart, () => station);
};

export default proof;

// ─────────────────────────────────────────────────────────────── dev panel

function mountPanel(
  game: Parameters<Proof>[0]['game'],
  settings: Settings,
  setRain: (on: boolean, clock?: Partial<RainRules>) => void,
  restart: (id?: string) => void,
  current: () => Station,
) {
  const el = document.createElement('div');
  el.id = 'rain-proof-panel';
  el.style.cssText = [
    'position:fixed', 'top:8px', 'left:50%', 'transform:translateX(-50%)', 'z-index:50', 'font:12px/1.35 Georgia,serif',
    'color:#17161b', 'background:rgba(239,230,211,0.94)', 'border:1px solid rgba(23,22,27,0.35)', 'border-radius:6px',
    'padding:6px 10px', 'box-shadow:0 2px 10px rgba(0,0,0,0.15)', 'max-width:min(560px,92vw)', 'user-select:none',
  ].join(';');
  const open = !IS_TOUCH;
  el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
      <b>雨 Rain proof</b>
      <label><input type="checkbox" data-k="rain"> rain</label>
      <select data-k="station" style="font:inherit;max-width:190px"></select>
      <button data-k="go" style="font:inherit">restart</button>
      <button data-k="fold" style="font:inherit">${open ? '▴' : '▾'}</button>
    </div>
    <div data-k="body" style="margin-top:4px;display:${open ? 'block' : 'none'}">
      <div data-k="what" style="font-style:italic;margin-bottom:4px"></div>
      <label style="display:flex;gap:6px;align-items:center">hold <input data-k="hold" type="range" min="0" max="2.5" step="0.05" style="flex:1"><span data-k="holdv"></span></label>
      <label style="display:flex;gap:6px;align-items:center">warn <input data-k="warn" type="range" min="1" max="3" step="0.05" style="flex:1"><span data-k="warnv"></span></label>
      <label style="display:flex;gap:6px;align-items:center">density <input data-k="density" type="range" min="0" max="2" step="0.1" style="flex:1"><span data-k="densityv"></span></label>
      <div data-k="read" style="margin-top:4px;font-family:ui-monospace,monospace;font-size:11px;white-space:pre"></div>
    </div>`;
  document.body.appendChild(el);
  const q = <T extends HTMLElement>(k: string) => el.querySelector<T>(`[data-k="${k}"]`)!;
  const rain = q<HTMLInputElement>('rain');
  const sel = q<HTMLSelectElement>('station');
  for (const s of STATIONS) sel.add(new Option(s.name, s.id, false, s.id === current().id));
  const sync = () => {
    rain.checked = settings.rain;
    for (const k of ['hold', 'warn', 'density'] as const) {
      q<HTMLInputElement>(k).value = String(settings.clock[k] ?? 1);
      q(k + 'v').textContent = `${(settings.clock[k] ?? 1).toFixed(2)}${k === 'density' ? '' : ' s'}`;
    }
    q('what').textContent = current().what;
  };
  sync();
  rain.addEventListener('change', () => {
    setRain(rain.checked);
    sync();
  });
  for (const k of ['hold', 'warn', 'density'] as const) {
    q<HTMLInputElement>(k).addEventListener('input', (e) => {
      setRain(settings.rain, { [k]: Number((e.target as HTMLInputElement).value) });
      sync();
    });
  }
  q('go').addEventListener('click', () => {
    restart(sel.value);
    sync();
    (document.activeElement as HTMLElement | null)?.blur();
  });
  sel.addEventListener('change', () => {
    restart(sel.value);
    sync();
    sel.blur();
  });
  q('fold').addEventListener('click', () => {
    const body = q('body');
    const show = body.style.display === 'none';
    body.style.display = show ? 'block' : 'none';
    q('fold').textContent = show ? '▴' : '▾';
  });
  // a live readout of the newest vermilion stroke's wash clock
  const read = q('read');
  setInterval(() => {
    const shu = [...game.strokes].reverse().find((s) => s.kind === 'shu');
    const inRain = game.rain.travelerInRain ? 'traveler in rain' : 'traveler dry';
    if (!shu) {
      read.textContent = `${inRain} · no vermilion stroke`;
      return;
    }
    const w = game.rain.stageOf(shu);
    const c = game.rules.rain;
    const left = c && w.stage === 'running' ? ` · ${((1 - w.k) * c.warn).toFixed(2)} s left` : c && w.stage === 'wet' ? ` · runs in ${((1 - w.k) * c.hold).toFixed(2)} s` : '';
    read.textContent = `${inRain} · last 朱: ${w.stage}${left} · ink ${game.inkAmt.toFixed(0)}/${game.inkMax.toFixed(0)}`;
  }, 100);
}
