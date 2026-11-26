// Usage: node tools/ramp.mjs [--beats] [--json]   — the Summer difficulty ramp (N14, docs/summer-design.md section 5)
// Builds each Summer scroll from its real builder (src/campaign/summer/*.ts, in Node: no browser) and prints its
// length, obstacles (terrain and strikes), par time, par ink, lantern positions and spacing, ink budget, the peak
// beat's ink and the pressure score P = D x (1 + K) x (1 + G/20) x S x A with every term. The gate is also scored
// with strikes counted one per group. Exits 1 unless 起 < 承 < 結 < 門 on P (転 may sit anywhere; the reason is printed).
// --beats lists each scroll's beats (Course.beat()) with their ink; --json prints the numbers as JSON instead.
import './tests/ts-register.mjs';

const { summerLevels } = await import('../src/campaign/summer/index.ts');

const args = new Set(process.argv.slice(2));
const VIEW_W = 1280; // the 16:9 view, 720 tall
const KOHAKU = 1;
const REN = 1.4;

/** Respawn points in x order: the start, every lantern, the torii. */
function respawns(L) {
  return [L.start.x, ...L.lanterns.map((l) => l.x).sort((a, b) => a - b), L.torii.x];
}

/** Strike groups: strikes whose marks land within 1.2 s of run of each other count once. */
function groups(L) {
  const speed = L.rules.runSpeed;
  const marks = L.strikes.map((s) => s.mark).sort((a, b) => a - b);
  let n = 0;
  let last = -Infinity;
  for (const m of marks) {
    if (m - last > speed * 1.2) n++;
    last = m;
  }
  if (L.raijin) for (const ph of L.raijin.phases) n += new Set(ph.strikes.map((s) => s.group)).size;
  return n;
}

function score(L, beat) {
  const r = L.rules;
  const c = L.course ?? { terrain: 0, strikes: 0, ink: 0, refund: 0, minTele: Infinity, beats: [] };
  const speed = r.runSpeed;
  const pts = respawns(L);
  let stretches = [];
  if (L.raijin && L.raijin.phases.length) {
    // the gate: the approach up to the first seam, then one pass of each phase's loop (4.5)
    const seam = L.raijin.phases[0].x0;
    const before = pts.filter((x) => x <= seam);
    for (let i = 0; i + 1 < before.length; i++) stretches.push((before[i + 1] - before[i]) / speed);
    stretches.push((seam + 1500 - before[before.length - 1]) / speed);
    for (const ph of L.raijin.phases) stretches.push(ph.length / speed);
  } else for (let i = 0; i + 1 < pts.length; i++) stretches.push((pts[i + 1] - pts[i]) / speed);
  stretches = stretches.filter((s) => s > 0);
  const G = Math.max(0, ...stretches);
  const mean = stretches.length ? stretches.reduce((a, b) => a + b, 0) / stretches.length : 0;
  const peak = Math.max(0, ...c.beats.map((b) => b.ink));
  const hazards = c.terrain + c.strikes;
  const D = (hazards / L.parTime) * 10;
  const K = peak / (r.inkMax * KOHAKU);
  const S = (speed / 310) * (r.slowScale / 0.12);
  const ahead = VIEW_W * (0.5 + r.camLead);
  const window = Math.min(ahead / speed, c.minTele);
  const A = 3 / window;
  const P = D * (1 + K) * (1 + G / 20) * S * A;
  const g = groups(L);
  const Dg = ((c.terrain + g) / L.parTime) * 10;
  const Pg = Dg * (1 + K) * (1 + G / 20) * S * A;
  return {
    id: L.id,
    beat,
    name: L.name,
    length: Math.round(L.length),
    terrain: c.terrain,
    strikes: c.strikes,
    groups: g,
    parTime: L.parTime,
    parInk: L.parInk,
    lanterns: L.lanterns.map((l) => Math.round(l.x)),
    spacing: { mean, max: G, all: stretches },
    budget: { kohaku: Math.round(r.inkMax * KOHAKU), ren: Math.round(r.inkMax * REN), regen: r.inkRegen },
    peak,
    terms: { D, K, G, S, A },
    P,
    Pgroups: L.raijin ? Pg : null,
    beats: c.beats,
    rules: { runSpeed: speed, slowScale: r.slowScale, camLead: r.camLead, rain: r.rain, portalSpan: r.portalSpan, inks: r.inks },
  };
}

