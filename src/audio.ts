
import { saveSetting } from './storage';

// Miyako-bushi (in) scale on D, three octaves
const SCALE = [
  73.42, 77.78, 98.0, 110.0, 116.54, // D2..
  146.83, 155.56, 196.0, 220.0, 233.08, // D3..
  293.66, 311.13, 392.0, 440.0, 466.16, // D4..
  587.33, 622.25, 783.99, 880.0, 932.33, // D5..
];

export type Sfx = 'jump' | 'stroke' | 'bell' | 'hiss' | 'shimmer' | 'taiko' | 'finale' | 'note' | 'splash' | 'double';

/** 紫 portal sounds, kept apart from Sfx (played straight, not through the replay log yet: N17). */
export type PortalSfx = 'snap' | 'snapBad' | 'link' | 'portal' | 'fizzle';

/**
 * 雷 Raijin's sounds (summer-design 4.2), pitched to the music's D: `don` a drum hit (telegraph start and T - 0.5),
 * `crackle` the thread reaching the mark, `hiss` the bolt dropping, `DON` the impact with thunder, `clean` a drum
 * knocked clean, `roll` his drum roll (laugh, phase clear), `sputter` a ring torn by his storm.
 */
export type RaijinSfx = 'don' | 'crackle' | 'hiss' | 'DON' | 'clean' | 'roll' | 'sputter';

/**
 * Summer festival and sky sounds (N6, N13): `whistle` a shell rising (a hanabi spark's telegraph, a firework),
 * `hiss` a spark sizzling just before it lands, `pop` a spark landing, `bloom` a firework opening (arg: size 0..1),
 * `thunder` a far roll after a background flash (arg: nearness 0..1).
 */
