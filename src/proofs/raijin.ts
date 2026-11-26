/**
 * ?proof=raijin: one Raijin strike sent back through a portal (docs/summer-design.md 4.1 to 4.5), looping.
 *
 * A short approach (Raijin paints himself in), then the gate's phase 1 as an arena loop: four single strikes
 * per pass (marks at +900, +2300, +3100, +3900), telegraph 1.6 s, two drums to clean. Catch a bolt in a 紫 ring on
 * its thread and send it out of the partner ring at him: a drum comes clean and the echo refund pays +15. Stand on
 * a mark and the column kills you; you respawn at the phase lantern. Unwon, the loop wraps at its end; won, it
 * re-soaks its two drums at the loop's end and goes round again (endless, for this page only).
 *
 * The rules are the gate's (summer-design 3.5): run 320, inkwell 100, refill 34, slow motion 0.13, Vermilion and
 * Purple, reach 650. A dev-only DOM panel slows time, restarts, flips his facing and shows every telegraph's timing.
 *
 * `arena=1,2` chains phases back to back through Course.arena(), as the gate does (summer-design 3.5): phase 2
 * (four pairs, 1.3 s, a bobbing target, loop 4,900) and phase 3 (four triplets, 1.1 s, a sweeping target, loop
 * 5,200) use the design's numbers, without their gaps and rain (those are other units'). `immortal=1` (or the
 * panel) lets bolts pass through the traveler, so a run can watch every strike of a loop land.
 *
 * URL: ?proof=raijin[&play=ren|kohaku][&panel=0|1][&speed=0.25|0.5|1][&face=left][&endless=0][&arena=1|1,2|3|1,2,3][&immortal=1]
 */
import { IS_TOUCH } from '../config';
import type { Game } from '../game';
import { LevelBuilder, type Level } from '../level';
import { Course, type LevelInfo } from '../levels';
import type { RaijinEvent } from '../mechanics/raijin';
import { mulberry32 } from '../rng';
import type { Proof } from './index';

export const PROOF_LEVEL_ID = 'proof-raijin';

/** The gate's three phases (summer-design 4.4), minus gaps and rain. */
const PHASES: Record<number, (c: Course, n: number) => void> = {
  1: (c, n) => c.arena(n, { length: 4500, pattern: 'single', tele: 1.6, hits: 2, marks: [900, 2300, 3100, 3900] }),
  2: (c, n) => c.arena(n, { length: 4900, pattern: 'pair', within: 0.6, tele: 1.3, hits: 3, sweep: [0.66, 0.74], bob: 70, marks: [900, 2300, 3200, 4100] }),
  3: (c, n) => c.arena(n, { length: 5200, pattern: 'triplet', within: 0.45, tele: 1.1, hits: 3, sweep: [0.55, 0.76], bob: 40, low: true, marks: [900, 2300, 3300, 4300] }),
};

function buildProof(arenas: number[]): Level {
  const b = new LevelBuilder(PROOF_LEVEL_ID, 'Raijin proof', '雷', 'spring', 805);
  b.rules({ runSpeed: 320, inkMax: 100, inkRegen: 34, slowScale: 0.13, slowmoDrain: 4, inks: ['shu', 'murasaki'], portalSpan: 650 });
  const c = new Course(b, 500, mulberry32(805));
  c.hint(420, 240, "Raijin's drums have drunk the blot.", '雷');
  c.hint(950, 250, 'Catch his lightning in a ring. Send it back.');
  c.raijin(260).run(1700);
  for (const n of arenas) PHASES[n](c, n);
  c.run(1800);
  return c.end('spring');
}

export interface StrikeRow {
  id: number;
  group: number;
  tele: number;
  mark: number;
  /** game / real seconds from telegraph to impact (landed strikes) */
  dt: number | null;
  dtReal: number | null;
  outcome: string;
}

export interface ProofState {
  speed: number;
  rows: StrikeRow[];
  deaths: number;
  catches: number;
  /** bolts pass through the traveler (dev) */
  immortal: boolean;
}

