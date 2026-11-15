import type { WorldStore } from "./storage";
import { AREAS } from "./areas";
import type { AreaId, WeatherId } from "./types";
import { formatClock, randRange } from "./utils";

/**
 * The world runs on the player's wall clock: the sky, the lantern and the bite
 * windows all read the same clock as the player's desk, so the lake matches the
 * real time of day. The clock is never saved — only the weather is.
 */

/**
 * How long a weather front lasts, in real seconds. Weather is deliberately
 * faster than the real sky: a session has to see a few fronts, or a rare fish
 * that needs a storm would be unreachable.
 */
const WEATHER_MIN = 75;
const WEATHER_MAX = 150;

/**
 * How many fronts the clock keeps rolled ahead of the live one. The rail shows
 * up to four *periods*, and a period can swallow several fronts when the sky
 * does not change, so the queue is deeper than the number of columns.
 */
const FORECAST_QUEUE = 6;

/** A front that has not arrived yet, with the length it will run. */
interface QueuedFront {
  id: WeatherId;
  duration: number;
}

/** One column of the forecast: a front and when it takes over. */
export interface ForecastStep {
  weather: WeatherId;
  /** Seconds from now until this front starts; 0 for the live one. */
  startsIn: number;
  /** Seconds from now until the next front takes over. */
  endsIn: number;
  /** Full length of this front, in seconds. */
  length: number;
}

export interface WeatherDef {
  id: WeatherId;
  /** Weight multiplier for rare fish. */
  rare: number;
  /** Weight multiplier for common fish. */
  common: number;
  /** 0..1 snowfall amount. */
  snow: number;
  /** 0..1 wind gusts: the blizzard leans on it for its speed. */
  gust: number;
  /** 0..1 fog amount. */
  fog: number;
  /** Extra darkening on top of the time-of-day palette. */
  dark: number;
  /**
   * 0..1 cloud cover. Overcast weather throws drifting cloud shadows over the
   * water; a clear sky has none, and a blizzard is too busy with snow to show
   * them. Also drives the grey wash over the frame.
   */
  cloud: number;
}

/**
 * The five winter fronts. There is no rain and no thunderstorm: this is a
 * frozen lake in the middle of winter, so water only ever falls as snow, and
 * the heaviest weather is a blizzard, not a storm. A thunderstorm over a frozen
 * river was both wrong for the season and drowned the cast sounds.
 */
export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear: {
    id: "clear",
    rare: 0.9,
    common: 1.12,
    snow: 0,
    gust: 0,
    fog: 0,
    dark: 0,
    cloud: 0,
  },
  overcast: {
    id: "overcast",
    rare: 1,
    common: 1,
    snow: 0,
    gust: 0.14,
    fog: 0.08,
    // A flat grey lid is the whole point of the front: it has to read at a
    // glance against a bright clear sky, so it darkens the frame and slides
    // cloud shadows across the water.
    dark: 0.26,
    cloud: 0.9,
  },
  snow: {
    id: "snow",
    rare: 1.22,
    common: 0.92,
    snow: 0.65,
    gust: 0.22,
    fog: 0.12,
    dark: 0.18,
    cloud: 0.35,
  },
  blizzard: {
    id: "blizzard",
    rare: 1.5,
    common: 0.78,
    snow: 1,
    gust: 1,
    fog: 0.06,
    dark: 0.3,
    cloud: 0,
  },
  fog: {
    id: "fog",
    rare: 1.16,
    common: 1,
    snow: 0,
    gust: 0.04,
    fog: 1,
    dark: 0.06,
    cloud: 0.12,
  },
};

export const WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];