export type FestivalSfx = 'whistle' | 'hiss' | 'pop' | 'bloom' | 'thunder';

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private paintBus!: GainNode;
  private filter!: BiquadFilterNode;
  private reverb!: ConvolverNode;
  private koto: AudioBuffer[] = [];
  private bell!: AudioBuffer;
  private noise!: AudioBuffer;
  private brushGain!: GainNode;
  private brushFilter!: BiquadFilterNode;
  private nextNote = 0;
  private phrase: { deg: number; dur: number; vel: number }[] = [];
  private phraseIdx = 0;
  private phraseReps = 0;
  /** optional tap for recording the mix into a video */
  streamDest: MediaStreamAudioDestinationNode | null = null;
  private _muted = localStorage.getItem('inkrunner:muted') === '1';

  get muted() {
    return this._muted;
  }

  set muted(m: boolean) {
    this._muted = m;
    saveSetting('inkrunner:muted', m ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.streamDest = ctx.createMediaStreamDestination();
    comp.connect(this.streamDest);
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.8;
    this.master.connect(comp);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 16000;
    this.filter.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.reverb.connect(wet);
    wet.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.42;
    this.music.connect(this.filter);
    const musicSend = ctx.createGain();
    musicSend.gain.value = 0.9;
    this.music.connect(musicSend);
    musicSend.connect(this.reverb);

    // brush notes skip the slow-motion lowpass so painting always sings
    this.paintBus = ctx.createGain();
    this.paintBus.gain.value = 0.55;
    this.paintBus.connect(this.master);
    this.paintBus.connect(this.reverb);

    this.koto = SCALE.map((f) => this.pluck(f));
    this.bell = this.makeBell(587.33);
    this.noise = this.makeNoise(2);

    // continuous brush hiss (gain driven by brush speed)
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.brushFilter = ctx.createBiquadFilter();
    this.brushFilter.type = 'bandpass';
    this.brushFilter.frequency.value = 2600;
    this.brushFilter.Q.value = 0.8;
    this.brushGain = ctx.createGain();
    this.brushGain.gain.value = 0;
    src.connect(this.brushFilter);
    this.brushFilter.connect(this.brushGain);
    this.brushGain.connect(this.master);
    src.start();

    // wind bed
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 380;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.035;
    lfo.connect(lg);
    lg.connect(wg.gain);
    lfo.start();
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.filter);
    wind.start();

    // a low, breathing drone on D and A
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.028;
    const dlfo = ctx.createOscillator();
    dlfo.frequency.value = 0.05;
    const dlg = ctx.createGain();
    dlg.gain.value = 0.012;
    dlfo.connect(dlg);
    dlg.connect(droneGain.gain);
    dlfo.start();
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 500;
    for (const [f, det] of [
      [73.42, 0],
      [73.42, 4],
      [110, -3],
      [146.83, 2],
    ]) {
      const o = ctx.createOscillator();
      o.type = f > 100 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(df);
      o.start();
    }
    df.connect(droneGain);
    droneGain.connect(this.filter);
    droneGain.connect(this.reverb);

    this.nextNote = ctx.currentTime + 0.8;
  }

  private impulse(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }

  private makeNoise(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** Karplus–Strong plucked string, koto-ish. */
  private pluck(freq: number): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * (freq < 120 ? 4 : 3));
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const v = Math.random() * 2 - 1;
      prev = prev * 0.5 + v * 0.5;
      ring[i] = prev;
    }
    let idx = 0;
    const damp = freq < 120 ? 0.998 : 0.9965;
    for (let i = 0; i < len; i++) {
      const a = ring[idx];
      const nb = ring[(idx + 1) % N];
      ring[idx] = ((a + nb) / 2) * damp;
      d[i] = a * 0.6;
      idx = (idx + 1) % N;
    }
    for (let i = 0; i < 64; i++) d[i] *= i / 64;
    return b;
  }

  private makeBell(freq: number): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 4);
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const partials = [
      [1, 1, 1.2],
      [2.76, 0.5, 2],
      [5.4, 0.25, 3.5],
      [8.93, 0.12, 5],
    ];
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let v = 0;
      for (const [r, a, decay] of partials) v += Math.sin(2 * Math.PI * freq * r * t) * a * Math.exp(-t * decay);
      d[i] = v * 0.3 * Math.min(1, i / 40);
    }
    return b;
  }

  private play(buf: AudioBuffer, when: number, gain: number, rate = 1, pan = 0, dest?: AudioNode) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(g);
    g.connect(p);
    p.connect(dest ?? this.music);
    s.start(when);
  }

  private newPhrase() {
    const len = 3 + Math.floor(Math.random() * 4);
    let deg = 8 + Math.floor(Math.random() * 6);
    const durs = [0.3, 0.45, 0.6, 0.9, 1.2];
    this.phrase = [];
    for (let i = 0; i < len; i++) {
      this.phrase.push({ deg, dur: durs[Math.floor(Math.random() * durs.length)], vel: 0.2 + Math.random() * 0.2 });
      deg = Math.max(5, Math.min(16, deg + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
    }
    this.phrase[len - 1].dur = 2 + Math.random() * 1.5; // breathe at the end
    this.phraseIdx = 0;
    this.phraseReps = 0;
  }

  /** Phrase-based koto melody; call every frame. */
  tick(slow: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.filter.frequency.setTargetAtTime(16000 - slow * 15000, ctx.currentTime, 0.08);
    if (!this.phrase.length) this.newPhrase();
    while (this.nextNote < ctx.currentTime + 0.2) {
      const n = this.phrase[this.phraseIdx];
      // second time through, vary a note
      const deg = this.phraseReps === 1 && this.phraseIdx === 1 ? Math.max(5, n.deg - 1) : n.deg;
      this.play(this.koto[deg], this.nextNote, n.vel, 1, (Math.random() - 0.5) * 0.5);
      if (this.phraseIdx === 0) this.play(this.koto[Math.max(0, deg - 10)], this.nextNote, 0.32, 1, -0.2);
      this.nextNote += n.dur;
      this.phraseIdx++;
      if (this.phraseIdx >= this.phrase.length) {
        this.phraseIdx = 0;
        this.phraseReps++;
        if (this.phraseReps >= 2) {
          this.newPhrase();
          this.nextNote += 1.5 + Math.random() * 2;
        }
      }
    }
  }

  /** Rain hook (src/mechanics/rain.ts): where extra sound sources connect. `ambient` is muffled by slow motion. */
  buses(): { ambient: AudioNode; fx: AudioNode } | null {
    return this.ctx ? { ambient: this.filter, fx: this.master } : null;
  }

  brush(speed: number) {
    if (!this.ctx) return;
    const v = Math.min(0.12, speed / 25000);
    this.brushGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    this.brushFilter.frequency.setTargetAtTime(1800 + Math.min(3000, speed), this.ctx.currentTime, 0.05);
  }

  /** One-shot effects. `arg` carries extra data (ink kind, note height). */
  fx(name: Sfx, arg: number | string = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'note': {
        // painting music: height (0 top .. 1 bottom) picks the pitch
        const [kind, h, vel] = String(arg).split(':');
        const base = kind === 'ai' ? 7 : kind === 'kin' ? 12 : kind === 'murasaki' ? 8 : 9;
        const deg = Math.max(0, Math.min(SCALE.length - 1, base + Math.round((1 - Number(h)) * 6)));
        const rate = kind === 'ai' ? 0.997 : 1;
        const v = 0.18 + Number(vel) * 0.3;
        if (kind === 'murasaki') {
          // purple wavers: two slightly detuned strings, panned apart, the second a breath late
          const pan = (Math.random() - 0.5) * 0.4;
          this.play(this.koto[deg], t, v * 0.75, 0.994, pan - 0.35, this.paintBus);
          this.play(this.koto[deg], t + 0.035, v * 0.6, 1.006, pan + 0.35, this.paintBus);
          break;
        }
        this.play(this.koto[deg], t, v, rate, (Math.random() - 0.5) * 0.6, this.paintBus);
        if (kind === 'kin') this.play(this.bell, t, 0.06, 2 * (SCALE[deg] / 587.33), 0, this.paintBus);
        break;
      }
      case 'stroke': {
        if (arg === 'murasaki') {
          // a turning figure (up, down, up) for the ink of loops, with the same detuned pair
          [11, 13, 12, 15].forEach((d, i) => {
            this.play(this.koto[d], t + i * 0.07, 0.34 - i * 0.04, 0.995, -0.3 + i * 0.2, this.paintBus);
            this.play(this.koto[d], t + i * 0.07 + 0.03, 0.2 - i * 0.03, 1.005, 0.3 - i * 0.2, this.paintBus);
          });
          break;
        }
        const base = arg === 'shu' ? 10 : arg === 'ai' ? 12 : 14;
        this.play(this.koto[base], t, 0.45, 1, 0, this.paintBus);
        this.play(this.koto[Math.min(SCALE.length - 1, base + 2)], t + 0.09, 0.3, 1, 0.2, this.paintBus);
        break;
      }
      case 'jump':
        this.play(this.koto[5 + Math.floor(Math.random() * 3)], t, 0.16, 2, 0, this.master);
        break;
      case 'double':
        this.play(this.koto[12], t, 0.2, 1, -0.2, this.paintBus);
        this.play(this.koto[14], t + 0.06, 0.18, 1, 0.2, this.paintBus);
        break;
      case 'bell':
        this.play(this.bell, t, 0.5, 1, 0, this.music);
        this.play(this.bell, t + 0.02, 0.25, 1.5, 0.3, this.music);
        break;
      case 'hiss':
      case 'splash': {
        const s = ctx.createBufferSource();
        s.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = name === 'hiss' ? 'highpass' : 'lowpass';
        f.frequency.value = name === 'hiss' ? 1800 : 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(name === 'hiss' ? 0.25 : 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        s.connect(f);
        f.connect(g);
        g.connect(this.master);
        s.start();
        s.stop(t + 1.5);
        break;
      }
      case 'shimmer':
        for (let i = 0; i < 5; i++) this.play(this.koto[12 + (i % 6)], t + i * 0.06, 0.22, 1, (i - 2) * 0.2, this.paintBus);
        break;
      case 'taiko': {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.35);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + 0.75);
        break;
      }
      case 'finale':
        [10, 12, 13, 15, 16, 14, 15].forEach((d, i) => this.play(this.koto[d], t + i * 0.16, 0.45, 1, (i - 3) * 0.15, this.paintBus));
        this.play(this.koto[0], t, 0.6, 1, 0, this.paintBus);
        this.play(this.bell, t + 1.2, 0.6, 1, 0, this.paintBus);
        break;
    }
  }
  /** A taiko hit at `freq` (Hz): a pitched body that drops a fifth, plus a skin slap. */
  private drum(t: number, freq: number, gain: number, pan = 0, len = 0.6) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.9, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(freq * 0.8, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g);
    g.connect(p);
    p.connect(this.master);
    p.connect(this.reverb);
    o.start(t);
    o.stop(t + len + 0.05);
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * 6;
    f.Q.value = 1.2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(gain * 0.5, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    s.connect(f);
    f.connect(sg);
    sg.connect(p);
    s.start(t, Math.random());
    s.stop(t + 0.1);
  }

  /** Filtered noise with a gain envelope: thunder, crackle, hiss. */
  private noiseBurst(t: number, type: BiquadFilterType, f0: number, f1: number, gain: number, attack: number, len: number, pan = 0) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = len > 1.8;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(this.master);
    s.start(t, Math.random());
    s.stop(t + len + 0.05);
  }

  /** Raijin (see RaijinSfx). `arg` is a stereo pan (-1 left .. 1 right): his drums sit where he is. */
  raijinFx(name: RaijinSfx, arg = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const pan = Math.max(-1, Math.min(1, arg));
    const D2 = SCALE[0];
    switch (name) {
      case 'don':
        this.drum(t, D2 * 2, 0.55, pan, 0.55);
        this.drum(t + 0.012, D2, 0.4, pan, 0.8);
        break;
      case 'crackle':
        for (let i = 0; i < 6; i++) this.noiseBurst(t + i * 0.035 + Math.random() * 0.02, 'highpass', 3500, 6000, 0.12, 0.004, 0.05, pan + (Math.random() - 0.5) * 0.3);
        break;
      case 'hiss':
        this.noiseBurst(t, 'bandpass', 900, 5200, 0.22, 0.12, 0.2, pan);
        break;
      case 'DON':
        this.drum(t, D2, 0.95, pan, 1.1);
        this.drum(t + 0.01, SCALE[3], 0.45, pan, 0.7);
        this.noiseBurst(t, 'lowpass', 2400, 120, 0.6, 0.01, 2.2, pan);
        this.noiseBurst(t, 'highpass', 4000, 2000, 0.25, 0.003, 0.25, pan);
        break;
      case 'clean':
        this.drum(t, D2 * 4, 0.5, pan, 0.4);
        [10, 13, 15].forEach((d, i) => this.play(this.koto[d], t + 0.05 + i * 0.06, 0.32, 1, pan * 0.5, this.paintBus));
        this.play(this.bell, t + 0.05, 0.22, 2 * (SCALE[12] / 587.33), pan * 0.5, this.paintBus);
        break;
      case 'roll':
        for (let i = 0; i < 9; i++) this.drum(t + i * 0.075, i % 2 ? SCALE[3] : D2 * 2, 0.3 + 0.04 * i, pan + (i % 2 ? 0.15 : -0.15), 0.35);
        break;
      case 'sputter':
        this.noiseBurst(t, 'bandpass', 2600, 700, 0.3, 0.01, 0.35, pan);
        this.play(this.koto[7], t, 0.18, 0.92, pan, this.paintBus);
        break;
    }
  }

  /** Festival and sky sounds (see FestivalSfx). For most, `arg` is a stereo pan. */
  festivalFx(name: FestivalSfx, arg = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const pan = Math.max(-1, Math.min(1, arg));
    switch (name) {
      case 'whistle': {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(700, t);
        o.frequency.exponentialRampToValueAtTime(2100, t + 0.85);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        o.connect(g);
        g.connect(p);
        p.connect(this.master);
        o.start(t);
        o.stop(t + 1);
        this.noiseBurst(t, 'bandpass', 1500, 4200, 0.05, 0.1, 0.9, pan);
        break;
      }
      case 'hiss':
        this.noiseBurst(t, 'highpass', 3000, 5200, 0.12, 0.05, 0.4, pan);
        break;
      case 'pop':
        this.drum(t, SCALE[0] * 2, 0.35, pan, 0.4);
        for (let i = 0; i < 5; i++) this.noiseBurst(t + 0.04 + i * 0.05 + Math.random() * 0.03, 'highpass', 2600, 4800, 0.08, 0.004, 0.06, pan + (Math.random() - 0.5) * 0.4);
        break;
      case 'bloom': {
        const k = Math.max(0.2, Math.min(1, arg || 0.6));
        this.drum(t, SCALE[0], 0.5 + 0.4 * k, 0, 1.2);
        this.noiseBurst(t, 'lowpass', 1800, 140, 0.3 * k, 0.01, 1.6, 0);
        for (let i = 0; i < 14; i++) this.noiseBurst(t + 0.25 + i * 0.07 + Math.random() * 0.05, 'highpass', 3000, 6000, 0.05 * k, 0.003, 0.05, (Math.random() - 0.5) * 1.4);
        break;
      }
      case 'thunder': {
        const near = Math.max(0, Math.min(1, arg));
        this.noiseBurst(t + 0.4 * (1 - near), 'lowpass', 500 + 900 * near, 70, 0.18 + 0.3 * near, 0.25, 2.6, 0);
        break;
      }
    }
  }

  /**
   * Portal sounds. `snap`: a koto harmonic pitched like the painting notes (arg = brush height 0 top .. 1
   * bottom); `snapBad`: the same, flattened and dull; `link`: two strings answering; `portal`: a breath of
   * air and a low string (arg = loudness); `fizzle`: a falling, muted pluck.
   */
  portalFx(name: PortalSfx, arg = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const deg = Math.max(0, Math.min(SCALE.length - 1, 8 + Math.round((1 - arg) * 6)));
    switch (name) {
      case 'snap':
        // a harmonic: the string touched at its midpoint rings an octave up, pure and short
        this.play(this.koto[deg], t, 0.32, 2, -0.2, this.paintBus);
        this.play(this.koto[deg], t + 0.03, 0.2, 3, 0.2, this.paintBus);
        this.play(this.bell, t, 0.08, (2 * SCALE[deg]) / 587.33, 0, this.paintBus);
        break;
      case 'snapBad':
        this.play(this.koto[deg], t, 0.26, 2 * 0.944, 0, this.paintBus);
        this.play(this.koto[Math.max(0, deg - 1)], t + 0.05, 0.14, 1.5 * 0.944, 0, this.paintBus);
        break;
      case 'link':
        this.play(this.koto[13], t, 0.22, 1, -0.3, this.paintBus);
        this.play(this.koto[15], t + 0.08, 0.2, 1, 0.3, this.paintBus);
        break;
      case 'portal': {
        const g0 = 0.3 * Math.max(0.2, Math.min(1, arg));
        const s = ctx.createBufferSource();
        s.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 3;
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
        f.frequency.exponentialRampToValueAtTime(600, t + 0.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(g0, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        s.connect(f);
        f.connect(g);
        g.connect(this.master);
        s.start(t);
        s.stop(t + 0.6);
        this.play(this.koto[5], t, g0, 1, 0, this.paintBus);
        this.play(this.koto[10], t + 0.06, g0 * 0.7, 1.003, 0.2, this.paintBus);
        break;
      }
      case 'fizzle':
        this.play(this.koto[9], t, 0.2, 0.94, 0, this.paintBus);
        this.play(this.koto[7], t + 0.09, 0.14, 0.9, 0, this.paintBus);
        break;
    }
  }
}
