/**
 * Procedural Web Audio synthesizer for Lantern Lane.
 * Warm celestial chimes, harmonic shield rings, ghost whooshes, and gong impacts.
 */

const PENTATONIC_HZ = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];

export class LanternAudio {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMuted(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        try {
          this.ctx = new AudioCtor();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private getReadyCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  public playCatch(streak: number, isRadiant: boolean): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const noteIndex = Math.min(PENTATONIC_HZ.length - 1, Math.max(0, (streak - 1) % PENTATONIC_HZ.length));
    const jitter = 0.97 + Math.random() * 0.06;
    const baseFreq = PENTATONIC_HZ[noteIndex] * jitter;

    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.03, now + 0.14);

    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(baseFreq * 2, now);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(isRadiant ? 0.11 : 0.05, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isRadiant ? 0.19 : 0.13, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (isRadiant ? 0.42 : 0.24));

    osc.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + (isRadiant ? 0.44 : 0.26));
    overtone.stop(now + (isRadiant ? 0.44 : 0.26));

    if (isRadiant) {
      // Shimmering fifth chime for radiant gold lanterns
      const fifth = ctx.createOscillator();
      const fifthGain = ctx.createGain();
      fifth.type = 'sine';
      fifth.frequency.setValueAtTime(baseFreq * 1.5, now + 0.055);
      fifthGain.gain.setValueAtTime(0.001, now + 0.055);
      fifthGain.gain.linearRampToValueAtTime(0.12, now + 0.075);
      fifthGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
      fifth.connect(fifthGain);
      fifthGain.connect(ctx.destination);
      fifth.start(now + 0.055);
      fifth.stop(now + 0.46);
    }
  }

  public playHit(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(54, now + 0.28);

    sub.type = 'sine';
    sub.frequency.setValueAtTime(98, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.34);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.32);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    sub.start(now);
    osc.stop(now + 0.38);
    sub.stop(now + 0.38);
  }

  public playShieldBlock(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [440, 659.25, 987.77];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.02);
      osc.frequency.exponentialRampToValueAtTime(f * 1.12, now + 0.25);

      gain.gain.setValueAtTime(0.001, now + idx * 0.02);
      gain.gain.linearRampToValueAtTime(0.11, now + idx * 0.02 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.02);
      osc.stop(now + 0.34);
    });
  }

  public playGhostPhase(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.22);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.42);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  public playLevelClear(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.095;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.48);
    });
  }

  public playDefeat(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [392.0, 329.63, 261.63, 196.0];
    notes.forEach((freq, i) => {
      const t = now + i * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  }

  public playShopPurchase(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    [659.25, 987.77].forEach((freq, i) => {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.13, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.27);
    });
  }

  public playPowerActivate(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    [440, 659.25, 880].forEach((freq, i) => {
      const t = now + i * 0.035;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.1, t + 0.18);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playCandleShoot(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const jitter = 0.94 + Math.random() * 0.12;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(220 * jitter, now + 0.11);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playEliminateObstacle(): void {
    const ctx = this.getReadyCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const chime = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);

    chime.type = 'triangle';
    chime.frequency.setValueAtTime(740, now);
    chime.frequency.exponentialRampToValueAtTime(1110, now + 0.15);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    chime.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    chime.start(now);
    osc.stop(now + 0.19);
    chime.stop(now + 0.19);
  }
}
