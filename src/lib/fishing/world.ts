import { C } from "./config";
import type { WorldStore } from "./storage";
import type { TimePhase, WeatherId } from "./types";
import { randRange } from "./utils";

/** Real seconds it takes one in-game day to pass while fishing. */
export const DAY_SECONDS = 360;
const MINUTES_PER_SECOND = 1440 / DAY_SECONDS;

/** How long a weather front lasts, in in-game minutes. */
const WEATHER_MIN = 120;
const WEATHER_MAX = 240;

export interface WeatherDef {
  id: WeatherId;
  /** Weight multiplier for rare fish. */
  rare: number;
  /** Weight multiplier for common fish. */
  common: number;
  /** 0..1 rain amount. */
  rain: number;
  /** 0..1 fog amount. */
  fog: number;
  /** Extra darkening on top of the time-of-day palette. */
  dark: number;
  /** Lightning strikes possible. */
  flash: boolean;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear: {
    id: "clear",
    rare: 0.9,
    common: 1.12,
    rain: 0,
    fog: 0,
    dark: 0,
    flash: false,
  },
  overcast: {
    id: "overcast",
    rare: 1,
    common: 1,
    rain: 0,
    fog: 0.08,
    dark: 0.1,
    flash: false,
  },
  rain: {
    id: "rain",
    rare: 1.22,
    common: 0.92,
    rain: 0.65,
    fog: 0.12,
    dark: 0.18,
    flash: false,
  },
  storm: {
    id: "storm",
    rare: 1.5,
    common: 0.78,
    rain: 1,
    fog: 0.06,
    dark: 0.3,
    flash: true,
  },
  fog: {
    id: "fog",
    rare: 1.16,
    common: 1,
    rain: 0,
    fog: 1,
    dark: 0.06,
    flash: false,
  },
};

export const WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];

/** Weather does not jump at random: each front has likely successors. */
const TRANSITIONS: Record<WeatherId, Array<[WeatherId, number]>> = {
  clear: [
    ["clear", 0.4],
    ["overcast", 0.38],
    ["fog", 0.12],
    ["rain", 0.1],
  ],
  overcast: [
    ["overcast", 0.3],
    ["clear", 0.25],
    ["rain", 0.3],
    ["fog", 0.15],
  ],
  rain: [
    ["rain", 0.34],
    ["overcast", 0.3],
    ["storm", 0.24],
    ["clear", 0.12],
  ],
  storm: [
    ["storm", 0.4],
    ["rain", 0.45],
    ["overcast", 0.15],
  ],
  fog: [
    ["fog", 0.3],
    ["clear", 0.3],
    ["overcast", 0.4],
  ],
};

function pickWeather(current: WeatherId): WeatherId {
  const options = TRANSITIONS[current];
  let roll = Math.random();
  for (const [id, weight] of options) {
    roll -= weight;
    if (roll <= 0) return id;
  }
  return options[options.length - 1][0];
}

export interface WorldPalette {
  /** Multiplies the water, shore, scenery and angler. */
  tint: number;
  /** Colour of the light wash drawn over the scene. */
  overlay: number;
  overlayAlpha: number;
  /** 0..1 star and moon visibility. */
  stars: number;
  /** 0..1 lantern / firefly glow. */
  lantern: number;
  /** Water colours for the minigame column. */
  water: number;
  deep: number;
}

const DAY: WorldPalette = {
  tint: 0xffffff,
  overlay: 0xffffff,
  overlayAlpha: 0,
  stars: 0,
  lantern: 0,
  water: C.ocean,
  deep: C.deep,
};

const NIGHT: WorldPalette = {
  tint: 0x8fa2d6,
  overlay: 0x0a1230,
  overlayAlpha: 0.34,
  stars: 1,
  lantern: 0.9,
  water: 0x1a3f70,
  deep: 0x102a55,
};

const DAWN: WorldPalette = {
  tint: 0xf0d2c4,
  overlay: 0xff8a4a,
  overlayAlpha: 0.14,
  stars: 0.14,
  lantern: 0.34,
  water: 0x2a6494,
  deep: 0x1d4a7c,
};

const DUSK: WorldPalette = {
  tint: 0xf0c2ad,
  overlay: 0xff5f3a,
  overlayAlpha: 0.17,
  stars: 0.36,
  lantern: 0.5,
  water: 0x2c5d8c,
  deep: 0x1d4370,
};

