/**
 * Audio.
 *
 * Every sound here is synthesised at runtime with WebAudio. That is a
 * deliberate placeholder strategy, not a shortcut: the game ships with no audio
 * files at all, so there is nothing to download and nothing to licence, and the
 * calm/premium brief is easier to hit with quiet synthesis than with stock
 * effects.
 *
 * To replace any cue with a real recording, call `registerSample(name, url)`
 * before or during play. The synthesised version is used only while no sample
 * is registered for that name, so swapping assets in needs no other changes.
 *
 * iOS will not start an AudioContext without a user gesture, so `unlock()` must
 * be called from inside a touch/click handler -- that is what the title veil is
 * for.
 */

const CUES = ['footstep', 'grind', 'lock', 'impact', 'chime', 'portal', 'complete', 'reject'];

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
    /** @type {Map<string, AudioBuffer>} */
    this.samples = new Map();
    this._pendingSamples = new Map();
    this._grind = null;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;
    this.master.connect(this.ctx.destination);

    // A gentle shelf keeps everything soft; nothing in this game should be
    // bright or arcade-like.
    this.tone = this.ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 6200;
    this.tone.Q.value = 0.4;
    this.tone.connect(this.master);

    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.tone);

    this._noiseBuffer = this._makeNoiseBuffer(2.5);
    this._startAmbience();
    this.ready = true;

    for (const [name, url] of this._pendingSamples) this.registerSample(name, url);
    this._pendingSamples.clear();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.master) {
      this.master.gain.setTargetAtTime(enabled ? 0.85 : 0, this.ctx.currentTime, 0.08);
    }
  }

  /** Swap a synthesised cue for a real audio file. */
  async registerSample(name, url) {
    if (!CUES.includes(name)) throw new Error(`AudioSystem: unknown cue "${name}"`);
    if (!this.ready) { this._pendingSamples.set(name, url); return; }
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    this.samples.set(name, await this.ctx.decodeAudioData(data));
  }

  _playSample(name, gain = 1) {
    const buffer = this.samples.get(name);
    if (!buffer) return false;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    source.connect(g).connect(this.sfx);
    source.start();
    return true;
  }

  _makeNoiseBuffer(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _noise({ loop = false } = {}) {
    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    source.loop = loop;
    return source;
  }

  /* ---------------- ambience ---------------- */

  /** Wind, a distant pad, and nothing else. Runs for the whole session. */
  _startAmbience() {
    const now = this.ctx.currentTime;

    // Wind: looping noise through a slowly swept band-pass.
    const wind = this._noise({ loop: true });
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 480;
    windFilter.Q.value = 0.7;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.055;
    wind.connect(windFilter).connect(windGain).connect(this.tone);
    wind.start();

    const windLfo = this.ctx.createOscillator();
    const windLfoGain = this.ctx.createGain();
    windLfo.frequency.value = 0.07;
    windLfoGain.gain.value = 260;
    windLfo.connect(windLfoGain).connect(windFilter.frequency);
    windLfo.start();

    const breathLfo = this.ctx.createOscillator();
    const breathGain = this.ctx.createGain();
    breathLfo.frequency.value = 0.045;
    breathGain.gain.value = 0.022;
    breathLfo.connect(breathGain).connect(windGain.gain);
    breathLfo.start();

    // Pad: a quiet open fifth, slightly detuned, filtered right down.
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.gain.setTargetAtTime(0.045, now, 6);
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 620;
    padGain.connect(padFilter).connect(this.tone);

    for (const [freq, detune] of [[110, -4], [164.81, 5], [220, 3], [329.63, -6]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.value = 0.25;
      // Each voice swells on its own slow cycle so the pad never sits still.
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.03 + Math.random() * 0.04;
      lfoGain.gain.value = 0.16;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();
      osc.connect(g).connect(padGain);
      osc.start();
    }
  }

  /* ---------------- cues ---------------- */

  footstep() {
    if (!this.ready || !this.enabled) return;
    if (this._playSample('footstep', 0.35)) return;
    const now = this.ctx.currentTime;
    const source = this._noise();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + Math.random() * 300;
    filter.Q.value = 1.6;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.1);
    source.connect(filter).connect(gain).connect(this.sfx);
    source.start(now);
    source.stop(now + 0.14);
  }

  /** Stone grinding on stone, held for `duration` seconds. */
  startGrind(duration) {
    if (!this.ready || !this.enabled) return;
    this.stopGrind();
    const now = this.ctx.currentTime;

    const source = this._noise({ loop: true });
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.linearRampToValueAtTime(420, now + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(190, now + duration);
    filter.Q.value = 1.1;

    // A touch of low rumble underneath gives the mass its weight.
    const rumble = this.ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(48, now);
    rumble.frequency.linearRampToValueAtTime(38, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.35);
    gain.gain.setValueAtTime(0.1, now + duration - 0.4);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.setValueAtTime(0, now);
    rumbleGain.gain.linearRampToValueAtTime(0.05, now + 0.4);
    rumbleGain.gain.linearRampToValueAtTime(0, now + duration);

    source.connect(filter).connect(gain).connect(this.sfx);
    rumble.connect(rumbleGain).connect(this.sfx);
    source.start(now);
    rumble.start(now);
    source.stop(now + duration + 0.1);
    rumble.stop(now + duration + 0.1);
    this._grind = { source, rumble };
  }

  stopGrind() {
    if (!this._grind) return;
    try { this._grind.source.stop(); this._grind.rumble.stop(); } catch { /* already stopped */ }
    this._grind = null;
  }

  /** The mechanical clunk of something finding its seat. */
  lock() {
    if (!this.ready || !this.enabled) return;
    if (this._playSample('lock', 0.7)) return;
    const now = this.ctx.currentTime;

    const thud = this.ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(150, now);
    thud.frequency.exponentialRampToValueAtTime(46, now + 0.22);
    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.28, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.42);
    thud.connect(thudGain).connect(this.sfx);
    thud.start(now);
    thud.stop(now + 0.45);

    const click = this._noise();
    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 1800;
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.09, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.09);
    click.connect(clickFilter).connect(clickGain).connect(this.sfx);
    click.start(now);
    click.stop(now + 0.1);
  }

  /** A soft low impact, for the bridge settling. */
  impact() {
    if (!this.ready || !this.enabled) return;
    if (this._playSample('impact', 0.7)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.75);
    osc.connect(gain).connect(this.sfx);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  /** Quiet confirmation chime when a mechanism is touched. */
  chime(semitoneOffset = 0) {
    if (!this.ready || !this.enabled) return;
    if (this._playSample('chime', 0.5)) return;
    const now = this.ctx.currentTime;
    const base = 587.33 * Math.pow(2, semitoneOffset / 12);
    for (const [mult, level, decay] of [[1, 0.055, 0.9], [2.01, 0.022, 0.6], [3.02, 0.01, 0.4]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * mult;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0004, now + decay);
      osc.connect(gain).connect(this.sfx);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    }
  }

  /** A soft "not yet" -- used when a tap cannot do what it wanted. */
  reject() {
    if (!this.ready || !this.enabled) return;
    if (this._playSample('reject', 0.5)) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(174, now + 0.16);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0004, now + 0.24);
    osc.connect(gain).connect(this.sfx);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /** The portal's standing hum, faded in as the traveller approaches. */
  portalHum() {
    if (!this.ready || this._portal) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.tone);
    for (const [freq, level] of [[146.83, 0.4], [220, 0.22], [440, 0.08]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = level;
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.22 + Math.random() * 0.1;
      lfoGain.gain.value = level * 0.5;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();
      osc.connect(g).connect(gain);
      osc.start();
    }
    this._portal = gain;
  }

  /** 0..1 proximity to the portal. */
  setPortalProximity(amount) {
    if (!this._portal) return;
    this._portal.gain.setTargetAtTime(0.075 * amount, this.ctx.currentTime, 0.4);
  }

  /** The short, warm resolution when the puzzle is finished. */
  complete() {
    if (!this.ready || !this.enabled) return;
    if (this._playSample('complete', 0.8)) return;
    const now = this.ctx.currentTime;
    // A rising open chord: D, A, F#, D. Warm rather than triumphant.
    const notes = [293.66, 440, 554.37, 587.33];
    notes.forEach((freq, i) => {
      const start = now + i * 0.13;
      for (const [mult, level] of [[1, 0.06], [2, 0.018]]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(level, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0004, start + 2.4);
        osc.connect(gain).connect(this.sfx);
        osc.start(start);
        osc.stop(start + 2.5);
      }
    });
  }

  dispose() {
    this.stopGrind();
    this.ctx?.close();
    this.ready = false;
  }
}