const proof: Proof = async ({ game, begin, char, params }) => {
  const arenas = (params.get('arena') ?? '1')
    .split(',')
    .map(Number)
    .filter((n) => PHASES[n]);
  if (!arenas.length) arenas.push(1);
  const info: LevelInfo = { id: PROOF_LEVEL_ID, name: 'Raijin proof', kanji: '雷', theme: 'spring', blurb: 'One strike sent back through a portal.', build: () => buildProof(arenas) };
  const S: ProofState = { speed: 1, rows: [], deaths: 0, catches: 0, immortal: params.get('immortal') === '1' };
  const sp = Number(params.get('speed'));
  if (sp > 0 && sp <= 1) S.speed = sp;
  const face = params.get('face') === 'left' ? -1 : 1;
  // endless (a won last phase re-soaks) is the default for the single-phase page; chained phases run as designed
  const endless = params.get('endless') ? params.get('endless') !== '0' : arenas.length === 1;

  const restart = () => {
    begin(game.charId ?? char, info, 'free');
    game.raijin.endless = endless;
    game.raijin.face = face;
    game.raijin.immortal = S.immortal;
    game.selectInk('murasaki');
    S.rows = [];
    S.deaths = 0;
    S.catches = 0;
    seen = 0;
  };
  let seen = 0;
  begin(char, info, 'free');
  game.raijin.endless = endless;
  game.raijin.face = face;
  game.raijin.immortal = S.immortal;
  game.selectInk('murasaki');

  // slow time (dev only): the whole simulation runs at `speed`
  const upd = game.update.bind(game);
  game.update = (dt: number) => {
    upd(dt * S.speed);
    // fold the event log into the timing table
    for (const e of game.raijin.events) {
      if (e.seq <= seen) continue;
      seen = e.seq;
      fold(S, e);
    }
  };

  const w = window as unknown as { __proof: unknown };
  w.__proof = { S, restart, info, setSpeed: (v: number) => (S.speed = v) };
  buildPanel(game, S, restart, params);
};

function fold(S: ProofState, e: RaijinEvent) {
  const row = (id: number) => S.rows.find((r) => r.id === id && r.outcome === 'telegraph');
  switch (e.kind) {
    case 'tele':
      S.rows.push({ id: e.id as number, group: e.group as number, tele: e.tele as number, mark: e.mark as number, dt: null, dtReal: null, outcome: 'telegraph' });
      if (S.rows.length > 10) S.rows.shift();
      break;
    case 'impact': {
      const r = row(e.id as number);
      if (!r) break;
      r.dt = e.dt as number;
      r.dtReal = e.dtReal as number;
      r.outcome = (e.killed ? 'killed you' : 'landed') + ` @${Math.abs((e.x as number) - (e.mark as number)).toFixed(0)}u`;
      break;
    }
    case 'kill': {
      const r = S.rows.find((q) => q.id === e.id);
      if (r) r.outcome = 'killed you @' + Math.abs((e.px as number) - (e.mark as number)).toFixed(0) + 'u';
      break;
    }
    case 'catch': {
      const r = row(e.id as number);
      S.catches++;
      if (r) r.outcome = `caught at ${(e.at as number).toFixed(2)}s`;
      break;
    }
    case 'blocked': {
      const r = row(e.id as number);
      if (r) r.outcome = 'umbrella';
      break;
    }
    case 'drum': {
      const r = S.rows.find((q) => q.id === e.id);
      if (r) r.outcome += ` → drum ${(e.drum as number) + 1}`;
      break;
    }
    case 'death':
      S.deaths++;
      break;
  }
}

export default proof;

// ───────────────────────────────────────────── the panel (dev only, plain DOM and CSS)

const CSS = `
#rp { position: fixed; right: calc(8px + env(safe-area-inset-right)); top: 74px; display: flex; flex-direction: column; align-items: flex-end; z-index: 50;
  font: 12px/1.35 "Shippori Mincho", Georgia, serif; color: #17161b; max-width: 290px; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
#rp .rp-toggle { font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 14px; border: 1.5px solid #17161b;
  background: rgba(239,230,211,0.92); color: #17161b; cursor: pointer; }
#rp .rp-body { margin-top: 6px; padding: 8px 9px; background: rgba(239,230,211,0.93); border: 1px solid rgba(23,22,27,0.25);
  border-radius: 8px; box-shadow: 0 2px 10px rgba(23,22,27,0.18); max-height: calc(100vh - 110px); overflow-y: auto; }
#rp.collapsed .rp-body { display: none; }
#rp h4 { margin: 7px 0 3px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(23,22,27,0.6); }
#rp h4:first-child { margin-top: 0; }
#rp .row { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; margin-bottom: 3px; }
#rp .row > span { min-width: 58px; color: rgba(23,22,27,0.75); }
#rp button.k { font: inherit; padding: 3px 8px; border-radius: 10px; border: 1px solid rgba(23,22,27,0.3);
  background: rgba(255,255,255,0.45); color: #17161b; cursor: pointer; }
#rp button.k.on { background: #17161b; border-color: #17161b; color: #efe6d3; }
#rp pre { margin: 4px 0 0; font: 11px/1.3 ui-monospace, Menlo, monospace; white-space: pre-wrap; color: #17161b; }
#rp .bar { height: 8px; border: 1px solid rgba(23,22,27,0.4); border-radius: 4px; position: relative; margin: 2px 0 4px; background: rgba(255,255,255,0.4); }
#rp .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #17161b; border-radius: 3px; }
#rp .bar b { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #a51ee6; }
`;

