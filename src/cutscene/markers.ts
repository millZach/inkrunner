/**
 * The map's hanging-scroll markers as real buttons: each one replays its cutscene (docs/story.md, section 7:
 * "can be replayed later from the map"). The map paints the markers on its canvas; this lays a button over each,
 * the way the map lays its own buttons over the scroll nodes, and keeps them in place as the map pans.
 *
 * Where the markers are: CampaignMap.cutsceneSlots() when the map offers it (requested from the map owner); until
 * then they are read from the map's own layout (its 'slot' items), by replaying each marker's draw into a
 * one-pixel scratch canvas and noting where it translates to and which title it writes. Read-only either way.
 */
import { CAMPAIGN, type CutsceneId } from '../campaign/data';
import type { CampaignMap } from '../campaign/map';
import { IS_TOUCH } from '../config';

export interface SlotPos {
  id: CutsceneId;
  /** the marker's centre (the hanging scroll), map units */
  x: number;
  y: number;
}

interface MapItem {
  name?: string;
  x0: number;
  x1: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/** the parts of the map this reads (private fields, read-only, until the map exposes its slots) */
interface MapPeek {
  cutsceneSlots?: () => SlotPos[];
  L?: { width: number; items: MapItem[] } | null;
  scale?: number;
  pr?: number;
  camX: number;
}

/** where the map's markers are, from its layout; [] if the layout is not built or not readable */
export function readSlots(map: CampaignMap): SlotPos[] {
  const m = map as unknown as MapPeek;
  if (typeof m.cutsceneSlots === 'function') return m.cutsceneSlots();
  const items = m.L?.items?.filter((it) => it.name === 'slot') ?? [];
  const out: SlotPos[] = [];
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d')!;
  for (const it of items) {
    let at: { x: number; y: number } | null = null;
    const texts: string[] = [];
    const tr = g.translate.bind(g);
    const ft = g.fillText.bind(g);
    (g as unknown as { translate: (x: number, y: number) => void }).translate = (x, y) => {
      at ??= { x, y };
      tr(x, y);
    };
    (g as unknown as { fillText: (s: string, x: number, y: number) => void }).fillText = (s, x, y) => {
      texts.push(s);
      ft(s, x, y);
    };
    try {
      g.save();
      it.draw(g);
      g.restore();
    } catch {
      // a marker that cannot be read is simply not clickable
    }
    const slot = CAMPAIGN.cutscenes.find((cs) => texts.includes(cs.title));
    if (at && slot) out.push({ id: slot.id, x: (at as { x: number }).x, y: (at as { y: number }).y });
  }
  return out;
}

export class MapMarkers {
  private el: HTMLElement;
  private buttons = new Map<CutsceneId, HTMLButtonElement>();
  private slots: SlotPos[] = [];
  private sig = '';
  private down: { x: number; y: number } | null = null;

  constructor(
    private mapRoot: HTMLElement,
    private map: CampaignMap,
    /** replay a cutscene */
    private onReplay: (id: CutsceneId) => void,
    /** whether a marker may replay yet (seen or earned) */
    private canReplay: (id: CutsceneId) => boolean,
  ) {
    let el = mapRoot.querySelector<HTMLElement>('.map-slots');
    if (!el) {
      el = document.createElement('div');
      el.className = 'map-slots';
      (mapRoot.querySelector('.map-view') ?? mapRoot).appendChild(el);
    }
    this.el = el;
  }

  /** rebuild the buttons when the map's layout changed (call after map.open) */
  refresh() {
    const m = this.map as unknown as MapPeek;
    const sig = `${m.L?.width ?? 0}:${m.L?.items?.length ?? 0}`;
    if (sig !== this.sig || !this.slots.length) {
      this.sig = sig;
      this.slots = readSlots(this.map);
      // the fallback reader depends on how the map draws its markers: say so loudly if it stops finding them
      if (m.L && this.slots.length < CAMPAIGN.cutscenes.length && typeof m.cutsceneSlots !== 'function')
        console.warn(`map markers: found ${this.slots.length} of ${CAMPAIGN.cutscenes.length} cutscene slots; their replay buttons are missing`);
    }
    const want = new Set(this.slots.map((s) => s.id));
    for (const [id, b] of this.buttons) if (!want.has(id)) (b.remove(), this.buttons.delete(id));
    for (const s of this.slots) {
      let b = this.buttons.get(s.id);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'map-slot';
        b.dataset.cutscene = s.id;
        const id = s.id;
        b.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
        b.addEventListener('click', (e) => {
          e.preventDefault();
          // the end of a drag across the map is not a click
          const d = this.down;
          this.down = null;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 && e.detail > 0) return;
          if (!this.canReplay(id)) return;
          this.onReplay(id);
        });
        this.el.appendChild(b);
        this.buttons.set(s.id, b);
      }
      const slot = CAMPAIGN.cutscenes.find((c) => c.id === s.id)!;
      const open = this.canReplay(s.id);
      b.dataset.state = open ? 'open' : 'locked';
      b.setAttribute('aria-disabled', String(!open));
      b.setAttribute('aria-label', open ? `Replay ${slot.name}: ${slot.title}` : `${slot.title}: ${slot.lockHint}`);
      b.title = open ? `Replay ${slot.name}` : slot.lockHint;
    }
    this.place();
  }

  /** keep the buttons over the markers as the map pans and leans in (call every map frame) */
  place() {
    const m = this.map as unknown as MapPeek;
    const scale = m.scale ?? 0;
    const pr = m.pr ?? 1;
    if (!scale || !this.slots.length) return;
    const off = Math.round(m.camX * scale);
    const k = 1 / pr;
    // the marker's hanging scroll and its two labels: about 120 x 130 map units around its centre
    const w = Math.max(IS_TOUCH ? 52 : 44, 92 * scale * k);
    const h = Math.max(IS_TOUCH ? 60 : 52, 150 * scale * k);
    for (const s of this.slots) {
      const b = this.buttons.get(s.id);
      if (!b) continue;
      const cx = (s.x * scale - off) * k;
      const top = (s.y - 36) * scale * k;
      b.style.width = w + 'px';
      b.style.height = h + 'px';
      b.style.transform = `translate(${(cx - w / 2).toFixed(1)}px, ${top.toFixed(1)}px)`;
    }
    // follow the map's lean-in on phones (it scales its canvas and node layer the same way)
    const nodes = this.mapRoot.querySelector<HTMLElement>('.map-nodes');
    if (nodes && this.el.style.transform !== nodes.style.transform) {
      this.el.style.transformOrigin = nodes.style.transformOrigin;
      this.el.style.transform = nodes.style.transform;
    }
  }

  /** the button over a marker (tests) */
  button(id: CutsceneId) {
    return this.buttons.get(id) ?? null;
  }
}
