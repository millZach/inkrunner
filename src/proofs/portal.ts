/**
 * ?proof=portal: the 紫 Purple portal on its own (docs/summer-design.md section 1).
 *
 * A test scroll built with Course / LevelBuilder that offers all four inks, with one named station
 * per case in the 1.6 table and the 1.8 scenarios, and a small dev-only panel to jump between
 * stations, switch the two A/Bs (pairing, aim) and turn the knobs (closing tolerance, span cap,
 * exit-speed floor, launch state, doors closing behind, and the flagged one-way Deviation).
 *
 * URL: ?proof=portal[&play=ren|kohaku][&station=<id>][&pairing=strict][&aim=line][&span=650]
 *      [&floor=0][&launch=0][&doors=0][&oneway=1][&close=44][&angle=300][&closescale=0.6][&panel=0|1]
 */
import { IS_TOUCH } from '../config';
import type { Game } from '../game';
import { groundY, LevelBuilder, type Level } from '../level';
import { Course, type LevelInfo } from '../levels';
import { DEFAULT_TUNING, type PortalEvent, type PortalTuning } from '../mechanics/portals';
import { effectiveCloseAngle } from '../mechanics/ringfit';
import { mulberry32 } from '../rng';
import type { Proof } from './index';

export const PROOF_LEVEL_ID = 'proof-portal';

interface Dropper {
  /** world x of the drop column */
  x: number;
  kind: 'spark' | 'bolt';
  /** seconds between drops, and this dropper's offset in that cycle */
  period: number;
  offset: number;
}

export interface Station {
  id: string;
  name: string;
  /** what to try, shown in the panel */
  note: string;
  /** warp x (the traveler starts here) */
  x: number;
  /** end of the station (droppers only run while the traveler is between x and end) */
  end: number;
  droppers: Dropper[];
  /** knob the station is about (the panel highlights it) */
  about?: string;
}

const GROUND = 520;