/** Weather does not jump at random: each front has likely successors. */
const TRANSITIONS: Record<WeatherId, Array<[WeatherId, number]>> = {
  clear: [
    ["clear", 0.4],
    ["overcast", 0.38],
    ["fog", 0.12],
    ["snow", 0.1],
  ],
  overcast: [
    ["overcast", 0.3],
    ["clear", 0.25],
    ["snow", 0.3],
    ["fog", 0.15],
  ],
  snow: [
    ["snow", 0.34],
    ["overcast", 0.3],
    ["blizzard", 0.24],
    ["clear", 0.12],
  ],
  blizzard: [
    ["blizzard", 0.4],
    ["snow", 0.45],
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

/**
 * Winter dressing shared by the lake scene and the atmosphere. The time of day
 * still works through the palette tint/overlay; these are the base cold colours
 * of the snow, ice and water.
 */
export const WINTER = {
  snow: 0xe8f2f8,
  snowLight: 0xf7fbfd,
  snowShade: 0xc4d9e6,
  snowBlue: 0x9fbed3,
  ice: 0xbfe8f2,
  iceDeep: 0x86c8d8,
  waterNear: 0x3d9aa6,
  waterMid: 0x267d99,
  waterDeep: 0x18587e,
  waterFar: 0x0a3152,
  farShore: 0x213a40,
  farShoreSnow: 0xdcecf4,
  treeDark: 0x173138,
  frost: 0xd9eaf3,
  star: 0xd9e7ff,
  moon: 0xf3f8ff,
  lantern: 0xffc46b,
} as const;

/** Depth stops from the near shore (0) to the far bank (1). */
export const WINTER_WATER_STOPS: ReadonlyArray<{ at: number; color: number }> =
  [
    { at: 0, color: WINTER.waterNear },
    { at: 0.3, color: WINTER.waterMid },
    { at: 0.58, color: WINTER.waterDeep },
    { at: 1, color: WINTER.waterFar },
  ];

const DAY: WorldPalette = {
  tint: 0xf3f9ff,
  overlay: 0xffffff,
  overlayAlpha: 0,
  stars: 0,
  lantern: 0,
  water: WINTER.waterDeep,
  deep: WINTER.waterFar,
};

const NIGHT: WorldPalette = {
  tint: 0x8fa2d6,
  overlay: 0x0a1230,
  overlayAlpha: 0.34,
  stars: 1,
  lantern: 0.9,
  water: 0x143a5c,
  deep: 0x0c2745,
};

const DAWN: WorldPalette = {
  tint: 0xe6e6ea,
  overlay: 0xff8a4a,
  overlayAlpha: 0.12,
  stars: 0.14,
  lantern: 0.34,
  water: 0x21567a,
  deep: 0x174363,
};

const DUSK: WorldPalette = {
  tint: 0xe0d6da,
  overlay: 0xff5f3a,
  overlayAlpha: 0.14,
  stars: 0.36,
  lantern: 0.5,
  water: 0x1d4a6c,
  deep: 0x153a58,
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

export function mixColor(a: number, b: number, t: number): number {
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

/** Smooth cold gradient colour at depth `t` (0 shore .. 1 far bank). */
export function winterWaterAt(
  t: number,
  stops: ReadonlyArray<{ at: number; color: number }> = WINTER_WATER_STOPS,
): number {
  const value = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i];
    const to = stops[i + 1];
    if (value >= from.at && value <= to.at) {
      const span = to.at - from.at;
      const local = span <= 0 ? 0 : (value - from.at) / span;
      return mixColor(from.color, to.color, local);
    }
  }
  return stops[stops.length - 1].color;
}

function lerpPalette(
  a: WorldPalette,
  b: WorldPalette,
  t: number,
): WorldPalette {
  return {
    tint: mixColor(a.tint, b.tint, t),
    overlay: mixColor(a.overlay, b.overlay, t),
    overlayAlpha: a.overlayAlpha + (b.overlayAlpha - a.overlayAlpha) * t,
    stars: a.stars + (b.stars - a.stars) * t,
    lantern: a.lantern + (b.lantern - a.lantern) * t,
    water: mixColor(a.water, b.water, t),
    deep: mixColor(a.deep, b.deep, t),
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

/** Minutes since midnight from the system clock, with sub-minute precision. */
function wallClockMinutes(): number {
  const now = new Date();
  return (
    now.getHours() * 60 +
    now.getMinutes() +
    now.getSeconds() / 60 +
    now.getMilliseconds() / 60_000
  );
}

/**
 * Weather ids this build used to save under the old summer names. The fronts
 * were renamed when the lake froze over, and a player who saved a "rain" front
 * should keep their sky rather than be reset to clear.
 */
const LEGACY_WEATHER: Record<string, WeatherId> = {
  rain: "snow",
  storm: "blizzard",
};

/** A saved front, translated to today's ids and validated against the table. */
function savedWeatherId(raw: unknown): WeatherId {
  if (typeof raw !== "string") return "clear";
  const weather = LEGACY_WEATHER[raw] ?? raw;
  return weather in WEATHER ? (weather as WeatherId) : "clear";
}

/**
 * Persistent weather on top of a real-time clock. Every water body has its own
 * front; fronts advance independently and may well match. The time of day is
 * read from the wall clock, so dawn, dusk and the night bite follow the real
 * world instead of an accelerated in-game day.
 */
export class WorldClock {
  private readonly store: WorldStore;
  /** Debug / preview override; `null` means "follow the wall clock". */
  private pinnedMinutes: number | null = null;
  private readonly weatherValues: Record<AreaId, WeatherId>;
  private readonly weatherRemaining: Record<AreaId, number>;
  /**
   * Full length of the live front, in seconds. The remaining time is what the
   * rail fills against: without the total it could not show how much of the
   * front is left once a round starts mid-front.
   */
  private readonly weatherLength: Record<AreaId, number>;
  /**
   * The fronts queued after the live one, oldest first. They are rolled up
   * front, so the forecast rail can promise what is actually coming instead of
   * re-rolling a guess every frame: `update` promotes the head of this queue.
   */
  private readonly weatherQueue: Record<AreaId, QueuedFront[]>;

  constructor(store: WorldStore) {
    this.store = store;
    const saved = store.read();
    this.weatherValues = {} as Record<AreaId, WeatherId>;
    this.weatherRemaining = {} as Record<AreaId, number>;
    this.weatherLength = {} as Record<AreaId, number>;
    this.weatherQueue = {} as Record<AreaId, QueuedFront[]>;
    for (const area of AREAS) {
      const raw =
        typeof saved?.weather === "string"
          ? saved.weather
          : saved?.weather?.[area.id];
      const current = savedWeatherId(raw);
      const length = randRange(WEATHER_MIN, WEATHER_MAX);
      this.weatherValues[area.id] = current;
      this.weatherLength[area.id] = length;
      this.weatherRemaining[area.id] = length;
      this.weatherQueue[area.id] = this.rollQueue(current);
    }
  }

  /** Rolls {@link FORECAST_QUEUE} fronts forward from `current`. */
  private rollQueue(current: WeatherId): QueuedFront[] {
    const queue: QueuedFront[] = [];
    let previous = current;
    for (let i = 0; i < FORECAST_QUEUE; i += 1) {
      const id = pickWeather(previous);
      queue.push({ id, duration: randRange(WEATHER_MIN, WEATHER_MAX) });
      previous = id;
    }
    return queue;
  }

  get minutes(): number {
    if (this.pinnedMinutes !== null) return this.pinnedMinutes;
    return wallClockMinutes();
  }

  get palette(): WorldPalette {
    return paletteAt(this.minutes);
  }

  weatherFor(areaId: AreaId): WeatherId {
    return this.weatherValues[areaId];
  }

  /**
   * The fronts the player is about to get: the live one first, then the queued
   * ones, each with the moment it starts and how long it runs. The rail draws
   * this list, so it never has to guess or re-roll a front that will not come.
   */
  forecastFor(areaId: AreaId, count = FORECAST_QUEUE + 1): ForecastStep[] {
    const remaining = Math.max(0, this.weatherRemaining[areaId]);
    const steps: ForecastStep[] = [
      {
        weather: this.weatherValues[areaId],
        startsIn: 0,
        endsIn: remaining,
        length: Math.max(1, this.weatherLength[areaId]),
      },
    ];
    for (const front of this.weatherQueue[areaId]) {
      if (steps.length >= count) break;
      const previous = steps[steps.length - 1];
      steps.push({
        weather: front.id,
        startsIn: previous.endsIn,
        endsIn: previous.endsIn + front.duration,
        length: front.duration,
      });
    }
    return steps;
  }

  weatherDefFor(areaId: AreaId): WeatherDef {
    return WEATHER[this.weatherValues[areaId]];
  }

  get label(): string {
    return formatClock(this.minutes);
  }

  /**
   * Advances the weather fronts. The time of day needs no update: it is read
   * from the system clock. Returns true when at least one front changed, so
   * callers can persist immediately or react to the new sky.
   */
  update(dt: number): boolean {
    let changed = false;
    for (const area of AREAS) {
      this.weatherRemaining[area.id] -= dt;
      if (this.weatherRemaining[area.id] > 0) continue;
      // Promote the front that was already promised by the forecast, then roll
      // its successor, so the rail never shows a front that cannot arrive.
      // Any overshoot carries over: a slow frame must not stretch a front.
      const next = this.weatherQueue[area.id].shift();
      if (!next) continue;
      this.weatherValues[area.id] = next.id;
      this.weatherRemaining[area.id] += next.duration;
      this.weatherLength[area.id] = next.duration;
      this.weatherQueue[area.id].push({
        id: pickWeather(next.id),
        duration: randRange(WEATHER_MIN, WEATHER_MAX),
      });
      changed = true;
    }
    return changed;
  }

  persist(): void {
    this.store.write({ ...this.weatherValues });
  }

  /** Debug / preview hook: pin the clock, or `null` to follow the wall clock. */
  setTime(minutes: number | null): void {
    this.pinnedMinutes =
      minutes === null ? null : ((minutes % 1440) + 1440) % 1440;
  }

  /** Debug / preview hook; without an area it applies to every water body. */
  setWeather(weather: WeatherId, areaId?: AreaId): void {
    const targets = areaId ? AREAS.filter((area) => area.id === areaId) : AREAS;
    for (const area of targets) {
      this.weatherValues[area.id] = weather;
      const length = randRange(WEATHER_MIN, WEATHER_MAX);
      this.weatherLength[area.id] = length;
      this.weatherRemaining[area.id] = length;
      this.weatherQueue[area.id] = this.rollQueue(weather);
    }
  }
}
