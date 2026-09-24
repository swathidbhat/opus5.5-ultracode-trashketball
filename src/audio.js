// All sound is synthesized with WebAudio: noise bursts for paper and thuds,
// inharmonic partials for the metal bin, and looping ambience per level.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastHit = new Map();
    this.ambience = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.bed = this.ctx.createGain();
    this.bed.gain.value = 0;
    this.bed.connect(this.master);

    const len = this.ctx.sampleRate * 2;
    this.white = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  noise({ at = 0, dur = 0.1, type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.002, sweep = null, buffer = this.white }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone({ at = 0, freq = 440, to = null, dur = 0.2, type = 'sine', gain = 0.2, attack = 0.004 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  crumple() {
    for (let i = 0; i < 7; i++) {
      this.noise({ at: i * 0.022 + Math.random() * 0.015, dur: 0.03, type: 'highpass', freq: 2500 + Math.random() * 2500, gain: 0.08 + Math.random() * 0.06 });
    }
  }

  throw(power) {
    this.noise({ dur: 0.28, type: 'bandpass', freq: 600, sweep: 2600, q: 1.2, gain: 0.08 + 0.18 * power, attack: 0.03 });
  }

  impact(tag, speed) {
    const now = performance.now();
    if (now - (this.lastHit.get(tag) || 0) < 45) return;
    this.lastHit.set(tag, now);
    const v = Math.min(1, speed / 7);
    switch (tag) {
      case 'metal':
        [523, 1187, 1893, 2741].forEach((f, i) => this.tone({ freq: f * (0.98 + Math.random() * 0.04), dur: 0.35 - i * 0.05, gain: (0.06 + 0.1 * v) / (i + 1), attack: 0.002 }));
        this.noise({ dur: 0.04, type: 'highpass', freq: 3000, gain: 0.08 * v + 0.02 });
        break;
      case 'wicker':
        this.noise({ dur: 0.07, type: 'bandpass', freq: 1400, q: 2, gain: 0.12 + 0.2 * v });
        this.tone({ freq: 260, to: 190, dur: 0.09, gain: 0.08 * v + 0.03 });
        break;
      case 'glass':
        this.tone({ freq: 2100, dur: 0.25, gain: 0.06 * v + 0.02 });
        this.tone({ freq: 3150, dur: 0.18, gain: 0.04 * v + 0.01 });
        this.noise({ dur: 0.05, type: 'bandpass', freq: 900, gain: 0.1 * v });
        break;
      case 'wood':
      case 'desk':
      case 'stone':
        this.noise({ dur: 0.07, type: 'lowpass', freq: 1500, gain: 0.12 + 0.25 * v });
        this.tone({ freq: tag === 'stone' ? 320 : 210, to: 150, dur: 0.07, gain: 0.05 + 0.08 * v });
        break;
      case 'ball':
        this.noise({ dur: 0.04, type: 'highpass', freq: 2200, gain: 0.05 + 0.08 * v });
        break;
      default:
        // Carpet, rugs, fabric, walls: a soft papery thud.
        this.noise({ dur: 0.09, type: 'lowpass', freq: 500 + 500 * v, gain: 0.1 + 0.25 * v });
        this.noise({ dur: 0.03, type: 'highpass', freq: 3000, gain: 0.03 + 0.05 * v });
    }
  }

  score(theme) {
    if (theme === 'lumon') {
      [880, 1175, 1568].forEach((f, i) => this.tone({ at: i * 0.07, freq: f, dur: 0.16, type: 'square', gain: 0.035 }));
      this.tone({ at: 0.21, freq: 1760, dur: 0.35, type: 'triangle', gain: 0.06 });
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        this.tone({ at: i * 0.06, freq: f, dur: 0.5, gain: 0.08 });
        this.tone({ at: i * 0.06, freq: f * 4, dur: 0.08, gain: 0.02 });
      });
    }
  }

  levelUp() {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone({ at: i * 0.11, freq: f, dur: 0.6, type: 'triangle', gain: 0.09 });
      this.tone({ at: i * 0.11, freq: f / 2, dur: 0.6, gain: 0.05 });
    });
  }

  startAmbience(kind) {
    if (!this.ctx) return;
    this.stopAmbience();
    const ctx = this.ctx;
    const nodes = [];
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.bed);

    if (kind === 'office') {
      // Fluorescent hum and HVAC air.
      for (const [f, g] of [
        [120, 0.018],
        [240, 0.008],
        [360, 0.004],
      ]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const gn = ctx.createGain();
        gn.gain.value = g;
        o.connect(gn).connect(out);
        o.start();
        nodes.push(o);
      }
      const air = ctx.createBufferSource();
      air.buffer = this.brown;
      air.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      const ag = ctx.createGain();
      ag.gain.value = 0.05;
      air.connect(lp).connect(ag).connect(out);
      air.start();
      nodes.push(air);
    } else {
      // Surf: filtered noise swelling on a slow LFO, plus a hiss for the wash.
      const surf = ctx.createBufferSource();
      surf.buffer = this.brown;
      surf.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const sg = ctx.createGain();
      sg.gain.value = 0.08;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.065;
      lfo.connect(lfoGain).connect(sg.gain);
      surf.connect(lp).connect(sg).connect(out);
      const wash = ctx.createBufferSource();
      wash.buffer = this.white;
      wash.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 2500;
      hp.Q.value = 0.4;
      const wg = ctx.createGain();
      wg.gain.value = 0.006;
      const lfo2Gain = ctx.createGain();
      lfo2Gain.gain.value = 0.006;
      lfo.connect(lfo2Gain).connect(wg.gain);
      wash.connect(hp).connect(wg).connect(out);
      surf.start();
      wash.start();
      lfo.start();
      nodes.push(surf, wash, lfo);
    }
    this.bed.gain.cancelScheduledValues(ctx.currentTime);
    this.bed.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    this.ambience = { nodes, out };
  }

  stopAmbience() {
    if (!this.ambience || !this.ctx) return;
    const { nodes, out } = this.ambience;
    const t = this.ctx.currentTime;
    out.gain.setTargetAtTime(0, t, 0.3);
    for (const n of nodes) n.stop(t + 1.5);
    this.ambience = null;
  }
}