/** Build the proof scroll; `stations` is filled in as the cursor moves. */
function buildProof(stations: Station[]): Level {
  stations.length = 0;
  const b = new LevelBuilder(PROOF_LEVEL_ID, 'Portal proof', '紫', 'spring', 909);
  b.rules({ inks: ['shu', 'ai', 'kin', 'murasaki'] });
  const c = new Course(b, GROUND, mulberry32(909));
  let cur: Station | null = null;
  const station = (id: string, name: string, note: string, about?: string) => {
    if (cur) cur.end = c.x;
    cur = { id, name, note, x: c.x + 60, end: c.x, droppers: [], about };
    stations.push(cur);
    c.lantern();
    c.hint(120, 300, name, '紫');
    return cur;
  };
  const drop = (dx: number, kind: Dropper['kind'], period: number, offset = 0) => cur!.droppers.push({ x: c.x + dx, kind, period, offset });

  c.run(260);
  // 1.6: the traveler, moving
  station('moving', 'Moving', 'Running at full speed. Paint a door on the ground ahead of you, and an exit just past the gap once its far side is in view.');
  c.run(760).gap(360).run(700);
  // 1.1: a long flat run for drawing rings on the glass while the traveler runs (and the closing knobs)
  station('runway', 'Rings while running', 'A long flat run. Draw rings in the air ahead while you run: clockwise or not, from the top or the bottom, 315° and up. The readout shows the turning a ring needs at R 55 and R 70.', 'close');
  c.run(2600);
  // 1.6: the traveler, stopped at a wall (and the exit-speed floor A/B: the exit hangs over a gap)
  station('wall', 'Stopped at a pillar', 'Stopped against a blot pillar: a ring around you takes you (full radius). Hang the exit over the gap: with the speed floor off you drop out.', 'floor');
  c.run(560).pillar(140).run(120).gap(420).run(700);
  // 1.6 rotation + the G1 fling: fall into a ring, come out flicked up
  station('fling', 'Fall and fling', 'Run off the ledge into a ring below it; flick the exit 30° up on the far side. Speed and direction rotate; the launch state carries you.', 'launch');
  c.run(520).gap(480).run(1500);
  // 1.6: riding an indigo current into a ring
  station('ride', 'Riding a current', 'Paint an indigo current that runs into a ring before the pillar, and an exit past it. The ride ends in the ring.');
  c.run(700).pillar(140).run(900);
  // 1.6: ground fire, lifted as an ember
  station('fire', 'Ground fire → ember', 'Paint an exit aimed at the thicket, then a ring on the fire. The fire leaves the exit as an ember; aim it nowhere and it re-forms where it lands.');
  c.run(520).pillar(140).run(240).fire(170, 150).run(140).bramble(270).run(700);
  // 1.6: yokai
  station('yokai', 'Yokai', 'The yokai sweeps side to side. Paint a ring where it will swing (not on it: that is blocked) and an exit far away.');
  c.run(520).pillar(140).yokai(330, 120, 30, 12, 170).run(1100);
  // 1.6 + 1.8: hanabi sparks through rings; the pairing A/B (承 S6: two sparks)
  station('spark', 'Sparks (S6)', 'Sparks fall in two columns. Catch the first with a ring under it and a window aimed at the thicket; then catch the second. Pairing decides whether the window survives.', 'pairing');
  c.run(520).pillar(140);
  drop(220, 'spark', 4.4, 0);
  drop(400, 'spark', 4.4, 2.2);
  c.run(640).bramble(270).run(200).bramble(270).run(600);
  // 1.8: the gate's P3 triplet with bolts (fast projectiles), and the aim A/B
  station('bolt', 'Bolts (P3 triplet)', 'Three stray bolts strike in a row. Send them back at the yokai: tail flick or line aim.', 'aim');
  c.run(520).pillar(140);
  drop(200, 'bolt', 5, 0);
  drop(330, 'bolt', 5, 0.7);
  drop(460, 'bolt', 5, 1.4);
  c.yokai(820, 260, 32, 30, 20).yokai(1000, 200, 30, 40, 10).run(1300);
  // 1.3 reach: 結 E1 (two pillars, a 600 door) and a wider pair that is too far at 650
  station('reach', 'Reach (E1)', 'Two pillars 220 apart: a door around you and an exit just past the second pillar spans about 600. Set the span cap to 650 and try an exit further on.', 'span');
  c.run(520).pillar(140).run(220).pillar(140).run(1100);
  // 1.2 placement: blocked, too small, open
  station('blocked', 'Illegal rings', 'Try a ring over the thicket or the yokai (blocked), a tiny ring (too small), and an unclosed hook (open). Each fizzles with half its ink back.');
  c.run(520).pillar(140).run(200).bramble(270).yokai(260, 150, 30, 20).run(900);
  // N18: her rings
  station('hers', 'Her rings', 'Her pre-painted pair (pale wash, purple rim). They never close and do not count toward your two.');
  c.run(520).pillar(140);
  c.herRings({ dx: -230, above: 46 }, { dx: 260, above: 70 }, { r: 58, aimA: 0, aimB: -15 });
  c.run(900);
  // perf: several live rings at once, sparks streaming through, and a traveler loop
  station('perf', 'Busy (perf)', 'Three of her pairs, a looping door and sparks streaming through rings: the perf scene.');
  c.run(200);
  // the looping door: in at the far ring, out of the one behind the station start
  c.herRings({ dx: 1250, above: 46 }, { dx: -400, above: 46 }, { r: 55, aimA: 0, aimB: 0 });
  c.herRings({ dx: 520, above: 250 }, { dx: 900, above: 330 }, { r: 60, aimA: 0, aimB: 160 });
  c.herRings({ dx: 760, above: 160 }, { dx: 340, above: 420 }, { r: 50, aimA: 0, aimB: 20 });
  drop(520, 'spark', 0.9, 0);
  drop(760, 'spark', 1.3, 0.4);
  c.yokai(1050, 230, 30, 30, 40).run(1500);
  if (cur) (cur as Station).end = c.x;
  return c.end('spring');
}

// ───────────────────────────────────────────── state shared with the panel and the assertions

export interface ProofState {
  stations: Station[];
  station: Station | null;
  /** the span cap knob (Infinity = unlimited) */
  span: number;
  /** last traveler pass: speeds and angles, and the fling carry once they land */
  lastPass: PortalEvent | null;
  carry: { from: number; to: number | null; launched: boolean } | null;
  /** pairing A/B readout: catches of falling things this station, and how many the window survived */
  window: { id: number | null; catches: number; kept: number };
  dropsFired: number;
}

