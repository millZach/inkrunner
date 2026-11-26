import { INK_ORDER, INKS, PAPER, type InkKind } from './config';
import { CHAR_NAMES, DEBUG_RUN, Game, GRADE_NAMES, IS_TOUCH, loadBest, type FinishStats } from './game';
import { postRun } from './ghosts';
import { levelList, type LevelInfo } from './levels';
import { CAMPAIGN, chapterState, cutsceneReplayable, dueCutscenes, frontier, isCampaignScroll, nextScroll, type CutsceneId } from './campaign/data';
import { CampaignMap, type OpenOptions } from './campaign/map';
import { findLevel } from './campaign/registry';
import { isCleared, isSeen, markSeen, saveBestStrokes } from './campaign/save';
import { covers as storyCovers, playCutscene, type CutsceneHandle } from './cutscene';
import { lookPastChapter } from './cutscene/handover';
import { MapMarkers } from './cutscene/markers';
import { mulberry32 } from './rng';
import { deliver, IS_NATIVE, onAppActiveChange } from './platform';
import { brushLine } from './render/brush';
import { Character, type CharId, type Pose } from './render/characters';
import { exportScroll, renderCard } from './share';
import { INK_KEYS_SETTING, inkKey, inkKeys, keyLabel, resetInkKeys, setInkKey } from './keys';
import { initializeSettings, saveSetting } from './storage';

/** after the Summer ending: the paper's 0.7 s wash onto the rolled-up Autumn, then about a second's look at it */
const MAP_HOLD_PAST_CHAPTER = 1.8;

async function loadFonts() {
  const want = ['120px "Yuji Syuku"', 'italic 25px "Shippori Mincho"', '25px "Shippori Mincho"', '600 25px "Shippori Mincho"'];
  const timeout = new Promise((r) => setTimeout(r, 2500));
  await Promise.race([Promise.all(want.map((f) => document.fonts.load(f, '墨朱藍金紫蓮琥珀松竹梅一雪波今春夏秋冬起承転結門絵巻染雷送 A'))), timeout]);
}

