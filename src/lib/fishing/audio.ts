type Wave = OscillatorType;

/**
 * Tiny procedural sound kit (Web Audio only, no files). The context is created
 * lazily on the first user gesture so browsers do not block playback.
 */
export class AudioKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.5,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!ctor) return;
    try {
      const ctx = new ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.5;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.noiseBuffer = this.makeNoise(ctx);
    } catch {
      this.ctx = null;
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.6);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private tone(
    frequency: number,
    duration: number,
    options: {
      type?: Wave;
      volume?: number;
      delay?: number;
      slideTo?: number;
      attack?: number;
    } = {},
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const start = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type ?? "square";
    osc.frequency.setValueAtTime(frequency, start);
    if (options.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.slideTo),
        start + duration,
      );
    }
    const volume = options.volume ?? 0.18;
    const attack = options.attack ?? 0.006;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(
    duration: number,
    options: {
      volume?: number;
      delay?: number;
      filter?: number;
      filterEnd?: number;
      type?: BiquadFilterType;
    } = {},
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuffer || this.muted) return;
    const start = ctx.currentTime + (options.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = options.type ?? "lowpass";
    filter.frequency.setValueAtTime(options.filter ?? 1600, start);
    if (options.filterEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(60, options.filterEnd),
        start + duration,
      );
    }
    const gain = ctx.createGain();
    const volume = options.volume ?? 0.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  hover(): void {
    this.tone(760, 0.035, { volume: 0.05, type: "triangle" });
  }

  click(): void {
    this.tone(620, 0.06, { slideTo: 480, volume: 0.14 });
  }

  back(): void {
    this.tone(380, 0.08, { slideTo: 260, volume: 0.13, type: "triangle" });
  }

  cast(): void {
    this.noise(0.28, {
      volume: 0.16,
      filter: 700,
      filterEnd: 2600,
      type: "bandpass",
    });
    this.tone(300, 0.22, { slideTo: 720, volume: 0.08, type: "triangle" });
  }

  splash(): void {
    this.noise(0.34, { volume: 0.24, filter: 1800, filterEnd: 240 });
    this.tone(180, 0.2, { slideTo: 90, volume: 0.1, type: "sine" });
  }

  bite(): void {
    this.tone(980, 0.09, { volume: 0.2 });
    this.tone(1320, 0.12, { volume: 0.18, delay: 0.1 });
    this.tone(1320, 0.1, { volume: 0.1, delay: 0.28 });
  }

  hook(): void {
    this.tone(520, 0.1, { slideTo: 880, volume: 0.16, type: "square" });
    this.noise(0.12, { volume: 0.1, filter: 900 });
  }

  reel(): void {
    this.tone(1400, 0.03, { volume: 0.05, type: "square" });
  }

  chargeTick(charge: number): void {
    this.tone(260 + charge * 520, 0.045, {
      volume: 0.035,
      type: "square",
    });
  }

  nibble(): void {
    this.tone(190, 0.055, { volume: 0.07, type: "sine" });
    this.tone(250, 0.04, { volume: 0.04, delay: 0.05, type: "sine" });
  }

  comboBreak(): void {
    this.tone(440, 0.12, {
      slideTo: 220,
      volume: 0.14,
      type: "sawtooth",
    });
    this.tone(330, 0.14, {
      slideTo: 160,
      volume: 0.09,
      delay: 0.07,
      type: "triangle",
    });
  }

  catchFish(perfect: boolean): void {
    const notes = perfect ? [523, 659, 784, 1046, 1318] : [523, 659, 784, 1046];
    notes.forEach((note, index) => {
      this.tone(note, 0.16, {
        volume: 0.13,
        delay: index * 0.075,
        type: "triangle",
      });
    });
    if (perfect) {
      this.tone(1568, 0.3, { volume: 0.08, delay: 0.4, type: "sine" });
    }
  }

  escape(): void {
    [392, 330, 262].forEach((note, index) => {
      this.tone(note, 0.18, {
        volume: 0.13,
        delay: index * 0.11,
        type: "triangle",
      });
    });
  }

  /** Telegraph ping: a strong dash is about to happen. */
  warn(): void {
    this.tone(1180, 0.05, { volume: 0.07, type: "square" });
    this.tone(880, 0.07, { volume: 0.06, delay: 0.05, type: "square" });
  }

  thunder(): void {
    this.noise(1.8, {
      volume: 0.2,
      filter: 320,
      filterEnd: 70,
      type: "lowpass",
    });
    this.tone(64, 1.1, { slideTo: 38, volume: 0.12, type: "sine" });
  }

  newRecord(): void {
    [523, 784, 1046, 1568].forEach((note, index) => {
      this.tone(note, 0.22, {
        volume: 0.1,
        delay: index * 0.1,
        type: "triangle",
      });
    });
  }

  destroy(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
    }
  }
}
