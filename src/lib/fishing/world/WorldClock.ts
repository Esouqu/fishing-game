import { AREAS } from "../areas";
import type { WorldStore } from "../storage";
import type { AreaId, WeatherId } from "../types";
import { formatClock, randRange } from "../utils";
import { paletteAt, type WorldPalette } from "./colors";
import {
  FORECAST_QUEUE,
  WEATHER,
  WEATHER_MAX,
  WEATHER_MIN,
  pickWeather,
  type ForecastStep,
  type QueuedFront,
  type WeatherDef,
} from "./weather";

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