async function boot() {
  await initializeSettings();
  document.body.classList.toggle('touch', IS_TOUCH);
  await loadFonts();
  const levels = levelList();
  let selected: LevelInfo = levels.find((l) => l.id === localStorage.getItem('inkrunner:level')) ?? levels[0];

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas, selected);
  (window as unknown as { __game: Game }).__game = game;

  const $ = (id: string) => document.getElementById(id)!;
  const menu = $('menu');
  const finish = $('finish');
  const mapEl = $('map');
  const jump = $('jump');
  const mute = $('mute');
  const rec = $('rec');
  const pause = $('pause');
  const pauseButton = $('pause-button');
  let last = performance.now();
  let clipInterrupted = false;
  let lastStats: FinishStats | null = null;
  /** what the current (or last) run was started from */
  let mode: 'free' | 'campaign' = 'free';
  /** one-shot: the next return to the menu goes to the title even from a campaign run */
  let forceTitle = false;
  let mapOpts: OpenOptions = {};
  /** a campaign scroll with a new best whose stretch the map should paint in on the next visit */
  let pendingPaint: string | null = null;
  let mapShownAt = 0;
  /**
   * Seconds the map stays still once a cutscene's paper is gone (counted from the moment it stops covering): after
   * the Summer ending the map holds on Autumn still rolled up before any paint-in pans back (docs/story.md, E4).
   */
  let mapHold = 0;
  const savedChar = localStorage.getItem('inkrunner:char');
  let traveler: CharId = savedChar === 'kohaku' ? 'kohaku' : 'ren';

  // ── scroll picker
  const scrolls = $('scrolls');
  const renderScrolls = () => {
    scrolls.innerHTML = '';
    for (const l of levels) {
      const b = document.createElement('button');
      b.className = 'scroll' + (l.id === selected.id ? ' selected' : '');
      const best = loadBest(l.id);
      b.innerHTML = `<span class="k">${l.kanji}</span><span class="n">${l.name}</span><span class="b">${
        best ? `<i class="mini">${best.grade}</i> ${best.time.toFixed(1)}s` : l.blurb
      }</span>`;
      b.addEventListener('click', () => {
        selected = l;
        saveSetting('inkrunner:level', l.id);
        game.preview(l);
        renderScrolls();
      });
      scrolls.appendChild(b);
    }
  };
  renderScrolls();

  // ── title tabs: the campaign and free play
  type Tab = 'campaign' | 'free';
  let tab: Tab = localStorage.getItem('inkrunner:tab') === 'free' ? 'free' : 'campaign';
  const tabs: Record<Tab, HTMLButtonElement> = { campaign: $('tab-campaign') as HTMLButtonElement, free: $('tab-free') as HTMLButtonElement };
  const panels: Record<Tab, HTMLElement> = { campaign: $('panel-campaign'), free: $('panel-free') };
  const setTab = (t: Tab, focus = false) => {
    tab = t;
    for (const k of ['campaign', 'free'] as Tab[]) {
      tabs[k].setAttribute('aria-selected', String(k === t));
      tabs[k].tabIndex = k === t ? 0 : -1;
      panels[k].hidden = k !== t;
    }
    $('choose').textContent = t === 'campaign' ? 'Choose your traveler to unroll the map' : 'Choose your traveler';
    saveSetting('inkrunner:tab', t);
    if (focus) tabs[t].focus();
  };
  for (const k of ['campaign', 'free'] as Tab[]) tabs[k].addEventListener('click', () => setTab(k));
  $('tabs').addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      setTab(tab === 'campaign' ? 'free' : 'campaign', true);
    }
  });
  const renderJourney = () => {
    const journey = $('journey');
    journey.innerHTML = '';
    for (const ch of CAMPAIGN.chapters) {
      const st = chapterState(ch, isCleared);
      const d = document.createElement('div');
      d.className = `chap ${st}`;
      d.innerHTML = `<span class="k">${ch.kanji}</span><span class="n">${ch.name}</span>`;
      d.title = `${ch.name}: ${ch.subtitle}${st === 'sealed' ? ' (still rolled up)' : ''}`;
      journey.appendChild(d);
    }
    const next = frontier(isCleared);
    $('journey-next').textContent = next ? `Next: ${next.beat} ${next.name}` : 'Every open scroll is stamped. More of the scroll is still rolled up.';
  };
  renderJourney();
  setTab(tab);

  // Hidden screens are made inert: a focused card button would otherwise be
  // "clicked" by the Space bar mid-run and restart the scroll.
  const show = (el: HTMLElement, on: boolean) => {
    el.classList.toggle('hidden', !on);
    el.inert = !on;
    if (!on && el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  };
  show(finish, false);
  show(pause, false);
  show(mapEl, false);
  const map = new CampaignMap(mapEl, game.grain);
  map.audio = game.audio;
  (window as unknown as { __map: CampaignMap }).__map = map;

  // ── the story: the campaign's cutscenes, between the title, the runs and the map (never in free play)
  let story: CutsceneHandle | null = null;
  /**
   * Play cutscenes in order; the last one hands over into the map, which `handover` opens underneath it a moment
   * before it ends (or at once on a skip). Ending or skipping marks each one seen.
   */
  const playStory = (ids: CutsceneId[], handover: () => void) => {
    const [id, ...rest] = ids;
    if (!id) return handover();
    game.audio.init();
    story = playCutscene(id, {
      char: traveler,
      audio: game.audio,
      grain: game.grain,
      onHandover: () => {
        if (!rest.length) handover();
      },
      onDone: () => {
        markSeen(id);
        story = null;
        if (rest.length) playStory(rest, handover);
        else if (map.isOpen) markers.refresh();
      },
    });
  };
  /** the hanging-scroll markers on the map replay their cutscenes */
  const markers = new MapMarkers(
    mapEl,
    map,
    (id) => {
      if (!story) playStory([id], () => {});
    },
    (id) => cutsceneReplayable(id, isCleared, isSeen),
  );
  const resume = () => {
    last = performance.now();
    game.setPaused(false);
    show(pause, false);
    if (IS_TOUCH) jump.classList.remove('hidden');
    pauseButton.focus();
  };
  const pauseGame = () => {
    if (game.state !== 'play' && game.state !== 'dying') return;
    game.setPaused(true);
    jump.classList.remove('down');
    jump.classList.add('hidden');
    $('btn-undo').toggleAttribute('disabled', !game.strokes.length);
    $('btn-lantern').toggleAttribute('disabled', game.state !== 'play');
    $('btn-ghosts').textContent = `Ghost ink: ${game.showGhosts ? 'on' : 'off'}`;
    $('btn-ghosts').setAttribute('aria-pressed', String(game.showGhosts));
    show(pause, true);
    $('btn-resume').focus();
  };
  pauseButton.addEventListener('click', pauseGame);
  $('btn-resume').addEventListener('click', resume);
  $('btn-undo').addEventListener('click', () => { game.undo(); resume(); });
  $('btn-lantern').addEventListener('click', () => { game.returnToLantern(); resume(); });
  $('btn-ghosts').addEventListener('click', () => {
    game.toggleGhosts();
    $('btn-ghosts').textContent = `Ghost ink: ${game.showGhosts ? 'on' : 'off'}`;
    $('btn-ghosts').setAttribute('aria-pressed', String(game.showGhosts));
  });
  $('btn-pause-menu').addEventListener('click', () => game.toMenu());
  // Ink keys (the title's controls line, desktop): choose an ink, then press its new key. Numbers are the default.
  const keysSheet = $('keys');
  let listening: InkKind | null = null;
  const KEYS_PROMPT = 'Choose an ink, then press its new key.';
  const keyNote = (text: string) => ($('key-note').textContent = text);
  const renderKeys = () => {
    $('ink-keys-label').textContent = INK_ORDER.map((k) => keyLabel(inkKey(k))).join(' ');
    $('key-rows').replaceChildren(
      ...INK_ORDER.map((ink) => {
        const row = document.createElement('button');
        row.className = listening === ink ? 'key-row listening' : 'key-row';
        row.dataset.ink = ink;
        const stone = document.createElement('span');
        stone.className = 'stone';
        stone.style.background = INKS[ink].color;
        stone.textContent = INKS[ink].kanji;
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = INKS[ink].name;
        const kbd = document.createElement('kbd');
        kbd.textContent = listening === ink ? '…' : keyLabel(inkKey(ink));
        row.append(stone, name, kbd);
        row.addEventListener('click', () => {
          listening = ink;
          keyNote(`Press a key for ${INKS[ink].name} (Escape keeps ${keyLabel(inkKey(ink))}).`);
          renderKeys();
          keysSheet.querySelector<HTMLElement>(`[data-ink="${ink}"]`)?.focus();
        });
        return row;
      }),
    );
  };
  const saveKeys = () => saveSetting(INK_KEYS_SETTING, JSON.stringify(inkKeys()));
  const closeKeys = () => {
    listening = null;
    show(keysSheet, false);
    $('btn-keys').focus();
  };
  show(keysSheet, false);
  renderKeys();
  $('btn-keys').addEventListener('click', () => {
    listening = null;
    keyNote(KEYS_PROMPT);
    renderKeys();
    show(keysSheet, true);
    keysSheet.querySelector<HTMLElement>('.key-row')?.focus();
  });
  $('btn-keys-done').addEventListener('click', closeKeys);
  $('btn-keys-reset').addEventListener('click', () => {
    resetInkKeys();
    saveKeys();
    listening = null;
    keyNote('Back to 1 2 3 4.');
    renderKeys();
  });
  // capture phase: while the sheet listens, the key goes to it and nothing else (not the game, not the tabs)
  window.addEventListener(
    'keydown',
    (e) => {
      if (keysSheet.classList.contains('hidden')) return;
      if (!listening) {
        if (e.code === 'Escape') {
          e.preventDefault();
          closeKeys();
        }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      const ink = listening;
      listening = null;
      if (e.code === 'Escape') keyNote(KEYS_PROMPT);
      else {
        const why = setInkKey(ink, e.code);
        if (why) keyNote(`${why}. Choose an ink and try another key.`);
        else {
          saveKeys();
          keyNote(`${INKS[ink].name} is now ${keyLabel(e.code)}.`);
        }
      }
      renderKeys();
      keysSheet.querySelector<HTMLElement>(`[data-ink="${ink}"]`)?.focus();
    },
    true,
  );
  window.addEventListener('keydown', (e) => {
    if (game.paused && e.code === 'Escape') { e.preventDefault(); resume(); }
    if (game.paused && e.code === 'Tab') {
      const buttons = [...pause.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
  await onAppActiveChange((active) => {
    last = performance.now();
    if (!active) {
      if (game.recorder.replaying) {
        clipInterrupted = true;
        game.recorder.stopReplay();
      }
      pauseGame();
      void game.audio.ctx?.suspend();
    } else if (!game.paused) {
      void game.audio.ctx?.resume();
    }
  });
  const closeMap = () => {
    map.close();
    show(mapEl, false);
  };
  const showMenu = () => {
    closeMap();
    show(pause, false);
    pauseButton.classList.add('hidden');
    show(finish, false);
    jump.classList.add('hidden');
    show(menu, true);
    renderScrolls();
    renderJourney();
  };
  const syncTravelers = () => {
    mapEl.querySelectorAll<HTMLButtonElement>('.map-travelers button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.char === traveler)));
  };
  const openMap = (opts: OpenOptions = {}) => {
    show(pause, false);
    pauseButton.classList.add('hidden');
    show(finish, false);
    jump.classList.add('hidden');
    show(menu, false);
    syncTravelers();
    if (mapEl.classList.contains('hidden')) mapShownAt = performance.now();
    show(mapEl, true);
    if (pendingPaint) {
      opts = { ...opts, paint: pendingPaint };
      pendingPaint = null;
    }
    mapHold = 0;
    map.open(traveler, opts);
    markers.refresh();
  };
  /**
   * Open the map, first playing whatever cutscene the campaign owes: the prologue the first time The Unfinished
   * Scroll is opened, the Summer ending after the first clear of summer-gate (before the map paints it in).
   */
  const enterMap = (opts: OpenOptions = {}) => {
    const due = dueCutscenes(isCleared, isSeen);
    const last = due[due.length - 1];
    if (last && !story)
      playStory(
        due.map((slot) => slot.id),
        () => {
          openMap(opts);
          // the Summer ending's last shot looks on past the chapter, to Autumn still rolled up
          if (last.mapView === 'next-chapter' && lookPastChapter(map, last)) mapHold = MAP_HOLD_PAST_CHAPTER;
        },
      );
    else openMap(opts);
  };
  const begin = (c: CharId, info: LevelInfo = selected, m: 'free' | 'campaign' = 'free') => {
    mode = m;
    mapOpts = m === 'campaign' ? { focus: info.id } : {};
    closeMap();
    show(pause, false);
    show(menu, false);
    show(finish, false);
    if (IS_TOUCH) {
      jump.classList.remove('hidden');
      pauseButton.classList.remove('hidden');
      if (!IS_NATIVE) void document.documentElement.requestFullscreen?.().catch(() => {});
    }
    $('btn-pause-menu').textContent = m === 'campaign' ? 'Back to the map' : 'Choose scroll';
    $('btn-continue').hidden = m !== 'campaign';
    game.start(c, info);
    traveler = c;
    saveSetting('inkrunner:char', c);
  };

  menu.querySelectorAll<HTMLButtonElement>('.card').forEach((card) => {
    card.addEventListener('click', () => {
      const c = card.dataset.char as CharId;
      if (tab === 'campaign') {
        traveler = c;
        saveSetting('inkrunner:char', c);
        enterMap();
      } else begin(c);
    });
  });
  map.onPlay = (id) => {
    const info = findLevel(id, levels);
    if (info && info.id === id) begin(traveler, info, 'campaign');
  };
  map.onBack = showMenu;
  $('map-back').addEventListener('click', showMenu);
  mapEl.querySelectorAll<HTMLButtonElement>('.map-travelers button').forEach((b) => {
    b.addEventListener('click', () => {
      traveler = b.dataset.char as CharId;
      saveSetting('inkrunner:char', traveler);
      map.setChar(traveler);
      syncTravelers();
    });
  });
  // Campaign runs return to the map (pause menu, Esc, Continue); free play to the title.
  game.onMenu = () => {
    const toMap = mode === 'campaign' && !forceTitle;
    forceTitle = false;
    if (toMap) {
      enterMap(mapOpts);
      mapOpts = {};
    } else showMenu();
  };
  game.onFinish = (s) => {
    lastStats = s;
    jump.classList.add('hidden');
    pauseButton.classList.add('hidden');
    $('stamp').textContent = s.grade;
    $('rank').textContent = `${GRADE_NAMES[s.grade]} rank${s.newBest ? ' · New best!' : s.best ? ` · best ${s.best.time.toFixed(1)}s` : ''}`;
    $('stats').textContent = `${CHAR_NAMES[game.charId]} crossed ${game.info.name} in ${s.time.toFixed(1)}s · ${s.strokes} stroke${s.strokes === 1 ? '' : 's'} · ${Math.round(
      s.ink,
    )} ink · ${s.falls} fall${s.falls === 1 ? '' : 's'}`;
    show(finish, true);
    const strokes = game.serializeStrokes();
    const id = game.level.id;
    if (mode === 'campaign' || isCampaignScroll(id)) {
      // the map keeps the best run's strokes; "cleared" and the grade come from inkrunner:best
      if (s.newBest && !DEBUG_RUN && isCampaignScroll(id)) {
        saveBestStrokes(id, { char: game.charId, time: s.time, len: game.level.length, strokes });
        // the map paints the new best's stretch in on the next visit (a run with no strokes has nothing to paint)
        if (strokes.length) pendingPaint = id;
      }
      const next = nextScroll(id);
      mapOpts = { focus: id, reveal: !s.best && next ? next.id : undefined };
    }
    if (!DEBUG_RUN) void postRun(game.level.id, {
      char: game.charId,
      time: Math.round(s.time * 100) / 100,
      grade: s.grade,
      strokes,
      path: game.path,
      ink: Math.round(s.ink),
      falls: s.falls,
    });
  };

  $('btn-again').addEventListener('click', () => begin(game.charId, game.info, mode));
  $('btn-menu').addEventListener('click', () => {
    forceTitle = true;
    game.toMenu();
  });
  $('btn-continue').addEventListener('click', () => game.toMenu());
  let exportBusy = false;
  let statusTimer: ReturnType<typeof setTimeout>;
  const exportStatus = (message: string) => {
    clearTimeout(statusTimer);
    $('export-status').textContent = message;
    $('export-status').classList.remove('hidden');
    statusTimer = setTimeout(() => $('export-status').classList.add('hidden'), 6000);
  };
  const exportFile = async (action: () => Promise<void>) => {
    if (exportBusy) return;
    exportBusy = true;
    finish.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = true);
    try { await action(); }
    catch (error) {
      console.error('Export failed', error);
      exportStatus('This export could not be saved. Please try again.');
    } finally {
      exportBusy = false;
      finish.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false);
    }
  };
  $('btn-scroll').addEventListener('click', () => void exportFile(async () => {
    if (!lastStats) return;
    const blob = await exportScroll(game, lastStats);
    if (blob) await deliver(blob, `inkrunner-${game.level.id}-scroll.png`, 'My INKRUNNER scroll');
    else exportStatus('The scroll could not be rendered. Please try again.');
  }));
  $('btn-card').addEventListener('click', () => void exportFile(async () => {
    if (!lastStats) return;
    const blob = await renderCard(game, lastStats);
    if (blob) await deliver(blob, `inkrunner-${game.level.id}.png`, 'INKRUNNER');
    else exportStatus('The card could not be rendered. Please try again.');
  }));
  $('btn-clip').addEventListener('click', () => void exportFile(async () => {
    if (game.recorder.replaying) return;
    show(finish, false);
    rec.classList.remove('hidden');
    clipInterrupted = false;
    try {
      const out = await game.recorder.recordClip();
      if (clipInterrupted) exportStatus('Clip stopped while the app was in the background. Please try again.');
      else if (out) await deliver(out.blob, `inkrunner-${game.level.id}.${out.ext}`, 'INKRUNNER');
      else exportStatus('Highlight clips are unavailable on this device. You can still share a card or the full scroll.');
    } finally {
      rec.classList.add('hidden');
      show(finish, true);
    }
  }));

  // ── touch jump button (multi-touch friendly)
  jump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jump.classList.add('down');
    jump.setPointerCapture(e.pointerId);
    game.jumpPress();
  });
  const release = () => {
    jump.classList.remove('down');
    game.jumpRelease();
  };
  jump.addEventListener('pointerup', release);
  jump.addEventListener('pointercancel', release);
  jump.addEventListener('pointerleave', release);

  // ── sound toggle
  const syncMute = () => {
    mute.textContent = game.audio.muted ? '♪̸' : '♪';
    mute.classList.toggle('off', game.audio.muted);
  };
  mute.addEventListener('click', () => {
    game.audio.init();
    game.audio.muted = !game.audio.muted;
    syncMute();
  });
  window.addEventListener('keydown', (e) => e.code === 'KeyM' && setTimeout(syncMute));
  syncMute();

  // ── animated traveler previews on the menu cards
  const previews = [...menu.querySelectorAll<HTMLButtonElement>('.card')].map((card) => {
    const cv = card.querySelector('canvas')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = 280 * dpr;
    cv.height = 190 * dpr;
    return { ctx: cv.getContext('2d')!, ch: new Character(card.dataset.char as CharId), dpr, hover: false, card };
  });
  previews.forEach((p) => {
    p.card.addEventListener('mouseenter', () => (p.hover = true));
    p.card.addEventListener('mouseleave', () => (p.hover = false));
  });

  let pt = 0;
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    // once the opaque map has faded in, the game behind it needn't be drawn; nor while a cutscene's paper covers it
    const covered = storyCovers();
    const mapCovers = map.isOpen && now - mapShownAt > 900;
    if (!mapCovers && !covered) {
      game.update(dt);
      game.render();
    }
    if (map.isOpen) {
      // a map opened under a cutscene (its hand-over) bakes, frozen, until the paper washes away onto it
      if (covered) {
        if (now - mapShownAt < 2500) map.frame(0);
      } else if (mapHold > 0) {
        // the paper washes off onto the frozen view, which then holds a moment before the map comes alive
        mapHold = Math.max(0, mapHold - dt);
        map.frame(0);
      } else map.frame(dt);
      markers.place();
    }

    if (game.state === 'menu' && !menu.classList.contains('hidden') && !covered) {
      pt += dt;
      const ink = INKS[INK_ORDER[Math.floor(pt / 2.2) % INK_ORDER.length]];
      for (const p of previews) {
        const { ctx, dpr } = p;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, 280, 190);
        brushLine(ctx, [{ x: 20, y: 150 }, { x: 140, y: 152 }, { x: 260, y: 149 }], mulberry32(3), {
          w: 5,
          bristles: 5,
          dry: 0.6,
        });
        ctx.save();
        ctx.translate(140, 150);
        ctx.scale(1.75, 1.75);
        const pose: Pose = {
          x: 0,
          y: 0,
          phase: pt * (p.hover ? 34 : 22),
          state: 'run',
          vy: 0,
          accent: ink.color,
          accentLight: ink.light,
          aim: null,
          t: pt,
        };
        p.ch.update(pose, dt);
        p.ch.draw(ctx, pose);
        ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // debug: ?play=ren|kohaku[&level=id] skips the menu; any scroll id works, campaign ones included
  const q = new URLSearchParams(location.search);
  const lv = q.get('level');
  let debugInfo = selected;
  let debugMode: 'free' | 'campaign' = 'free';
  if (lv) {
    const l = findLevel(lv, levels);
    if (l) {
      debugInfo = l;
      if (levels.includes(l)) selected = l;
      else debugMode = 'campaign';
      game.preview(l);
    }
  }
  const auto = q.get('play');
  // dev: ?proof=<name> opens a proof page from src/proofs/
  const proof = q.get('proof');
  if (proof && import.meta.env.DEV) {
    const { runProof } = await import('./proofs');
    const char: CharId = auto === 'kohaku' ? 'kohaku' : 'ren';
    if (await runProof(proof, { game, begin, char, params: q })) return;
  }
  if (auto === 'ren' || auto === 'kohaku') begin(auto, debugInfo, debugMode);
}

void boot();
