import type { AreaId, WeatherId } from "./types";
import { AUDIO_MIX, type AudioMix, type MixChannel, mixWith } from "./audioMix";

/**
 * Curated Stardew Valley cues, flattened into `assets/fishing/sounds`.
 * Ambient loops are started through the same Web Audio graph so muting and
 * page visibility keep working without extra DOM audio elements.
 *
 * Every gain comes from {@link AUDIO_MIX} (see `audioMix.ts`) rather than from
 * the call site: the dev panel edits that table live and can write it back.
 */
const SOUND_FILES = {
  select: "select.wav",
  button: "button.wav",
  cancel: "cancel.wav",
  blip1: "blip1.wav",
  blip3: "blip3.wav",
  cast: "cast.wav",
  waterScoop: "water-scoop.wav",
  bob: "bob.wav",
  bite: "bite.wav",
  escape: "escape.wav",
  reel: "reel.wav",
  waterLap: "water-lap.wav",
  achievement: "achievement.wav",
  reward: "reward.wav",
  lineSnap: "line-snap.wav",
  shiny: "shiny.wav",
  crit: "crit.wav",
  jingle: "jingle1.wav",
  thud: "thud.wav",
  newRecord: "new-record.wav",
  ambBrook: "amb-brook.wav",
  ambPool: "amb-pool.wav",
  ambOcean: "amb-ocean.wav",
  ambWinter: "amb-winter.wav",
  ambFrost: "amb-frost.wav",
} as const;

type SoundName = keyof typeof SOUND_FILES;

/**
 * Interface cues are the only sounds a menu can make, so they are the only
 * ones fetched on the first gesture. Loading the whole pack there used to
 * download ~6 MB before the player had even started a round.
 */
const UI_CUES: readonly SoundName[] = [
  "select",
  "button",
  "cancel",
  "blip1",
  "blip3",
];

/** Everything the cast/fight flow can trigger; fetched when a round starts. */
const ROUND_CUES: readonly SoundName[] = [
  "cast",
  "waterScoop",
  "bob",
  "bite",
  "escape",
  "reel",
  "waterLap",
  "achievement",
  "reward",
  "lineSnap",
  "shiny",
  "crit",
  "jingle",
  "thud",
  "newRecord",
];

/**
 * A looping ambience bed. `rate` picks the pace, `cutoff` darkens the source
 * and `level` normalizes its loudness.
 *
 * The Stardew ambience files are not mixed to a common reference: the brook
 * measures 0.005 RMS, the pool and the ocean 0.032–0.034, so playing them all
 * at the same gain would make the lake bed seven times louder than the river.
 * `level` is the trim that brings each one to the brook's own level, so the
 * `ambience` fader means the same thing in every location.
 */
interface BedDef {
  file: SoundName;
  rate: number;
  level: number;
  /** Low-pass cutoff in Hz; a still lake or thick fog is darker than a river. */
  cutoff?: number;
}

/**
 * One water bed per water body. A single brook loop for all three locations
 * was the original sound of the lake and the sea as well, and a rushing stream
 * under still water reads as a waterfall behind the picture. The lake now laps
 * slowly, the river runs and the sea swells.
 */
const WATER_BED_BY_AREA: Record<AreaId, BedDef> = {
  // Still water: the pool's lazy laps, slowed and low-passed until the surface
  // barely moves.
  deep: { file: "ambPool", rate: 0.8, level: 0.15, cutoff: 900 },
  // The reference bed: a shallow, quick stream.
  rapids: { file: "ambBrook", rate: 1, level: 1 },
  // Open sea: long waves, full-range but a touch slower than the source.
  cove: { file: "ambOcean", rate: 0.95, level: 0.16, cutoff: 5000 },
};

/**
 * One bed per weather front, layered under the water. A frozen lake has no
 * rain or thunder in it, so the fronts are told by wind and air: bare winter
 * air when the sky is clear, a cold wind that thickens with the snowfall, and
 * a mute, low-passed wind in fog.
 */
