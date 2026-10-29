/**
 * Spatial Wealth - Synthesized Web Audio FX Engine
 * Pure Web Audio API oscillators and filters (zero external audio files required)
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;
    this.unlocked = false;

    // Auto-unlock on first user interaction
    const unlockHandler = () => {
      this.initContext();
      window.removeEventListener('pointerdown', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
    };
    window.addEventListener('pointerdown', unlockHandler);
    window.addEventListener('keydown', unlockHandler);
  }

  initContext() {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      if (typeof window !== 'undefined' && typeof window.getOrCreateAudioContext === 'function') {
        this.ctx = window.getOrCreateAudioContext();
      } else if (typeof window !== 'undefined' && window.sharedAudioContext) {
        this.ctx = window.sharedAudioContext;
      } else {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx) {
        if (!this.masterGain) {
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
          this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        this.unlocked = true;
      }
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  resume() {
    if (typeof window !== 'undefined' && window.sharedAudioContext && this.ctx !== window.sharedAudioContext) {
      this.ctx = window.sharedAudioContext;
      if (!this.masterGain) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * Subtle high-frequency pulse when hovering over an interactive planet.
   */
  playHoverSound() {
    if (!this.enabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, now);
      osc.frequency.exponentialRampToValueAtTime(1500, now + 0.04);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      // Audio fallback silent ignore
    }
  }

  /**
   * Crystal harmonic chord arpeggio when selecting an asset node.
   */
  playSelectSound() {
    if (!this.enabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 triad

      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0.001, now + idx * 0.04);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.04 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.04 + 0.38);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.4);
      });
    } catch (e) {}
  }

  /**
   * Deep resonant sub-bass energy surge when submitting asset data or switching presets.
   */
  playEnergySurgeSound() {
    if (!this.enabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(70, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.28);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.55);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, now);
      filter.frequency.exponentialRampToValueAtTime(1400, now + 0.25);
      filter.frequency.exponentialRampToValueAtTime(150, now + 0.55);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.6);
    } catch (e) {}
  }

  /**
   * Soft sci-fi click when closing panels or resetting views.
   */
  playCloseSound() {
    if (!this.enabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {}
  }

  /**
   * Ethereal swell when entering WebXR immersion.
   */
  playVrEnterSound() {
    if (!this.enabled) return;
    this.initContext();
    this.resume();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const freqs = [220, 329.63, 440, 659.25];

      freqs.forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 1.25);
      });
    } catch (e) {}
  }

  /**
   * Continuous deep sub-bass gravitational drone for Black Hole / Supernova Macro Stress-Test.
   * Utilizes dual detuned infrasonic oscillators, slow LFO filter sweeping, and binaural beat interference.
   */
  playGravitationalDrone(enable = true) {
    if (!this.enabled && enable) return;
    this.initContext();
    this.resume();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    if (!enable) {
      if (this.droneGain && this.droneNodes) {
        try {
          this.droneGain.gain.cancelScheduledValues(now);
          this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
          this.droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
          const nodes = this.droneNodes;
          setTimeout(() => {
            nodes.forEach((n) => {
              try {
                if (n.stop) n.stop();
                n.disconnect();
              } catch (e) {}
            });
          }, 650);
          this.droneNodes = null;
          this.droneGain = null;
        } catch (e) {}
      }
      return;
    }

    // If already playing, don't recreate
    if (this.droneGain && this.droneNodes) return;

    try {
      this.droneNodes = [];
      const droneGain = this.ctx.createGain();
      droneGain.gain.setValueAtTime(0.0001, now);
      droneGain.gain.linearRampToValueAtTime(0.24, now + 0.8);
      droneGain.connect(this.masterGain);
      this.droneGain = droneGain;

      // Resonant Lowpass Filter with slow LFO breathing
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(110, now);
      filter.Q.setValueAtTime(3.8, now);
      filter.connect(droneGain);
      this.droneNodes.push(filter);

      // LFO for filter modulation (0.22 Hz breathing pulse)
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(0.22, now);
      lfoGain.gain.setValueAtTime(45, now);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(now);
      this.droneNodes.push(lfo, lfoGain);

      // Osc 1: Deep sawtooth fundamental (41 Hz)
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(41.0, now);
      osc1.connect(filter);
      osc1.start(now);
      this.droneNodes.push(osc1);

      // Osc 2: Detuned sine (42.8 Hz for binaural pulsating beat)
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(42.8, now);
      osc2.connect(filter);
      osc2.start(now);
      this.droneNodes.push(osc2);

      // Sub-harmonic sine (21.4 Hz infrasonic physical rumble)
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(21.4, now);
      subOsc.connect(droneGain);
      subOsc.start(now);
      this.droneNodes.push(subOsc);
    } catch (e) {
      console.warn('[Audio] Failed to synthesize gravitational drone:', e);
    }
  }
}

export const soundFx = new SoundEngine();

export function playGravitationalDrone(enable = true) {
  soundFx.playGravitationalDrone(enable);
}
