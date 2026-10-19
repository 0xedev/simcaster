// Zero-dependency WebAudio Procedural SFX & Lo-Fi / Synthwave FM Radio
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.sfxMuted = false;
    this.radioPlaying = false;
    this.radioTimer = null;
    this.stepIndex = 0;
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      try {
        fn({ sfxMuted: this.sfxMuted, radioPlaying: this.radioPlaying });
      } catch {}
    }
  }

  ensureContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleSfx() {
    this.sfxMuted = !this.sfxMuted;
    if (!this.sfxMuted) this.playClick();
    this.notify();
    return this.sfxMuted;
  }

  playTone({ freq = 440, endFreq = null, type = 'sine', duration = 0.12, gain = 0.12, delay = 0 }) {
    if (this.sfxMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    }
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  playClick() {
    this.playTone({ freq: 660, endFreq: 880, type: 'sine', duration: 0.04, gain: 0.06 });
  }

  playDash() {
    this.playTone({ freq: 210, endFreq: 540, type: 'triangle', duration: 0.14, gain: 0.1 });
  }

  playLaser() {
    this.playTone({ freq: 920, endFreq: 150, type: 'sawtooth', duration: 0.16, gain: 0.11 });
    this.playTone({ freq: 1320, endFreq: 260, type: 'square', duration: 0.11, gain: 0.05 });
  }

  playHit() {
    this.playTone({ freq: 190, endFreq: 48, type: 'sawtooth', duration: 0.22, gain: 0.16 });
    this.playTone({ freq: 110, endFreq: 38, type: 'triangle', duration: 0.25, gain: 0.14 });
  }

  playPowerup() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.playTone({ freq: f, type: 'triangle', duration: 0.14, gain: 0.09, delay: idx * 0.055 });
    });
  }

  playCash() {
    this.playTone({ freq: 987.77, type: 'sine', duration: 0.09, gain: 0.11, delay: 0 });
    this.playTone({ freq: 1318.51, type: 'triangle', duration: 0.22, gain: 0.12, delay: 0.075 });
  }

  playTipCoin(amount = 50) {
    if (this.sfxMuted) return;
    const arpeggio = [
      { freq: 1318.51, type: 'sine', duration: 0.09, gain: 0.10, delay: 0 },
      { freq: 1661.22, type: 'sine', duration: 0.11, gain: 0.11, delay: 0.048 },
      { freq: 1975.53, type: 'triangle', duration: 0.15, gain: 0.12, delay: 0.096 },
      { freq: 2637.02, type: 'triangle', duration: 0.32, gain: 0.13, delay: 0.144 }
    ];
    arpeggio.push({ freq: 3951.07, type: 'sine', duration: 0.25, gain: 0.04, delay: 0.15 });
    if (amount >= 100) {
      arpeggio.push({ freq: 3322.44, type: 'triangle', duration: 0.40, gain: 0.08, delay: 0.19 });
    }
    arpeggio.forEach((note) => this.playTone(note));
  }

  playPromotion() {
    const chord = [523.25, 659.25, 783.99, 987.77, 1174.66];
    chord.forEach((f, idx) => {
      this.playTone({ freq: f, type: 'triangle', duration: 0.36, gain: 0.09, delay: idx * 0.065 });
    });
  }

  // Procedural Lo-Fi & Synthwave FM Radio (112 BPM = ~134ms per 16th note)
  toggleRadio(forceState) {
    const next = typeof forceState === 'boolean' ? forceState : !this.radioPlaying;
    if (next === this.radioPlaying) return this.radioPlaying;
    if (next) {
      const ctx = this.ensureContext();
      if (!ctx) return false;
      this.radioPlaying = true;
      this.stepIndex = 0;
      this.tickRadioStep();
      this.radioTimer = setInterval(() => this.tickRadioStep(), 134);
    } else {
      this.radioPlaying = false;
      if (this.radioTimer) {
        clearInterval(this.radioTimer);
        this.radioTimer = null;
      }
    }
    this.notify();
    return this.radioPlaying;
  }

  tickRadioStep() {
    if (!this.radioPlaying || !this.ctx) return;
    const step = this.stepIndex % 16;
    const bar = Math.floor(this.stepIndex / 16) % 4;
    this.stepIndex += 1;

    // Syncopated lo-fi rim/hi-hat pattern (steps 0, 3, 6, 10, 12)
    if ([0, 3, 6, 10, 12].includes(step)) {
      this.playRadioNote(step === 0 ? 820 : 1080, 0.035, 0.028, 'triangle');
    }

    // Warm sub-bass synth groove
    const bassRoots = [174.61, 196.0, 164.81, 220.0]; // F3, G3, E3, A3
    const root = bassRoots[bar];
    if ([0, 3, 7, 10, 14].includes(step)) {
      const mult = step === 7 ? 1.5 : step === 14 ? 1.25 : 1;
      this.playRadioBass(root * mult, 0.16, 0.075);
    }

    // Lush Rhodes electric piano chords on beat 0 and syncopated beat 6
    if (step === 0 || step === 6) {
      const chords = [
        [349.23, 440.0, 523.25, 659.25], // Fmaj7
        [392.0, 493.88, 587.33, 659.25], // G6
        [329.63, 392.0, 493.88, 587.33], // Em7
        [440.0, 523.25, 659.25, 783.99]  // Am7
      ];
      const notes = chords[bar];
      notes.forEach((f) => this.playRadioNote(f, step === 0 ? 0.45 : 0.28, 0.025, 'sine'));
    }
  }

  playRadioNote(freq, duration, gain, type = 'sine') {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playRadioBass(freq, duration, gain) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.35, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}

export const soundEngine = new SoundEngine();