function buildPanel(game: Game, S: ProofState, restart: () => void, params: URLSearchParams) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'rp';
  const open = params.get('panel') ? params.get('panel') === '1' : !IS_TOUCH;
  if (!open) root.classList.add('collapsed');
  root.innerHTML = `<button class="rp-toggle" data-k="toggle">雷 Raijin proof</button><div class="rp-body">
    <h4>Run</h4>
    <div class="row"><span>Time</span>${[0.25, 0.5, 1].map((v) => `<button class="k" data-speed="${v}">${v}x</button>`).join('')}</div>
    <div class="row"><span>Facing</span><button class="k" data-face="1">right (story)</button><button class="k" data-face="-1">left</button></div>
    <div class="row"><span>Loop</span><button class="k" data-endless="1">endless</button><button class="k" data-endless="0">as designed</button></div>
    <div class="row"><span>Traveler</span><button class="k" data-immortal="0">mortal</button><button class="k" data-immortal="1">bolts pass</button></div>
    <div class="row"><button class="k" data-k="restart">Restart</button></div>
    <h4>Telegraph now</h4><div data-k="live"></div>
    <h4>Strikes (telegraph → impact)</h4><pre data-k="rows"></pre>
    <h4>State</h4><pre data-k="state"></pre></div>`;
  document.body.appendChild(root);
  const body = root.querySelector('.rp-body') as HTMLDivElement;

  const refresh = () => {
    body.querySelectorAll<HTMLButtonElement>('button[data-speed]').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === S.speed));
    body.querySelectorAll<HTMLButtonElement>('button[data-face]').forEach((b) => b.classList.toggle('on', Number(b.dataset.face) === game.raijin.face));
    body.querySelectorAll<HTMLButtonElement>('button[data-endless]').forEach((b) => b.classList.toggle('on', (b.dataset.endless === '1') === game.raijin.endless));
    body.querySelectorAll<HTMLButtonElement>('button[data-immortal]').forEach((b) => b.classList.toggle('on', (b.dataset.immortal === '1') === game.raijin.immortal));
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.k === 'toggle') root.classList.toggle('collapsed');
    else if (b.dataset.k === 'restart') restart();
    else if (b.dataset.speed) S.speed = Number(b.dataset.speed);
    else if (b.dataset.face) game.raijin.face = Number(b.dataset.face) === -1 ? -1 : 1;
    else if (b.dataset.endless) game.raijin.endless = b.dataset.endless === '1';
    else if (b.dataset.immortal) game.raijin.immortal = S.immortal = b.dataset.immortal === '1';
    // never keep focus: Space must stay the jump key
    b.blur();
    refresh();
  });
  for (const ev of ['pointerdown', 'touchstart', 'wheel'] as const) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  const live = body.querySelector('[data-k=live]') as HTMLDivElement;
  const rows = body.querySelector('[data-k=rows]') as HTMLPreElement;
  const state = body.querySelector('[data-k=state]') as HTMLPreElement;
  setInterval(() => {
    if (root.classList.contains('collapsed')) return;
    const snap = game.raijin.snapshot();
    const on = snap.strikes.filter((s) => s.state === 'tele' || s.state === 'drop');
    live.innerHTML = on.length
      ? on
          .map(
            (s) =>
              `<div>#${s.id} ${s.el.toFixed(2)} / ${s.tele.toFixed(2)} s${s.state === 'drop' ? ' (falling)' : ''}</div><div class="bar"><i style="width:${Math.min(100, (s.el / s.tele) * 100).toFixed(1)}%"></i><b style="left:${(((s.tele - 0.5) / s.tele) * 100).toFixed(1)}%"></b></div>`,
          )
          .join('')
      : '<div style="opacity:.6">none</div>';
    rows.textContent =
      S.rows
        .slice()
        .reverse()
        .map((r) => `#${String(r.id).padEnd(3)} T ${r.tele.toFixed(2)}  ${r.dt === null ? '  -  ' : r.dt.toFixed(2)} / ${r.dtReal === null ? '  -  ' : r.dtReal.toFixed(2)}s  ${r.outcome}`)
        .join('\n') || 'none yet';
    const P = game.portals.playerRings();
    state.textContent = [
      `phase ${snap.phase >= 0 ? (game.level.raijin?.phases[snap.phase]?.n ?? '-') : '-'}  drums soaked ${snap.soaked}/8  cleared ${snap.cleared.map((c) => (c ? 'yes' : 'no')).join(',')}`,
      `wraps ${snap.wraps}  deaths ${S.deaths}  catches ${S.catches}`,
      `ink ${game.inkAmt.toFixed(0)}/${game.inkMax.toFixed(0)}  rings ${P.map((r) => r.state[0]).join('') || '-'}  x ${game.px.toFixed(0)}`,
      `Raijin at ${(snap.sx * 100).toFixed(0)}% of the width`,
    ].join('\n');
  }, 150);
  refresh();
}