const urlTuning = (q: URLSearchParams): Partial<PortalTuning> => {
  const o: Partial<PortalTuning> = {};
  if (q.get('pairing') === 'strict') o.pairing = 'strict';
  if (q.get('aim') === 'line') o.aim = 'line';
  if (q.get('floor') === '0') o.exitFloor = false;
  if (q.get('launch') === '0') o.launch = false;
  if (q.get('doors') === '0') o.doorsClose = false;
  if (q.get('oneway') === '1') o.oneWay = true;
  const close = Number(q.get('close'));
  if (close >= 10 && close <= 80) o.closeDist = close;
  const angle = Number(q.get('angle'));
  if (angle >= 240 && angle <= 360) o.closeAngle = angle;
  const scale = Number(q.get('closescale'));
  if (scale >= 0.2 && scale <= 1.2) o.closeScale = scale;
  return o;
};

const groundAtX = (game: Game, x: number) => Math.min(GROUND + 300, groundY(game.level, x));

const proof: Proof = async ({ game, begin, char, params }) => {
  const stations: Station[] = [];
  const info: LevelInfo = { id: PROOF_LEVEL_ID, name: 'Portal proof', kanji: '紫', theme: 'spring', blurb: 'The Purple portal, on its own.', build: () => buildProof(stations) };
  const S: ProofState = {
    stations,
    station: null,
    span: Infinity,
    lastPass: null,
    carry: null,
    window: { id: null, catches: 0, kept: 0 },
    dropsFired: 0,
  };
  game.portals.tuning = { ...DEFAULT_TUNING, ...urlTuning(params) };
  const spanQ = params.get('span');
  if (spanQ && Number(spanQ) > 0) S.span = Number(spanQ);
  begin(char, info, 'free');
  game.selectInk('murasaki');

  // a snapshot of every hazard, so a station jump puts its scroll back as it was
  const snap = () => ({
    fires: game.level.fires.map((f) => ({ ...f })),
    brambles: game.level.brambles.map((b) => ({ ...b })),
    yokai: game.level.yokai.map((y) => ({ ...y })),
  });
  let initial = snap();
  const applySpan = () => (game.rules = { ...game.rules, portalSpan: S.span });
  applySpan();

  const jump = (id: string) => {
    const st = stations.find((s) => s.id === id);
    if (!st) return;
    if (game.state !== 'play' && game.state !== 'dying') {
      begin(game.charId, info, 'free');
      initial = snap();
      applySpan();
    }
    game.level.fires.forEach((f, i) => Object.assign(f, initial.fires[i]));
    game.level.brambles.forEach((b, i) => Object.assign(b, initial.brambles[i]));
    game.level.yokai.forEach((y, i) => Object.assign(y, initial.yokai[i]));
    for (const l of game.level.lanterns) {
      l.lit = l.x < st.x;
      l.litT = 9;
    }
    game.portals.clearPlayerRings();
    game.warp(st.x);
    game.inkAmt = game.inkMax;
    game.selectInk('murasaki');
    S.station = st;
    S.window = { id: null, catches: 0, kept: 0 };
    S.carry = null;
    S.lastPass = null;
    nextDrop.clear();
  };

  // droppers: festival sparks and stray bolts, on a clock while the traveler is in their station
  const nextDrop = new Map<Dropper, number>();
  let seen = 0;
  const upd = game.update.bind(game);
  game.update = (dt: number) => {
    upd(dt);
    if (game.state !== 'play' || game.introT < 1.5) return;
    const st = stations.find((s) => game.px >= s.x - 80 && game.px < s.end) ?? null;
    if (st !== S.station) {
      S.station = st;
      nextDrop.clear();
    }
    for (const d of st?.droppers ?? []) {
      if (!nextDrop.has(d)) nextDrop.set(d, game.t + 1.6 + d.offset);
      if (game.t >= nextDrop.get(d)!) {
        nextDrop.set(d, nextDrop.get(d)! + d.period);
        const gy = groundAtX(game, d.x);
        if (d.kind === 'spark') game.portals.spawn({ kind: 'spark', x: d.x, y: gy - 760, vx: 0, vy: 400, life: 4 });
        else game.portals.spawn({ kind: 'bolt', x: d.x, y: gy - 900, vx: 0, vy: 2400, life: 1 });
        S.dropsFired++;
      }
    }
    // readouts from the event log
    for (const e of game.portals.events) {
      if (e.seq <= seen) continue;
      seen = e.seq;
      if (e.kind === 'pass' && e.what === 'traveler') {
        S.lastPass = e;
        const at = e.at as { x: number };
        S.carry = { from: at.x, to: null, launched: game.launched };
      }
      if (e.kind === 'pass' && (e.what === 'spark' || e.what === 'bolt' || e.what === 'ember')) {
        S.window.catches++;
        if (S.window.id === null) S.window.id = e.exit as number;
        else if (e.exit === S.window.id) S.window.kept++;
      }
    }
    if (S.carry && S.carry.to === null && game.grounded) S.carry.to = game.px;
  };

  // telegraphs: a dotted drop column, brighter in the second before each drop
  const ren = game.render.bind(game);
  game.render = () => {
    ren();
    if (game.state === 'menu' || !S.station?.droppers.length) return;
    const ctx = game.ctx;
    const Sc = game.S;
    const camX = game.camCX - game.W / (2 * Sc);
    const camY = game.camCY - game.H / (2 * Sc);
    ctx.save();
    ctx.setTransform(Sc, 0, 0, Sc, -camX * Sc, -camY * Sc);
    for (const d of S.station.droppers) {
      const gy = groundAtX(game, d.x);
      const left = (nextDrop.get(d) ?? Infinity) - game.t;
      const hot = left < 1.2 ? 1 - left / 1.2 : 0;
      ctx.strokeStyle = `rgba(23,22,27,${0.18 + 0.5 * hot})`;
      ctx.lineWidth = 2 + 2 * hot;
      ctx.setLineDash([3, 12]);
      ctx.beginPath();
      ctx.moveTo(d.x, gy - 700);
      ctx.lineTo(d.x, gy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(23,22,27,${0.25 + 0.5 * hot})`;
      ctx.beginPath();
      ctx.ellipse(d.x, gy + 2, 26 + 14 * hot, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const w = window as unknown as { __proof: unknown };
  w.__proof = { S, jump, stations, info, applySpan: (v: number) => ((S.span = v), applySpan()) };
  buildPanel(game, S, jump, applySpan, params);
  const start = params.get('station');
  if (start) {
    const wait = () => (game.introT >= 1.5 ? jump(start) : setTimeout(wait, 50));
    wait();
  }
};

export default proof;

// ───────────────────────────────────────────── the panel (dev only, plain DOM and CSS)

const CSS = `
#pp { position: fixed; right: calc(8px + env(safe-area-inset-right)); top: 74px; display: flex; flex-direction: column; align-items: flex-end; z-index: 50; font: 12px/1.35 "Shippori Mincho", Georgia, serif; color: #17161b;
  max-width: 260px; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
#pp .pp-toggle { font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 14px; border: 1.5px solid #56097e;
  background: rgba(239,230,211,0.92); color: #56097e; cursor: pointer; }
#pp .pp-body { margin-top: 6px; padding: 8px 9px; background: rgba(239,230,211,0.93); border: 1px solid rgba(23,22,27,0.25);
  border-radius: 8px; box-shadow: 0 2px 10px rgba(23,22,27,0.18); max-height: calc(100vh - 110px); overflow-y: auto; }
#pp.collapsed .pp-body { display: none; }
#pp h4 { margin: 7px 0 3px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(23,22,27,0.6); }
#pp h4:first-child { margin-top: 0; }
#pp .row { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; margin-bottom: 3px; }
#pp .row > span { min-width: 74px; color: rgba(23,22,27,0.75); }
#pp button.k { font: inherit; padding: 3px 7px; border-radius: 10px; border: 1px solid rgba(23,22,27,0.3);
  background: rgba(255,255,255,0.45); color: #17161b; cursor: pointer; }
#pp button.k.on { background: #a51ee6; border-color: #56097e; color: #fff; }
#pp button.k.about { box-shadow: 0 0 0 2px rgba(229,139,255,0.8); }
#pp button.k.dev { border-style: dashed; }
#pp .note { font-style: italic; color: rgba(23,22,27,0.8); margin: 2px 0 4px; }
#pp pre { margin: 4px 0 0; font: 11px/1.3 ui-monospace, Menlo, monospace; white-space: pre-wrap; color: #17161b; }
#pp input[type=range] { width: 92px; accent-color: #a51ee6; }
`;

function buildPanel(game: Game, S: ProofState, jump: (id: string) => void, applySpan: () => void, params: URLSearchParams) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'pp';
  const open = params.get('panel') ? params.get('panel') === '1' : !IS_TOUCH;
  if (!open) root.classList.add('collapsed');
  root.innerHTML = `<button class="pp-toggle" data-k="toggle">紫 portal proof</button><div class="pp-body"></div>`;
  document.body.appendChild(root);
  const body = root.querySelector('.pp-body') as HTMLDivElement;
  const T = () => game.portals.tuning;

  type Opt = { label: string; on: () => boolean; set: () => void; dev?: boolean };
  const rows: { label: string; opts: Opt[]; about?: string }[] = [
    {
      label: 'Pairing',
      about: 'pairing',
      opts: [
        { label: 'used entry closes', on: () => T().pairing === 'used-entry', set: () => (T().pairing = 'used-entry') },
        { label: 'strict pairs', on: () => T().pairing === 'strict', set: () => (T().pairing = 'strict') },
      ],
    },
    {
      label: 'Aim',
      about: 'aim',
      opts: [
        { label: 'tail flick', on: () => T().aim === 'tail', set: () => (T().aim = 'tail') },
        { label: 'line aim', on: () => T().aim === 'line', set: () => (T().aim = 'line') },
      ],
    },
    {
      label: 'Closing',
      opts: [
        { label: 'strict 28/330', on: () => T().closeDist === 28 && T().closeAngle === 330, set: () => Object.assign(T(), { closeDist: 28, closeAngle: 330 }) },
        { label: 'design 40/300', on: () => T().closeDist === 40 && T().closeAngle === 300, set: () => Object.assign(T(), { closeDist: 40, closeAngle: 300 }) },
        { label: 'generous 44/300', on: () => T().closeDist === 44 && T().closeAngle === 300, set: () => Object.assign(T(), { closeDist: 44, closeAngle: 300 }) },
      ],
    },
    {
      label: 'Start dist',
      about: 'close',
      opts: [0.35, 0.6, 1].map((v) => ({
        label: v === 0.35 ? 'max(d, 0.35R)' : `max(d, ${v}R)`,
        on: () => T().closeScale === v,
        set: () => (T().closeScale = v),
      })),
    },
    {
      label: 'Span cap',
      about: 'span',
      opts: [Infinity, 850, 800, 650].map((v) => ({
        label: v === Infinity ? 'none' : String(v),
        on: () => S.span === v,
        set: () => {
          S.span = v;
          applySpan();
        },
      })),
    },
    {
      label: 'Exit floor',
      about: 'floor',
      opts: [
        { label: 'on', on: () => T().exitFloor, set: () => (T().exitFloor = true) },
        { label: 'off', on: () => !T().exitFloor, set: () => (T().exitFloor = false) },
      ],
    },
    {
      label: 'Launch',
      about: 'launch',
      opts: [
        { label: 'on', on: () => T().launch, set: () => (T().launch = true) },
        { label: 'off', on: () => !T().launch, set: () => (T().launch = false) },
      ],
    },
    {
      label: 'Doors close',
      opts: [
        { label: 'behind you', on: () => T().doorsClose, set: () => (T().doorsClose = true) },
        { label: 'never', on: () => !T().doorsClose, set: () => (T().doorsClose = false) },
      ],
    },
    {
      label: 'One-way',
      opts: [
        { label: 'two-way', on: () => !T().oneWay, set: () => (T().oneWay = false) },
        { label: 'one-way (Deviation)', on: () => T().oneWay, set: () => (T().oneWay = true), dev: true },
      ],
    },
  ];

  const stationHtml = S.stations.map((s) => `<button class="k" data-st="${s.id}">${s.name}</button>`).join('');
  const rowHtml = rows
    .map(
      (r, i) =>
        `<div class="row" data-about="${r.about ?? ''}"><span>${r.label}</span>${r.opts
          .map((o, j) => `<button class="k${o.dev ? ' dev' : ''}" data-r="${i}" data-o="${j}">${o.label}</button>`)
          .join('')}</div>`,
    )
    .join('');
  body.innerHTML = `
    <h4>Stations</h4><div class="row">${stationHtml}</div><div class="note" data-k="note">Pick a station.</div>
    <h4>A/B and knobs</h4>${rowHtml}
    <div class="row"><span>Close dist</span><input type="range" min="20" max="60" step="1" data-k="dist"><b data-k="distv"></b></div>
    <div class="row"><span>Close angle</span><input type="range" min="270" max="345" step="5" data-k="ang"><b data-k="angv"></b></div>
    <div class="note" data-k="eff"></div>
    <h4>Readout</h4><pre data-k="out"></pre>`;

  const dist = body.querySelector('[data-k=dist]') as HTMLInputElement;
  const ang = body.querySelector('[data-k=ang]') as HTMLInputElement;
  dist.addEventListener('input', () => (T().closeDist = Number(dist.value)));
  ang.addEventListener('input', () => (T().closeAngle = Number(ang.value)));

  const refresh = () => {
    body.querySelectorAll<HTMLButtonElement>('button[data-r]').forEach((b) => {
      const o = rows[Number(b.dataset.r)].opts[Number(b.dataset.o)];
      b.classList.toggle('on', o.on());
    });
    const about = S.station?.about ?? '';
    body.querySelectorAll<HTMLDivElement>('.row[data-about]').forEach((r) => r.querySelectorAll('button').forEach((b) => b.classList.toggle('about', !!about && r.dataset.about === about)));
    body.querySelectorAll<HTMLButtonElement>('button[data-st]').forEach((b) => b.classList.toggle('on', b.dataset.st === S.station?.id));
    (body.querySelector('[data-k=note]') as HTMLDivElement).textContent = S.station?.note ?? 'Pick a station.';
    if (document.activeElement !== dist) dist.value = String(T().closeDist);
    if (document.activeElement !== ang) ang.value = String(T().closeAngle);
    (body.querySelector('[data-k=distv]') as HTMLElement).textContent = `${T().closeDist} u`;
    (body.querySelector('[data-k=angv]') as HTMLElement).textContent = `${T().closeAngle}°`;
    const eff = (r: number) => effectiveCloseAngle(T(), r).toFixed(0);
    (body.querySelector('[data-k=eff]') as HTMLElement).textContent = `needs ${eff(45)}° at R 45, ${eff(55)}° at R 55, ${eff(70)}° at R 70`;
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.k === 'toggle') root.classList.toggle('collapsed');
    else if (b.dataset.st) {
      // out of the way once you go to play: the panel would cover the traveler or the far exits
      jump(b.dataset.st);
      root.classList.add('collapsed');
    }
    else if (b.dataset.r) rows[Number(b.dataset.r)].opts[Number(b.dataset.o)].set();
    // never keep focus: Space must stay the jump key
    b.blur();
    refresh();
  });
  // keep the panel's own touches away from the canvas
  for (const ev of ['pointerdown', 'touchstart', 'wheel'] as const) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  const deg = (v: { x: number; y: number }) => ((Math.atan2(v.y, v.x) * 180) / Math.PI).toFixed(0);
  const fmt = () => {
    const P = game.portals;
    const lines: string[] = [];
    const rings = P.rings.filter((r) => r.state !== 'closing');
    lines.push(`ink ${game.inkAmt.toFixed(1)}/${game.inkMax.toFixed(0)}  span ${S.span === Infinity ? '∞' : S.span}`);
    lines.push(`rings: ${rings.map((r) => `${r.fixed ? 'her' : '#' + r.id} ${r.state[0]} R${r.r.toFixed(0)}`).join(', ') || 'none'}`);
    const p = S.lastPass;
    if (p) {
      const vin = p.vin as { x: number; y: number };
      const vout = p.vout as { x: number; y: number };
      lines.push(`pass ${p.stopped ? '(stopped) ' : ''}in ${(p.speedIn as number).toFixed(0)} @${deg(vin)}°`);
      lines.push(`     out ${(p.speedOut as number).toFixed(0)} @${deg(vout)}°`);
    }
    if (S.carry) lines.push(`carry ${S.carry.to === null ? '…' : (S.carry.to - S.carry.from).toFixed(0) + ' u'} (launch ${S.carry.launched ? 'on' : 'off'})`);
    if (S.window.catches) lines.push(`window kept ${S.window.kept} of ${S.window.catches - 1} later catches`);
    const last = [...P.events].reverse().find((e) => e.kind === 'fizzle' || e.kind === 'soak' || e.kind === 'echo');
    if (last) lines.push(`${last.kind} ${last.label ?? last.what ?? last.ink ?? ''} ${last.refund !== undefined ? '+' + (last.refund as number).toFixed(1) + ' ink' : ''}`);
    return lines.join('\n');
  };
  const out = body.querySelector('[data-k=out]') as HTMLPreElement;
  setInterval(() => {
    if (!root.classList.contains('collapsed')) {
      out.textContent = fmt();
      refresh();
    }
  }, 200);
  refresh();
}
