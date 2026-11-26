/**
 * ?proof=cutscene[&cs=prologue|summer-ending][&play=ren|kohaku][&auto=1][&panel=0..4][&text=0][&tap=advance][&ui=0]
 *
 * The cutscene player, the prologue (docs/story.md, section 8) and the Summer ending (section 9). Prologue P1
 * "The painter" is at final quality; every other panel is a storyboard with the final text and timing, so both
 * cutscenes play start to finish.
 *
 *   cs=summer-ending  which cutscene (default the prologue)
 *   play=kohaku   the traveler the player chose leads from P4 on (default Ren)
 *   auto=1        start at once (default: a "tap to play" card, so the tap also starts the sound on a phone)
 *   panel=N       start at panel N (0-based), without the opening unroll
 *   text=0        no brush text, to check that the pictures read on their own
 *   tap=advance   a tap or click moves to the next panel instead of ending (Esc and Skip still end)
 *   ui=0          hide the dev panel (captures)
 *
 * The dev panel (top left) jumps to a panel, replays, pauses, toggles the text and switches the lead.
 * window.__csDone lists every onDone call ({ how, T }) and window.__csHandover every onHandover call ({ T }), for
 * tools/proofs/cutscene.mjs.
 */
import { covers, CUTSCENES, playCutscene, type CutsceneHandle } from '../cutscene';
import type { CutsceneId } from '../campaign/data';
import type { CharId } from '../config';
import type { ProofContext } from './index';

interface DoneRecord {
  how: string;
  T: number;
  at: number;
}

export default function cutsceneProof(ctx: ProofContext) {
  const { game, params } = ctx;
  let lead: CharId = ctx.char;
  let textOn = params.get('text') !== '0';
  const tapAdvances = params.get('tap') === 'advance';
  const showUi = params.get('ui') !== '0';
  const csId: CutsceneId = params.get('cs') === 'summer-ending' ? 'summer-ending' : 'prologue';
  const DEF = CUTSCENES[csId]!;
  const w = window as unknown as {
    __csDone: DoneRecord[];
    __csHandover: { T: number; at: number }[];
    __csPlay: (o?: { panel?: number; char?: CharId }) => void;
  };
  w.__csDone = [];
  w.__csHandover = [];

  // Stand-in for the campaign hook-up (phase 3): while the cutscene's paper covers the screen, the game behind it
  // neither updates nor draws (main.ts already does this for the map). Nothing visible changes.
  const upd = game.update.bind(game);
  const ren = game.render.bind(game);
  game.update = (dt: number) => {
    if (!covers()) upd(dt);
  };
  game.render = () => {
    if (!covers()) ren();
  };

  // ── dev panel
  const style = document.createElement('style');
  style.textContent = `
.cs-dev{position:fixed;left:calc(8px + env(safe-area-inset-left));top:calc(8px + env(safe-area-inset-top));z-index:9;display:flex;flex-wrap:wrap;gap:4px;
  max-width:420px;padding:6px;background:rgba(239,230,211,.88);border:1px solid rgba(23,22,27,.25);border-radius:6px;font:12px/1.2 system-ui,sans-serif;color:#17161b}
.cs-dev[hidden]{display:none}
.cs-dev button{font:12px system-ui,sans-serif;padding:4px 7px;border:1px solid rgba(23,22,27,.35);background:#f6efdf;border-radius:4px;cursor:pointer;color:#17161b}
.cs-dev button[aria-pressed=true]{background:#17161b;color:#efe6d3}
.cs-dev .st{flex-basis:100%;font-variant-numeric:tabular-nums;opacity:.75}
.cs-start{position:fixed;inset:0;z-index:7;display:flex;align-items:center;justify-content:center;background:rgba(239,230,211,.6)}
.cs-start button{font:italic 26px "Shippori Mincho",serif;padding:18px 30px;background:#efe6d3;border:2px solid #17161b;border-radius:6px;color:#17161b;cursor:pointer}`;
  document.head.appendChild(style);

  let handle: CutsceneHandle | null = null;
  const play = (panel = 0) => {
    handle?.player?.destroy();
    w.__csHandover = [];
    game.audio.init();
    handle = playCutscene(csId, {
      char: lead,
      audio: game.audio,
      grain: game.grain,
      tapAdvances,
      startPanel: panel,
      onHandover: () => {
        w.__csHandover.push({ T: handle?.player?.T ?? -1, at: performance.now() });
      },
      onDone: (how) => {
        w.__csDone.push({ how, T: handle?.player?.T ?? -1, at: performance.now() });
      },
    });
    if (handle.player) handle.player.textOn = textOn;
    sync();
  };
  w.__csPlay = (o = {}) => {
    if (o.char) lead = o.char;
    play(o.panel ?? 0);
  };

  const dev = document.createElement('div');
  dev.className = 'cs-dev';
  dev.hidden = !showUi;
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.textContent = label;
    // keep focus (and Space) away from the dev panel: Space belongs to the cutscene
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', fn);
    dev.appendChild(b);
    return b;
  };
  btn('Replay', () => play(0));
  DEF.panels.forEach((p, i) => {
    const b = btn(`${csId === 'prologue' ? 'P' : 'E'}${i + 1}${p.quality === 'final' ? '★' : ''}`, () => {
      if (handle?.player && !handle.player.ended) handle.player.seek(handle.player.starts[i] + 0.001);
      else play(i);
    });
    b.title = `${p.title} (${p.quality === 'final' ? 'final quality' : 'storyboard'}, ${p.dur.toFixed(1)} s)`;
  });
  const pauseBtn = btn('Pause', () => {
    const p = handle?.player;
    if (!p) return;
    p.paused = !p.paused;
    sync();
  });
  const textBtn = btn('Text', () => {
    textOn = !textOn;
    if (handle?.player) handle.player.textOn = textOn;
    sync();
  });
  const leadBtn = btn('Lead', () => {
    lead = lead === 'ren' ? 'kohaku' : 'ren';
    play(handle?.player && !handle.player.ended ? handle.player.panelAt(handle.player.T) : 0);
  });
  const st = document.createElement('div');
  st.className = 'st';
  dev.appendChild(st);
  document.body.appendChild(dev);
  const sync = () => {
    pauseBtn.setAttribute('aria-pressed', String(!!handle?.player?.paused));
    textBtn.setAttribute('aria-pressed', String(textOn));
    leadBtn.textContent = `Lead: ${lead === 'ren' ? 'Ren' : 'Kohaku'}`;
  };
  sync();
  const tick = () => {
    const p = handle?.player;
    const d = w.__csDone[w.__csDone.length - 1];
    if (p) {
      const i = p.info();
      st.textContent = `${i.ended ? `ended (${i.ended})` : `${csId === 'prologue' ? 'P' : 'E'}${i.panel + 1} ${i.local.toFixed(2)} s`} · ${i.T.toFixed(2)} / ${i.total.toFixed(1)} s${d ? ` · onDone: ${d.how}` : ''}`;
    } else st.textContent = 'not started';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const startPanel = Math.max(0, Math.min(DEF.panels.length - 1, Number(params.get('panel') ?? 0) || 0));
  if (params.get('auto') === '1') {
    play(startPanel);
  } else {
    const card = document.createElement('div');
    card.className = 'cs-start';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = csId === 'prologue' ? 'Play the prologue' : 'Play the Summer ending';
    b.addEventListener('click', () => {
      card.remove();
      play(startPanel);
    });
    card.appendChild(b);
    document.body.appendChild(card);
  }
}