const KEYFRAMES: Array<{ hour: number; palette: WorldPalette }> = [
  { hour: 0, palette: NIGHT },
  { hour: 4.2, palette: NIGHT },
  { hour: 6.2, palette: DAWN },
  { hour: 9, palette: DAY },
  { hour: 16.2, palette: DAY },
  { hour: 18.2, palette: DUSK },
  { hour: 20.4, palette: NIGHT },
  { hour: 24, palette: NIGHT },
];

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function lerpPalette(
  a: WorldPalette,
  b: WorldPalette,
  t: number,
): WorldPalette {
  return {
    tint: lerpColor(a.tint, b.tint, t),
    overlay: lerpColor(a.overlay, b.overlay, t),
    overlayAlpha: a.overlayAlpha + (b.overlayAlpha - a.overlayAlpha) * t,
    stars: a.stars + (b.stars - a.stars) * t,
    lantern: a.lantern + (b.lantern - a.lantern) * t,
    water: lerpColor(a.water, b.water, t),
    deep: lerpColor(a.deep, b.deep, t),
  };
}

export function paletteAt(minutes: number): WorldPalette {
  const hour = (((minutes % 1440) + 1440) % 1440) / 60;
  for (let i = 0; i < KEYFRAMES.length - 1; i += 1) {
    const from = KEYFRAMES[i];
    const to = KEYFRAMES[i + 1];
    if (hour >= from.hour && hour <= to.hour) {
      const t =
        to.hour === from.hour ? 0 : (hour - from.hour) / (to.hour - from.hour);
      return lerpPalette(from.palette, to.palette, t);
    }
  }
  return NIGHT;
}

export function phaseAt(minutes: number): TimePhase {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m < 300) return "night";
  if (m < 480) return "dawn";
  if (m < 1020) return "day";
  if (m < 1200) return "dusk";
  return "night";
}

export function clockLabel(minutes: number): string {
  const m = Math.round(((minutes % 1440) + 1440) % 1440);
  const hh = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Persistent world clock. Time only moves while the player is fishing, so the
 * menu always shows the moment the last session ended.
 */
export class WorldClock {
  private readonly store: WorldStore;
  private minutesValue: number;
  private weatherValue: WeatherId;
  private weatherRemaining: number;

  constructor(store: WorldStore) {
    this.store = store;
    const saved = store.read();
    this.minutesValue =
      saved && Number.isFinite(saved.minutes) ? saved.minutes : 7 * 60 + 30;
    this.weatherValue =
      saved && saved.weather in WEATHER
        ? (saved.weather as WeatherId)
        : "clear";
    this.weatherRemaining = randRange(WEATHER_MIN, WEATHER_MAX);
  }

  get minutes(): number {
    return this.minutesValue;
  }

  get phase(): TimePhase {
    return phaseAt(this.minutesValue);
  }

  get palette(): WorldPalette {
    return paletteAt(this.minutesValue);
  }

  get weather(): WeatherId {
    return this.weatherValue;
  }

  get weatherDef(): WeatherDef {
    return WEATHER[this.weatherValue];
  }

  get label(): string {
    return clockLabel(this.minutesValue);
  }

  /**
   * Advances the world. Returns the new weather id when a front changes, so
   * callers can play a sound or persist immediately.
   */
  update(dt: number): WeatherId | null {
    this.minutesValue = (this.minutesValue + dt * MINUTES_PER_SECOND) % 1440;
    this.weatherRemaining -= dt * MINUTES_PER_SECOND;
    if (this.weatherRemaining > 0) return null;
    const next = pickWeather(this.weatherValue);
    this.weatherValue = next;
    this.weatherRemaining = randRange(WEATHER_MIN, WEATHER_MAX);
    return next;
  }

  persist(): void {
    this.store.write(Math.round(this.minutesValue), this.weatherValue);
  }

  /** Debug / preview hook. */
  setTime(minutes: number): void {
    this.minutesValue = ((minutes % 1440) + 1440) % 1440;
  }

  /** Debug / preview hook. */
  setWeather(weather: WeatherId): void {
    this.weatherValue = weather;
    this.weatherRemaining = randRange(WEATHER_MIN, WEATHER_MAX);
  }
}