const rows = summerLevels().map((info) => score(info.build(), info.kanji));
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '∞');

if (args.has('--json')) console.log(JSON.stringify(rows, null, 2));
else {
  console.log('Summer ramp (docs/summer-design.md 5.1: P = D x (1 + K) x (1 + G/20) x S x A)\n');
  for (const s of rows) {
    console.log(`${s.beat} ${s.id}  ${s.name}`);
    console.log(`   length ${s.length} u · obstacles ${s.terrain + s.strikes} (${s.terrain} terrain + ${s.strikes} strikes${s.groups ? `, ${s.groups} strike groups` : ''}) · par ${f(s.parTime, 1)} s · par ink ${s.parInk}`);
    console.log(`   lanterns ${s.lanterns.length ? s.lanterns.join(', ') : 'none'} · respawn spacing mean ${f(s.spacing.mean, 1)} s / max ${f(s.spacing.max, 1)} s`);
    console.log(`   ink budget Kohaku ${s.budget.kohaku} / Ren ${s.budget.ren} (refill ${s.budget.regen}/s) · peak beat ink ${f(s.peak, 0)} · run ${s.rules.runSpeed} · slow ${s.rules.slowScale} · camLead ${s.rules.camLead} · reach ${f(s.rules.portalSpan, 0)} · rain ${s.rules.rain ? `${s.rules.rain.hold}+${s.rules.rain.warn}` : 'no'}`);
    console.log(`   D ${f(s.terms.D)}  K ${f(s.terms.K)}  G ${f(s.terms.G, 1)}  S ${f(s.terms.S)}  A ${f(s.terms.A)}  →  P ${f(s.P, 1)}${s.Pgroups !== null ? `  (one per strike group: ${f(s.Pgroups, 1)})` : ''}`);
    if (args.has('--beats') && s.beats.length) for (const b of s.beats) console.log(`      ${b.label.padEnd(12)} x ${String(Math.round(b.x)).padStart(6)}  ink ${f(b.ink, 1).padStart(6)}  refund ${String(b.refund).padStart(3)}  terrain ${b.terrain}  strikes ${b.strikes}`);
    console.log('');
  }
}

const by = Object.fromEntries(rows.map((s) => [s.beat, s]));
const order = ['起', '承', '結', '門'];
let ok = true;
for (let i = 0; i + 1 < order.length; i++) {
  const a = by[order[i]];
  const b = by[order[i + 1]];
  if (!a || !b) {
    console.log(`FAIL: missing ${!a ? order[i] : order[i + 1]}`);
    ok = false;
    continue;
  }
  const pass = a.P < b.P;
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${order[i]} ${f(a.P, 1)} < ${order[i + 1]} ${f(b.P, 1)}`);
}
const ten = by['転'];
if (ten) {
  const place = ten.P < by['承']?.P ? 'below 承' : ten.P < by['結']?.P ? 'between 承 and 結' : 'above 結';
  console.log(`note 転 ${f(ten.P, 1)} sits ${place}: allowed. The twist is hard in the head, not the hands (it asks you to unlearn "paint a bridge"): generous lanterns, extra refill, a dry breather and no falling hazards, so its score may sit below 承 on purpose (docs/summer-design.md 5.2).`);
}
console.log(ok ? 'RAMP OK: 起 < 承 < 結 < 門' : 'RAMP FAIL: the order 起 < 承 < 結 < 門 does not hold');
process.exit(ok ? 0 : 1);