const WEATHER_BED: Record<WeatherId, BedDef> = {
  clear: { file: "ambWinter", rate: 1, level: 0.7 },
  overcast: { file: "ambFrost", rate: 0.85, level: 0.06, cutoff: 1500 },
  snow: { file: "ambFrost", rate: 0.95, level: 0.09, cutoff: 3000 },
  blizzard: { file: "ambFrost", rate: 1.08, level: 0.16 },
  fog: { file: "ambFrost", rate: 0.68, level: 0.05, cutoff: 700 },
};

/**
 * The reel is a sustain, not a one-shot: while the player holds the line the
 * sample loops instead of retriggering, because overlapping copies of a
 * one-second texture detune against each other and read as the sound
 * "doubling".
 *
 * `[REEL_LOOP_START, REEL_LOOP_END]` is the part of `reel.wav` that joins on
 * itself: both edges land in the pause between two ratchet clicks (measured RMS
 * 0.002 and peak under 0.01 either side), so the seam sits below the sample's
 * own bite-to-bite jitter and the loop does not pulse once per revolution. The
 * window is deliberately longer than the old 0.28 s one: the source spins up
 * from 30 ms clicks to 13 ms ones, so a wider slice spreads that drift over a
 * longer stretch instead of repeating a two-click tic.
 *
 * The rate carries both pitch and tempo: one `playbackRate` cannot lift the
 * crank's note without also spinning the ratchet faster. At 1.0 the reel sits
 * at the sample's own pitch — a semitone and a half above the slowed take that
 * came before it — while still turning slower than the pack's 1.15, and the
 * loop below is long enough that the faster cadence does not read as a tic.
 */
const REEL_LOOP_START = 0.34;
const REEL_LOOP_END = 0.663;
const REEL_RATE = 1.0;
/** Fade on the loop edges so holding and releasing the line never clicks. */
const REEL_FADE = 0.06;

/**
 * Charge wind-up. The old charge looped a slice of `cast.wav`; the whoosh is
 * an impact, not a texture, so the seam and the sample's own noise made the
 * held note pulse and buzz. The wind-up is now synthesized: a two-second noise
 * buffer (seamless by nature) runs through a band-pass, and the band climbs as
 * the meter fills. A filter opening over noise reads as air being pulled past
 * the rod instead of an interface beep, and it can be held for as long as the
 * meter is pumped without ever repeating an envelope.
 */
const CHARGE_NOISE_SECONDS = 2;
const CHARGE_FILTER_MIN = 520;
const CHARGE_FILTER_MAX = 2100;
const CHARGE_FILTER_Q = 1.1;
/**
 * Low cut under the wind-up, in Hz.
 *
 * The band-pass alone is a wide bell (Q 1.1 at 520 Hz passes everything down to
 * roughly 285 Hz), and all of that bottom end is rumble: a held note with a
 * fuzzy low hum under it, which is the part the ear finds tiring on a two-second
 * charge. A gentle 12 dB/octave high-pass takes the rumble out and leaves the
 * airy band the cue is made of: measured on the rendered chain it drops the
 * energy below 250 Hz by about 4 dB while the cue's overall level stays put.
 */
const CHARGE_HIGHPASS = 500;
const CHARGE_HIGHPASS_Q = 0.8;
/** Quietest end of the wind-up, as a share of the channel's peak gain. */
const CHARGE_MIN_RATIO = 0.55;
const CHARGE_FADE = 0.05;

/**
 * Silent lead-in a cue may keep, in seconds, and how much of it is handed back
 * so the attack is not chopped. See `AudioKit.trimLeadIn`.
 */
const LEAD_IN_LIMIT = 0.05;
const LEAD_IN_KEEP = 0.012;
/** Level that counts as the start of the sound, relative to the cue's peak. */
const LEAD_IN_GATE = 0.02;
/**
 * A lone sample over the gate is a tick, not an onset (the cast cue has one):
 * the sound counts as started once two hits land inside this window, in
 * seconds.
 */
const LEAD_IN_WINDOW = 0.01;
/**
 * Overlap between the wind-up and the throw, in seconds.
 *
 * Releasing the cast used to stop the wind-up on the same frame the whoosh
 * started, so the air being pulled past the rod was cut off under a sound that
 * began at full level: two edits, heard as one click. The wind-up now fades out
 * while the throw has already begun, and it closes its band on the way down, so
 * the air falls away under the whoosh instead of stopping at full pitch.
 */
const CAST_BLEND = 0.22;

/**
 * Perfect-catch jingle: how it sits against the fanfare.
 *
 * The jingle is a reply, not a second announcement, so it comes in under the
 * fanfare's own level and a fifteenth of a second after it.
 */
const PERFECT_JINGLE_DELAY = 0.15;
const PERFECT_JINGLE_LEVEL = 0.7;

interface AmbientVoice {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  def: BedDef;
}

interface CueVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface ChargeVoice extends CueVoice {
  filter: BiquadFilterNode;
}

export class AudioKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /**
   * Everything the round itself makes — the ambience beds, the fight cues, the
   * float — hangs off this bus instead of the master. The pause menu pulls it
   * to zero, so a paused round goes quiet (including a bed that is still
   * crossfading) while the menu's own clicks stay audible.
   */
  private world: GainNode | null = null;
  private paused = false;
  private muted: boolean;
  private readonly base: string;
  private mix: AudioMix;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly loading = new Map<SoundName, Promise<AudioBuffer | null>>();
  /** The looping reel texture, present while the player holds the line. */
  private reelLoop: CueVoice | null = null;
  /** The looping charge wind-up, present while the cast is being wound up. */
  private chargeLoop: ChargeVoice | null = null;
  /** The water bed of the current location. */
  private waterBed: AmbientVoice | null = null;
  private waterWanted: AreaId | null = null;
  private waterToken = 0;
  /** The weather bed layered under the water bed. */
  private weatherBed: AmbientVoice | null = null;
  private weatherWanted: WeatherId | null = null;
  private weatherToken = 0;
  /** Lazily built looping noise for the charge; one buffer for the session. */
  private noise: AudioBuffer | null = null;
  /**
   * Timers that release the loops `preview()` starts.
   *
   * They used to share one field, so auditioning any other channel cleared the
   * release of the wind-up or the reel and that loop played on forever: the
   * panel is used to compare cues, so pressing the next one is the normal case,
   * not an edge case. One timer per looping cue keeps every release alive.
   */
  private chargePreviewTimer = 0;
  private reelPreviewTimer = 0;

  constructor(muted: boolean, assetBase: string, mix?: Partial<AudioMix>) {
    this.muted = muted;
    this.base = `${assetBase}/sounds`;
    this.mix = mixWith(mix ?? null);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Snapshot of the current balance, used by the dev panel. */
  get mixValues(): AudioMix {
    return { ...this.mix };
  }

  /**
   * Replaces the whole balance. Live loops and the master bus follow
   * immediately, so a slider is audible while it is being dragged.
   */
  setMix(mix: Partial<AudioMix>): void {
    this.mix = mixWith({ ...this.mix, ...mix });
    this.applyMaster();
    this.applyBedGains();
    if (this.reelLoop && this.ctx) {
      this.reelLoop.gain.gain.setTargetAtTime(
        this.mix.reel,
        this.ctx.currentTime,
        0.03,
      );
    }
  }

  setChannel(channel: MixChannel, value: number): void {
    this.setMix({ [channel]: value });
  }

  get defaultMix(): AudioMix {
    return { ...AUDIO_MIX };
  }

  private applyMaster(): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.mix.master,
      this.ctx.currentTime,
      0.02,
    );
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster();
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
      master.gain.value = this.muted ? 0 : this.mix.master;
      master.connect(ctx.destination);
      const world = ctx.createGain();
      world.gain.value = this.paused ? 0 : 1;
      world.connect(master);
      this.ctx = ctx;
      this.master = master;
      this.world = world;
      void this.preloadUi();
      if (this.waterWanted) void this.applyWater(this.waterWanted);
      if (this.weatherWanted) void this.applyWeather(this.weatherWanted);
    } catch {
      this.ctx = null;
    }
  }

  /** The node gameplay audio connects to; the master bus for interface cues. */
  private bus(ui: boolean): AudioNode | null {
    return ui ? this.master : (this.world ?? this.master);
  }

  /**
   * Silences the round for as long as the pause overlay is up, menus included.
   * Interface cues bypass this bus, so the pause menu still answers a click.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.world || !this.ctx) return;
    this.world.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, 0.04);
  }

  private async load(name: SoundName): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const pending = this.loading.get(name);
    if (pending) return pending;

    const ctx = this.ctx;
    if (!ctx) return null;

    const promise = (async () => {
      try {
        const response = await fetch(`${this.base}/${SOUND_FILES[name]}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(data);
        // Loop beds keep their exact length: trimming their head would move
        // the loop point and put a seam in the ambience.
        const trimmed = name.startsWith("amb")
          ? buffer
          : this.trimLeadIn(buffer);
        this.buffers.set(name, trimmed);
        return trimmed;
      } catch (error) {
        console.warn(`[fishing] sound failed: ${SOUND_FILES[name]}`, error);
        return null;
      } finally {
        this.loading.delete(name);
      }
    })();
    this.loading.set(name, promise);
    return promise;
  }

  private preloadUi(): void {
    for (const name of UI_CUES) void this.load(name);
  }

  /**
   * Warms the gameplay cues when a round begins. They arrive within the first
   * second of the cast, and anything still in flight is awaited by `play`, so
   * a slow download delays one cue instead of the whole pack.
   */
  preloadRound(): void {
    for (const name of ROUND_CUES) void this.load(name);
  }

  /**
   * Cuts a dead lead-in off a sample.
   *
   * `cast.wav` opens with about 140 ms below −50 dB, so the whoosh arrives a
   * beat after the release and the cast feels late. The trim is measured on the
   * sample rather than hard-coded per file: a cue with more than
   * {@link LEAD_IN_LIMIT} of silence loses it, a cue that starts promptly keeps
   * its own timing, and a short lead is kept so the attack is never chopped.
   */
  private trimLeadIn(buffer: AudioBuffer): AudioBuffer {
    const start = this.leadInSamples(buffer);
    const ctx = this.ctx;
    if (start <= 0 || !ctx) return buffer;
    const trimmed = ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length - start,
      buffer.sampleRate,
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      trimmed.copyToChannel(
        buffer.getChannelData(channel).subarray(start),
        channel,
      );
    }
    return trimmed;
  }

  /** Samples of silent lead to drop; 0 when the cue starts promptly. */
  private leadInSamples(buffer: AudioBuffer): number {
    const channels: Float32Array[] = [];
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      channels.push(buffer.getChannelData(channel));
    }
    if (channels.length === 0) return 0;

    let peak = 0;
    for (const data of channels) {
      for (let i = 0; i < data.length; i += 1) {
        const value = Math.abs(data[i]);
        if (value > peak) peak = value;
      }
    }
    // −34 dB below the cue's own peak: quiet room tone is still "nothing" by
    // ear, while the first real transient is a whole order of magnitude louder.
    const gate = peak * LEAD_IN_GATE;
    if (gate <= 0) return 0;

    // One sample over the gate is a tick: the onset is the first hit that is
    // answered by another inside a short window.
    const data0 = channels[0];
    const window = Math.max(1, Math.round(LEAD_IN_WINDOW * buffer.sampleRate));
    let pending = -1;
    let onset = -1;
    for (let i = 0; i < data0.length; i += 1) {
      let loud = false;
      for (const data of channels) {
        if (data[i] > gate || data[i] < -gate) {
          loud = true;
          break;
        }
      }
      if (!loud) continue;
      if (pending >= 0 && i - pending <= window) {
        onset = pending;
        break;
      }
      pending = i;
    }
    if (onset < 0) return 0;

    const keep = Math.round(LEAD_IN_KEEP * buffer.sampleRate);
    const drop = onset - keep;
    const minimum = Math.round(
      (LEAD_IN_LIMIT + LEAD_IN_KEEP) * buffer.sampleRate,
    );
    return drop >= minimum ? drop : 0;
  }

  private start(
    buffer: AudioBuffer,
    volume: number,
    rate: number,
    delay = 0,
    ui = false,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    const out = this.bus(ui);
    if (!ctx || !master || !out) return;
    const at = ctx.currentTime + Math.max(0, delay);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(out);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    // Web Audio schedules the start, so a two-note cue needs no timers.
    source.start(at);
  }

  private play(
    name: SoundName,
    volume: number,
    rate = 1,
    delay = 0,
    ui = false,
  ): void {
    if (this.muted || !this.ctx) return;
    const buffer = this.buffers.get(name);
    if (buffer) {
      this.start(buffer, volume, rate, delay, ui);
      return;
    }
    void this.load(name).then((loaded) => {
      if (!loaded || this.muted) return;
      this.start(loaded, volume, rate, delay, ui);
    });
  }

  // ------------------------------------------------------------ interface

  hover(): void {
    this.play("select", this.mix.hover, 1 + Math.random() * 0.06, 0, true);
  }

  click(): void {
    this.play("button", this.mix.click, 1 + Math.random() * 0.04, 0, true);
  }

  back(): void {
    this.play("cancel", this.mix.back, 1, 0, true);
  }

  // --------------------------------------------------------------- fishing

  cast(): void {
    this.play("cast", this.mix.cast, 1 + Math.random() * 0.03);
    // The throw owns the hand-over: the whoosh is already sounding when the
    // wind-up starts to leave, so the two overlap for {@link CAST_BLEND}.
    this.stopCharge(CAST_BLEND);
  }

  splash(): void {
    this.play("waterScoop", this.mix.splash, 1 + Math.random() * 0.05);
  }

  /** Bobber touches the water. */
  plop(): void {
    this.play("bob", this.mix.plop, 1 + Math.random() * 0.04);
  }

  bite(): void {
    this.play("bite", this.mix.bite);
  }

  hook(): void {
    this.play("jingle", this.mix.hook);
  }

  /** Reel handle: loops while the player is pulling the line. */
  startReel(): void {
    if (this.reelLoop || !this.ctx) return;
    const buffer = this.buffers.get("reel");
    if (!buffer) {
      void this.load("reel").then((loaded) => {
        if (loaded) this.startReel();
      });
      return;
    }
    const ctx = this.ctx;
    const out = this.bus(false);
    if (!ctx || !out) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = REEL_LOOP_START;
    source.loopEnd = REEL_LOOP_END;
    source.playbackRate.value = REEL_RATE;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.mix.reel, now + REEL_FADE);
    source.connect(gain);
    gain.connect(out);
    source.start(now, REEL_LOOP_START);
    this.reelLoop = { source, gain };
  }

  /** Releases the reel handle: the loop fades out instead of cutting off. */
  stopReel(): void {
    const loop = this.reelLoop;
    const ctx = this.ctx;
    if (!loop || !ctx) return;
    this.reelLoop = null;
    const now = ctx.currentTime;
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setTargetAtTime(0, now, REEL_FADE / 3);
    try {
      loop.source.stop(now + REEL_FADE + 0.02);
    } catch {
      // Already stopped.
    }
  }

  /**
   * Charge wind-up: filtered noise, held for as long as the player pumps the
   * meter. `setCharge` opens the filter and raises the level as it fills.
   */
  startCharge(): void {
    if (this.chargeLoop || !this.ctx) return;
    const ctx = this.ctx;
    const out = this.bus(false);
    if (!ctx || !out) return;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = CHARGE_FILTER_Q;
    filter.frequency.value = CHARGE_FILTER_MIN;
    // The low cut sits after the band, so `setCharge` can keep sweeping the
    // band without ever opening the rumble back up.
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = CHARGE_HIGHPASS;
    highpass.Q.value = CHARGE_HIGHPASS_Q;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      this.mix.charge * CHARGE_MIN_RATIO,
      now + CHARGE_FADE,
    );
    source.connect(filter);
    filter.connect(highpass);
    highpass.connect(gain);
    gain.connect(out);
    source.start(now);
    this.chargeLoop = { source, gain, filter };
  }

  /** @param charge 0..1 fill of the power meter. */
  setCharge(charge: number): void {
    const loop = this.chargeLoop;
    const ctx = this.ctx;
    if (!loop || !ctx) return;
    const t = Math.max(0, Math.min(1, charge));
    const now = ctx.currentTime;
    const cutoff =
      CHARGE_FILTER_MIN + (CHARGE_FILTER_MAX - CHARGE_FILTER_MIN) * t;
    const peak = this.mix.charge;
    const volume = peak * (CHARGE_MIN_RATIO + (1 - CHARGE_MIN_RATIO) * t);
    loop.filter.frequency.setTargetAtTime(cutoff, now, 0.05);
    loop.gain.gain.setTargetAtTime(volume, now, 0.08);
  }

  /** The session's looping noise bed, built on first use. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const length = Math.floor(ctx.sampleRate * CHARGE_NOISE_SECONDS);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 1.4 - 0.7;
    this.noise = buffer;
    return buffer;
  }

  /**
   * Stops the wind-up.
   *
   * @param release Seconds the wind-up takes to leave. The default is the short
   * attack fade used when the cast is abandoned; a throw passes
   * {@link CAST_BLEND} so the whoosh takes over from a sound that is still
   * there, instead of replacing one that has already gone.
   */
  stopCharge(release = CHARGE_FADE): void {
    const loop = this.chargeLoop;
    const ctx = this.ctx;
    if (!loop || !ctx) return;
    this.chargeLoop = null;
    const now = ctx.currentTime;
    const fade = Math.max(0.012, release);
    const gain = loop.gain.gain;
    const filter = loop.filter.frequency;
    // A straight ramp to zero: an exponential approach leaves a tail that the
    // throw then has to cover, and the two tails read as a buzz.
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + fade);
    // The band closes as the wind-up leaves, so the pitch falls away with it.
    filter.cancelScheduledValues(now);
    filter.setValueAtTime(filter.value, now);
    filter.linearRampToValueAtTime(CHARGE_FILTER_MIN * 0.6, now + fade);
    try {
      loop.source.stop(now + fade + 0.02);
    } catch {
      // Already stopped.
    }
  }

  nibble(): void {
    this.play("waterLap", this.mix.nibble, 1 + Math.random() * 0.06);
  }

  catchFish(perfect: boolean): void {
    if (!perfect) {
      this.play("reward", this.mix.catchCommon);
      return;
    }
    this.play("achievement", this.mix.catchPerfect);
    // The perfect catch is the one moment the game is allowed to show off, so
    // the fanfare is answered by a short jingle a beat later. The delay is what
    // makes it read as a flourish: played together the two cues just sound
    // louder, played apart the second one lands as a reply.
    this.play(
      "jingle",
      this.mix.catchPerfect * PERFECT_JINGLE_LEVEL,
      1,
      PERFECT_JINGLE_DELAY,
    );
  }

  escape(): void {
    this.play("escape", this.mix.escape);
  }

  /**
   * Telegraph: a strong dash is about to happen.
   *
   * The dash is announced by the bright `crit` chime. It is the one cue in the
   * mix with a hard, high onset, so it cuts through a fight that already has a
   * reel sustain under it, and it is over before the dash resolves — the ear
   * gets the warning without the sound running into the move it announces.
   */
  warn(): void {
    this.play("crit", this.mix.warn, 1 + Math.random() * 0.04);
  }

  /**
   * Successful counter-pull: the rod snaps the line taut and the dash is
   * cancelled.
   *
   * A quarter-second, very bright swipe. The metallic parry that used to play
   * here is a sword block — it is the single most out-of-place cue in a
   * fishing fight.
   */
  counter(): void {
    this.play("lineSnap", this.mix.counter, 1 + Math.random() * 0.03);
  }

  /** The fish is tired and can be landed. */
  ready(): void {
    this.play("shiny", this.mix.ready);
  }

  /**
   * Landing window opened: RMB/F or a tap on the tired fish now lands it.
   *
   * It is the bite, note for note: the same cue that told the player "a fish is
   * on" is the one that now tells them "it is spent, take it". That keeps the
   * round to one signal for "act now" instead of asking the ear to learn a
   * second one at the exact moment the hands have to move.
   */
  landReady(): void {
    this.play("bite", this.mix.landReady);
  }

  /** Quiet reminder while the landing window stays open. */
  landTick(): void {
    this.play("blip1", this.mix.landTick, 1.9);
  }

  /** Soft tick when the charge enters the luck zone. */
  zoneTick(): void {
    this.play("blip1", this.mix.landTick * 0.6, 1.9);
  }

  /** Landing strike attempted too early. */
  resist(): void {
    this.play("thud", this.mix.resist);
  }

  /** Grip reserve burned out: the line tears loose for a moment. */
  gripOut(): void {
    this.play("escape", this.mix.gripOut);
  }

  /**
   * Landing inside the luck zone: a short, quiet sparkle, not a coin jingle.
   */
  luck(): void {
    this.play("shiny", this.mix.luck, 1.08);
  }

  comboBreak(): void {
    this.play("cancel", this.mix.comboBreak);
  }

  newRecord(): void {
    this.play("newRecord", this.mix.newRecord);
  }

  /**
   * Plays one channel's cue, for the dev panel: every fader can be heard on
   * its own without waiting for the game to trigger it.
   *
   * The two looping cues are auditioned for a fixed stretch and then released.
   * Their release timers are per cue, so auditioning the next channel never
   * strands a loop: the earlier one still stops on its own schedule.
   */
  preview(channel: MixChannel): void {
    switch (channel) {
      case "hover":
        this.hover();
        break;
      case "click":
        this.click();
        break;
      case "back":
        this.back();
        break;
      case "cast":
        this.cast();
        break;
      case "charge":
        // Re-auditioning restarts the loop from its own release, not from a
        // release that was already scheduled.
        window.clearTimeout(this.chargePreviewTimer);
        this.stopCharge();
        this.startCharge();
        this.setCharge(0.8);
        this.chargePreviewTimer = window.setTimeout(() => {
          this.chargePreviewTimer = 0;
          this.stopCharge();
        }, 520);
        break;
      case "splash":
        this.splash();
        break;
      case "plop":
        this.plop();
        break;
      case "bite":
        this.bite();
        break;
      case "nibble":
        this.nibble();
        break;
      case "hook":
        this.hook();
        break;
      case "reel":
        window.clearTimeout(this.reelPreviewTimer);
        this.stopReel();
        this.startReel();
        this.reelPreviewTimer = window.setTimeout(() => {
          this.reelPreviewTimer = 0;
          this.stopReel();
        }, 800);
        break;
      case "catchPerfect":
        this.catchFish(true);
        break;
      case "catchCommon":
        this.catchFish(false);
        break;
      case "escape":
        this.escape();
        break;
      case "warn":
        this.warn();
        break;
      case "counter":
        this.counter();
        break;
      case "ready":
        this.ready();
        break;
      case "landReady":
        this.landReady();
        break;
      case "landTick":
        this.landTick();
        break;
      case "resist":
        this.resist();
        break;
      case "gripOut":
        this.gripOut();
        break;
      case "luck":
        this.luck();
        break;
      case "comboBreak":
        this.comboBreak();
        break;
      case "newRecord":
        this.newRecord();
        break;
      case "ambience":
        // The beds are already looping in game; restarting them is the only
        // way to audition the layer from a menu, where no ambience is running.
        if (this.waterWanted) void this.applyWater(this.waterWanted);
        if (this.weatherWanted) void this.applyWeather(this.weatherWanted);
        break;
      case "master":
        this.click();
        break;
    }
  }

  // ------------------------------------------------------------- ambience

  /** Selects the looping water bed for a water body (crossfaded). */
  setAmbience(areaId: AreaId): void {
    this.waterWanted = areaId;
    if (!this.ctx) return;
    void this.applyWater(areaId);
  }

  /**
   * Selects the weather bed, or `null` to fade it out (menus have a water bed
   * but no front over them). Crossfaded like the water bed.
   */
  setWeather(weather: WeatherId | null): void {
    this.weatherWanted = weather;
    if (!this.ctx) return;
    void this.applyWeather(weather);
  }

  private applyBedGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const bed of [this.waterBed, this.weatherBed]) {
      if (!bed) continue;
      bed.gain.gain.setTargetAtTime(
        this.mix.ambience * bed.def.level,
        now,
        0.08,
      );
    }
  }

  private async applyWater(areaId: AreaId): Promise<void> {
    if (this.waterBed?.id === areaId) return;
    await this.replaceBed("water", areaId, WATER_BED_BY_AREA[areaId]);
  }

  private async applyWeather(weather: WeatherId | null): Promise<void> {
    if (this.weatherBed?.id === weather) return;
    await this.replaceBed(
      "weather",
      weather,
      weather ? WEATHER_BED[weather] : null,
    );
  }

  /**
   * Crossfades one bed layer to `def`. Only one of the two layers can be
   * fading at a time in practice, but each keeps its own token so a fast
   * sequence of fronts can never resurrect an older load.
   */
  private async replaceBed(
    layer: "water" | "weather",
    id: string | null,
    def: BedDef | null,
  ): Promise<void> {
    const ctx = this.ctx;
    const out = this.bus(false);
    if (!ctx || !out) return;

    const token = layer === "water" ? ++this.waterToken : ++this.weatherToken;
    const old = layer === "water" ? this.waterBed : this.weatherBed;
    if (layer === "water") this.waterBed = null;
    else this.weatherBed = null;

    if (old) {
      const now = ctx.currentTime;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, 0.35);
      window.setTimeout(() => {
        try {
          old.source.stop();
        } catch {
          // Already stopped.
        }
      }, 1400);
    }

    if (!def) return;

    const buffer = await this.load(def.file);
    const active = layer === "water" ? this.waterToken : this.weatherToken;
    if (token !== active || !buffer || !this.ctx) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = def.rate;

    let head: AudioNode = source;
    if (def.cutoff) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = def.cutoff;
      filter.Q.value = 0.7;
      source.connect(filter);
      head = filter;
    }

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    if (head !== source) source.connect(head);
    head.connect(gain);
    gain.connect(out);
    gain.gain.setTargetAtTime(
      this.mix.ambience * def.level,
      this.ctx.currentTime,
      0.6,
    );
    source.start();

    const voice: AmbientVoice = { id: id ?? "", source, gain, def };
    if (layer === "water") this.waterBed = voice;
    else this.weatherBed = voice;
  }

  destroy(): void {
    window.clearTimeout(this.chargePreviewTimer);
    window.clearTimeout(this.reelPreviewTimer);
    this.stopReel();
    this.stopCharge();
    this.waterBed?.source.stop();
    this.waterBed = null;
    this.weatherBed?.source.stop();
    this.weatherBed = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
      this.world = null;
    }
  }
}
