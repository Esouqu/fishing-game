import { AREA_BY_ID } from "./areas";
import { FISH_TEXT, WEATHER_CASE, WEATHER_LABEL, type FishText } from "./texts";
import {
  TEMPERAMENT_IDS,
  type AreaId,
  type FishTier,
  type Temperament,
  type TimeWindow,
  type WeatherId,
} from "./types";
import { formatClock } from "./utils";
import { UI } from "./ui/palette";

export interface FishSpecies {
  id: string;
  /** Russian display name. */
  name: string;
  /** Physical weight range in kg; rolled per catch. */
  weightKg: readonly [number, number];
  /**
   * Relative spawn weight. The roster is tuned by rarity: common fish sit at
   * 10–22, rare at 3–4.5 and legendary at 0.85–1, so a common bite is the norm
   * and a legendary one is an event.
   */
  weight: number;
  /** Minigame difficulty knobs. */
  speed: number;
  /** How hard the fish is to tire during the fight. */
  resistance: number;
  tint: number;
  tier: FishTier;
  /** Area this fish belongs to. Every species lives in exactly one area. */
  area: AreaId;
  /** Movement script key in `game/behaviors.ts` (defaults to the fish id). */
  behavior: string;
  /** Time-of-day windows where this fish bites. Omitted = any time. */
  windows?: readonly TimeWindow[];
  /** Weather fronts where this fish bites. Omitted = any weather. */
  weather?: readonly WeatherId[];
}

export const TIER_LABEL: Record<FishTier, string> = {
  common: "ОБЫЧНАЯ",
  rare: "РЕДКАЯ",
  legendary: "ЛЕГЕНДАРНАЯ",
};

/** Palette for tier dots, badges and tooltips. */
export const TIER_COLOR: Record<FishTier, number> = {
  common: UI.textMuted,
  rare: UI.ice,
  legendary: UI.legendary,
};

/**
 * Roster composition every water body is built around: ~70% common, ~20% rare,
 * ~10% legendary. Checked by `validateFishData`, so a rebalance cannot quietly
 * turn one water body into a legendary farm.
 */
export const TIER_SHARE: Record<FishTier, readonly [number, number]> = {
  common: [0.6, 0.8],
  rare: [0.1, 0.35],
  legendary: [0.04, 0.2],
};

/** Spawn weight band that matches each rarity class. */
export const TIER_WEIGHT: Record<FishTier, readonly [number, number]> = {
  common: [6, 24],
  rare: [2.5, 6.5],
  legendary: [0.6, 2],
};

const at = (hour: number, minute = 0): number => hour * 60 + minute;
const win = (fromHour: number, toHour: number): TimeWindow => ({
  from: at(fromHour),
  to: at(toHour),
});

/**
 * All 40 species, grouped by water type. The split is biological where it can
 * be (everything that only lives in salt water is in the sea) and leans on the
 * displayed name where the art pack is loose, e.g. the "Сомик" is a lake
 * bottom-dweller. Bearers that tolerate both fresh and salt water sit in the
 * river, which also doubles as its estuary: Шэд, Угорь, Осетр, Сибас,
 * Песковник, Креветка и Илистый прыгун.
 */
export const FISH: readonly FishSpecies[] = [
  // ------------------------------------------------------------ Темное Озеро
  {
    id: "bluegill",
    name: FISH_TEXT.bluegill.name,
    weightKg: [0.1, 0.4],
    weight: 20,
    speed: 0.3,
    resistance: 0.18,
    tint: 0x63ab3f,
    tier: "common",
    area: "deep",
    behavior: "bluegill",
    windows: [win(8, 17)],
    weather: ["clear", "overcast"],
  },
  {
    id: "tilapia",
    name: FISH_TEXT.tilapia.name,
    weightKg: [0.4, 1.6],
    weight: 18,
    speed: 0.42,
    resistance: 0.2,
    tint: 0xff5277,
    tier: "common",
    area: "deep",
    behavior: "tilapia",
    windows: [win(5, 22)],
  },
  {
    id: "carp",
    name: FISH_TEXT.carp.name,
    weightKg: [1.5, 6],
    weight: 16,
    speed: 0.54,
    resistance: 0.3,
    tint: 0xf0b541,
    tier: "common",
    area: "deep",
    behavior: "carp",
  },
  {
    id: "perch",
    name: FISH_TEXT.perch.name,
    weightKg: [0.2, 1.2],
    weight: 12,
    speed: 0.48,
    resistance: 0.21,
    tint: 0xd6a24a,
    tier: "common",
    area: "deep",
    behavior: "perch",
    windows: [win(5, 8), win(17, 20)],
  },
  {
    id: "largemouthbass",
    name: FISH_TEXT.largemouthbass.name,
    weightKg: [0.8, 3.5],
    weight: 11,
    speed: 0.54,
    resistance: 0.22,
    tint: 0x3b7d4f,
    tier: "common",
    area: "deep",
    behavior: "largemouthbass",
    windows: [win(5, 11)],
  },
  {
    id: "smallmouthbass",
    name: FISH_TEXT.smallmouthbass.name,
    weightKg: [0.6, 2.8],
    weight: 10,
    speed: 0.6,
    resistance: 0.23,
    tint: 0x7d6a3f,
    tier: "common",
    area: "deep",
    behavior: "smallmouthbass",
    windows: [win(5, 8), win(17, 20)],
    weather: ["fog"],
  },
  {
    id: "pike",
    name: FISH_TEXT.pike.name,
    weightKg: [1.5, 7],
    weight: 10,
    speed: 0.7,
    resistance: 0.25,
    tint: 0x5f7f4a,
    tier: "common",
    area: "deep",
    behavior: "pike",
    windows: [win(18, 23)],
    weather: ["overcast", "snow"],
  },
  {
    id: "walleye",
    name: FISH_TEXT.walleye.name,
    weightKg: [1.5, 6],
    weight: 10,
    speed: 0.68,
    resistance: 0.245,
    tint: 0xd6b04a,
    tier: "common",
    area: "deep",
    behavior: "walleye",
    windows: [win(17, 23)],
  },
  {
    id: "cod",
    name: FISH_TEXT.cod.name,
    weightKg: [2, 9],
    weight: 10,
    speed: 0.65,
    resistance: 0.24,
    tint: 0xab5130,
    tier: "common",
    area: "deep",
    behavior: "cod",
    windows: [win(18, 23)],
    weather: ["snow", "blizzard"],
  },
  {
    id: "angelfish",
    name: FISH_TEXT.angelfish.name,
    weightKg: [0.3, 1.2],
    weight: 4.5,
    speed: 0.56,
    resistance: 0.28,
    tint: 0xdfe0e8,
    tier: "rare",
    area: "deep",
    behavior: "angelfish",
    windows: [win(17, 5)],
  },
  {
    id: "catfish",
    name: FISH_TEXT.catfish.name,
    weightKg: [4, 18],
    weight: 4,
    speed: 0.74,
    resistance: 0.255,
    tint: 0x8f4d57,
    tier: "rare",
    area: "deep",
    behavior: "catfish",
    windows: [win(20, 4)],
    weather: ["snow", "blizzard"],
  },
  {
    id: "koi",
    name: FISH_TEXT.koi.name,
    weightKg: [1, 5],
    weight: 0.9,
    speed: 0.62,
    resistance: 0.29,
    tint: 0xff8933,
    tier: "legendary",
    area: "deep",
    behavior: "koi",
    windows: [win(6, 9)],
    weather: ["clear", "overcast"],
  },

  // ------------------------------------------------------------ Тихая Речка
  {
    id: "minnow",
    name: FISH_TEXT.minnow.name,
    weightKg: [0.02, 0.1],
    weight: 22,
    speed: 0.38,
    resistance: 0.24,
    tint: 0x9fb7a8,
    tier: "common",
    area: "rapids",
    behavior: "minnow",
  },
  {
    id: "capelin",
    name: FISH_TEXT.capelin.name,
    weightKg: [0.05, 0.2],
    weight: 20,
    speed: 0.34,
    resistance: 0.185,
    tint: 0xa3a7c2,
    tier: "common",
    area: "rapids",
    behavior: "capelin",
  },
  {
    id: "chub",
    name: FISH_TEXT.chub.name,
    weightKg: [0.5, 2.2],
    weight: 13,
    speed: 0.57,
    resistance: 0.225,
    tint: 0x8f9a6a,
    tier: "common",
    area: "rapids",
    behavior: "chub",
    windows: [win(6, 20)],
  },
  {
    id: "flounder",
    name: FISH_TEXT.flounder.name,
    weightKg: [0.4, 1.8],
    weight: 14,
    speed: 0.4,
    resistance: 0.195,
    tint: 0xcf752b,
    tier: "common",
    area: "rapids",
    behavior: "flounder",
    windows: [win(8, 17)],
    weather: ["clear", "overcast"],
  },
  {
    id: "rainbowtrout",
    name: FISH_TEXT.rainbowtrout.name,
    weightKg: [0.8, 3.5],
    weight: 12,
    speed: 0.62,
    resistance: 0.235,
    tint: 0xff8933,
    tier: "common",
    area: "rapids",
    behavior: "rainbowtrout",
    windows: [win(5, 9)],
    weather: ["clear"],
  },
  {
    id: "mudskipper",
    name: FISH_TEXT.mudskipper.name,
    weightKg: [0.1, 0.5],
    weight: 12,
    speed: 0.74,
    resistance: 0.31,
    tint: 0x8f7a58,
    tier: "common",
    area: "rapids",
    behavior: "mudskipper",
  },
  {
    id: "shrimp",
    name: FISH_TEXT.shrimp.name,
    weightKg: [0.02, 0.1],
    weight: 12,
    speed: 0.34,
    resistance: 0.18,
    tint: 0xff8a7a,
    tier: "common",
    area: "rapids",
    behavior: "capelin",
    windows: [win(22, 4)],
  },
  {
    id: "seabass",
    name: FISH_TEXT.seabass.name,
    weightKg: [1, 6],
    weight: 10,
    speed: 0.7,
    resistance: 0.25,
    tint: 0x8fb7c2,
    tier: "common",
    area: "rapids",
    behavior: "walleye",
    windows: [win(17, 23)],
  },
  {
    id: "salmon",
    name: FISH_TEXT.salmon.name,
    weightKg: [2, 9],
    weight: 4,
    speed: 0.72,
    resistance: 0.245,
    tint: 0xff7a6a,
    tier: "rare",
    area: "rapids",
    behavior: "salmon",
    windows: [win(5, 9)],
  },
  {
    id: "eel",
    name: FISH_TEXT.eel.name,
    weightKg: [1, 5],
    weight: 4.5,
    speed: 0.78,
    resistance: 0.26,
    tint: 0x4a5a3a,
    tier: "rare",
    area: "rapids",
    behavior: "eel",
    windows: [win(20, 4)],
    weather: ["snow", "blizzard"],
  },
  {
    id: "tigerfish",
    name: FISH_TEXT.tigerfish.name,
    weightKg: [2, 8],
    weight: 4,
    speed: 0.78,
    resistance: 0.25,
    tint: 0xd0a04a,
    tier: "rare",
    area: "rapids",
    behavior: "tigerfish",
    windows: [win(10, 14)],
    weather: ["clear", "blizzard"],
  },
  {
    id: "sturgeon",
    name: FISH_TEXT.sturgeon.name,
    weightKg: [10, 45],
    weight: 1,
    speed: 1,
    resistance: 0.31,
    tint: 0x2ce8f5,
    tier: "legendary",
    area: "rapids",
    behavior: "sturgeon",
    windows: [win(0, 3)],
    weather: ["blizzard", "fog"],
  },

  // ---------------------------------------------------------- Северная Бухта
  {
    id: "anchovy",
    name: FISH_TEXT.anchovy.name,
    weightKg: [0.05, 0.2],
    weight: 18,
    speed: 0.36,
    resistance: 0.19,
    tint: 0xbcd7df,
    tier: "common",
    area: "cove",
    behavior: "capelin",
  },
  {
    id: "sardine",
    name: FISH_TEXT.sardine.name,
    weightKg: [0.1, 0.3],
    weight: 17,
    speed: 0.44,
    resistance: 0.26,
    tint: 0x4fa4b8,
    tier: "common",
    area: "cove",
    behavior: "sardine",
    windows: [win(8, 17)],
    weather: ["clear"],
  },
  {
    id: "mackerel",
    name: FISH_TEXT.mackerel.name,
    weightKg: [0.3, 1.5],
    weight: 15,
    speed: 0.62,
    resistance: 0.25,
    tint: 0x4fa4b8,
    tier: "common",
    area: "cove",
    behavior: "sardine",
    windows: [win(6, 12)],
  },
  {
    id: "haddock",
    name: FISH_TEXT.haddock.name,
    weightKg: [2, 8],
    weight: 12,
    speed: 0.66,
    resistance: 0.24,
    tint: 0xb9b2a0,
    tier: "common",
    area: "cove",
    behavior: "cod",
    windows: [win(18, 23)],
  },
  {
    id: "grouper",
    name: FISH_TEXT.grouper.name,
    weightKg: [3, 14],
    weight: 9,
    speed: 0.8,
    resistance: 0.265,
    tint: 0x9a8a5a,
    tier: "common",
    area: "cove",
    behavior: "grouper",
    windows: [win(12, 18)],
  },
  {
    id: "redsnapper",
    name: FISH_TEXT.redsnapper.name,
    weightKg: [2, 10],
    weight: 8,
    speed: 0.84,
    resistance: 0.27,
    tint: 0xe64539,
    tier: "common",
    area: "cove",
    behavior: "redsnapper",
    windows: [win(17, 23)],
    weather: ["fog"],
  },
  {
    id: "lionfish",
    name: FISH_TEXT.lionfish.name,
    weightKg: [0.8, 3],
    weight: 8,
    speed: 0.86,
    resistance: 0.275,
    tint: 0xff5277,
    tier: "common",
    area: "cove",
    behavior: "lionfish",
    windows: [win(10, 14)],
    weather: ["clear", "blizzard"],
  },
  {
    id: "butterflyfish",
    name: FISH_TEXT.butterflyfish.name,
    weightKg: [0.1, 0.5],
    weight: 8,
    speed: 0.62,
    resistance: 0.3,
    tint: 0xffb347,
    tier: "common",
    area: "cove",
    behavior: "butterflyfish",
    windows: [win(8, 12)],
    weather: ["clear"],
  },
  {
    id: "clownfish",
    name: FISH_TEXT.clownfish.name,
    weightKg: [0.1, 0.4],
    weight: 8,
    speed: 0.46,
    resistance: 0.2,
    tint: 0xff8933,
    tier: "common",
    area: "cove",
    behavior: "clownfish",
    windows: [win(9, 13)],
    weather: ["clear"],
  },
  {
    id: "oceansunfish",
    name: FISH_TEXT.oceansunfish.name,
    weightKg: [20, 60],
    weight: 7,
    speed: 0.7,
    resistance: 0.3,
    tint: 0xd6b04a,
    tier: "common",
    area: "cove",
    behavior: "grouper",
    windows: [win(11, 14)],
    weather: ["fog"],
  },
  {
    id: "tuna",
    name: FISH_TEXT.tuna.name,
    weightKg: [20, 70],
    weight: 6,
    speed: 0.92,
    resistance: 0.33,
    tint: 0x2f6fa8,
    tier: "common",
    area: "cove",
    behavior: "tuna",
    windows: [win(8, 12)],
    weather: ["blizzard"],
  },
  {
    id: "barracuda",
    name: FISH_TEXT.barracuda.name,
    weightKg: [3, 12],
    weight: 3.5,
    speed: 0.88,
    resistance: 0.27,
    tint: 0x7f9aa8,
    tier: "rare",
    area: "cove",
    behavior: "barracuda",
    windows: [win(12, 16)],
    weather: ["blizzard"],
  },
  {
    id: "halibut",
    name: FISH_TEXT.halibut.name,
    weightKg: [5, 30],
    weight: 3,
    speed: 0.86,
    resistance: 0.36,
    tint: 0x9a8a6a,
    tier: "rare",
    area: "cove",
    behavior: "halibut",
    windows: [win(3, 6)],
    weather: ["fog"],
  },
  {
    id: "oarfish",
    name: FISH_TEXT.oarfish.name,
    weightKg: [8, 25],
    weight: 3,
    speed: 0.8,
    resistance: 0.3,
    tint: 0xcfe2ff,
    tier: "rare",
    area: "cove",
    behavior: "oarfish",
    windows: [win(2, 5)],
    weather: ["blizzard", "fog"],
  },
  {
    id: "marlin",
    name: FISH_TEXT.marlin.name,
    weightKg: [30, 90],
    weight: 0.9,
    speed: 0.96,
    resistance: 0.33,
    tint: 0x2f6fa8,
    tier: "legendary",
    area: "cove",
    behavior: "marlin",
    windows: [win(10, 13)],
    weather: ["blizzard"],
  },
  {
    id: "swordfish",
    name: FISH_TEXT.swordfish.name,
    weightKg: [25, 80],
    weight: 0.85,
    speed: 0.94,
    resistance: 0.32,
    tint: 0x4a5a7a,
    tier: "legendary",
    area: "cove",
    behavior: "swordfish",
    windows: [win(14, 17)],
    weather: ["blizzard"],
  },
] as const;

/**
 * Fixed temperament per species. This used to be rolled for every fight, which
 * made the codex's "character" line flavour text instead of a real hint. It is
 * authored next to the roster so a species always fights the same way.
 */
export const FISH_TEMPERAMENT: Record<string, Temperament> = {
  bluegill: "calm",
  tilapia: "calm",
  carp: "stubborn",
  perch: "aggressive",
  largemouthbass: "stubborn",
  smallmouthbass: "skittish",
  pike: "aggressive",
  walleye: "skittish",
  cod: "stubborn",
  angelfish: "stubborn",
  catfish: "stubborn",
  koi: "stubborn",
  minnow: "skittish",
  capelin: "skittish",
  chub: "skittish",
  flounder: "calm",
  rainbowtrout: "skittish",
  mudskipper: "skittish",
  shrimp: "skittish",
  seabass: "aggressive",
  salmon: "stubborn",
  eel: "skittish",
  tigerfish: "aggressive",
  sturgeon: "stubborn",
  anchovy: "skittish",
  sardine: "skittish",
  mackerel: "aggressive",
  haddock: "calm",
  grouper: "stubborn",
  redsnapper: "aggressive",
  lionfish: "aggressive",
  butterflyfish: "stubborn",
  clownfish: "skittish",
  oceansunfish: "calm",
  tuna: "stubborn",
  barracuda: "aggressive",
  halibut: "stubborn",
  oarfish: "skittish",
  marlin: "aggressive",
  swordfish: "aggressive",
};

export function temperamentFor(fish: FishSpecies): Temperament {
  return FISH_TEMPERAMENT[fish.id] ?? "calm";
}

export const FISH_BY_ID: Record<string, FishSpecies> = Object.fromEntries(
  FISH.map((fish) => [fish.id, fish]),
);

/** Typed access to the flavour text of a species. */
export function fishText(id: string): FishText | undefined {
  return (FISH_TEXT as Record<string, FishText>)[id];
}

/** True when `minutes` falls inside the window; handles midnight wrap. */
export function isWindowActive(window: TimeWindow, minutes: number): boolean {
  const m = ((minutes % 1440) + 1440) % 1440;
  const from = ((window.from % 1440) + 1440) % 1440;
  const to = ((window.to % 1440) + 1440) % 1440;
  if (from === to) return true;
  return from < to ? m >= from && m < to : m >= from || m < to;
}

/** A fish bites only inside one of its windows and only in its weather. */
export function isFishActive(
  fish: FishSpecies,
  minutes: number,
  weather: WeatherId,
): boolean {
  const windowOk =
    !fish.windows ||
    fish.windows.length === 0 ||
    fish.windows.some((window) => isWindowActive(window, minutes));
  if (!windowOk) return false;
  return !fish.weather || fish.weather.includes(weather);
}

/** Rare and legendary fish get the weather/luck multipliers, common do not. */
export function isRareFish(fish: FishSpecies): boolean {
  return fish.tier !== "common";
}

export function fishInArea(areaId: AreaId): readonly FishSpecies[] {
  return FISH.filter((fish) => fish.area === areaId);
}

/** `05:00–08:00 · 17:00–20:00`, or `КРУГЛОСУТОЧНО`. */
export function fullWindowLabel(fish: FishSpecies): string {
  if (!fish.windows || fish.windows.length === 0) return "КРУГЛОСУТОЧНО";
  return fish.windows
    .map((window) => `${formatClock(window.from)}–${formatClock(window.to)}`)
    .join(" · ");
}

/** `ЯСНО, ОБЛАЧНО`, or `ЛЮБАЯ`. */
export function fullWeatherLabel(fish: FishSpecies): string {
  if (!fish.weather || fish.weather.length === 0) return "ЛЮБАЯ";
  return fish.weather.map((id) => WEATHER_LABEL[id]).join(", ");
}

function windowPhrase(windows: readonly TimeWindow[]): string {
  if (windows.length === 1) {
    const window = windows[0];
    return `только между ${formatClock(window.from)} и ${formatClock(window.to)}`;
  }
  return windows
    .map((window) => `${formatClock(window.from)}–${formatClock(window.to)}`)
    .join(" и ");
}

function weatherPhrase(weather: readonly WeatherId[]): string {
  const bothCalm = weather.every((id) => id === "clear" || id === "overcast");
  if (weather.length > 1 && bothCalm) {
    const adjectives = weather.map((id) =>
      id === "clear" ? "ясную" : "облачную",
    );
    return `в ${adjectives.join(" и ")} погоду`;
  }
  return `в ${weather.map((id) => WEATHER_CASE[id]).join(" и ")}`;
}

/** `ловится всегда`, `клюет только между 19:00 и 23:00`, `… в туман`. */
export function whenPhrase(fish: FishSpecies): string {
  const windows = fish.windows?.length ? fish.windows : null;
  const weather = fish.weather?.length ? fish.weather : null;
  if (!windows && !weather) return "ловится всегда";
  if (windows && !weather) return `клюет ${windowPhrase(windows)}`;
  if (!windows && weather) {
    return `выходит на кормежку только ${weatherPhrase(weather)}`;
  }
  if (windows && weather) {
    return `клюет ${windowPhrase(windows)} ${weatherPhrase(weather)}`;
  }
  return "ловится всегда";
}

/**
 * One-sentence codex blurb. The name and the water type are already printed
 * above the tooltip line, so the blurb starts with the habits instead of
 * repeating «Осетр — речная рыба»:
 * «Клюет только между 00:00 и 03:00 в метель и туман, древняя, тяжелая и
 * упорная.»
 */
export function fishDescription(fish: FishSpecies): string {
  const temper = fishText(fish.id)?.temper ?? "с характером";
  return `${capitalizeFirst(whenPhrase(fish))}, ${temper}.`;
}

function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function windowLength(window: TimeWindow): number {
  const span = window.to - window.from;
  return span > 0 ? span : span + 1440;
}

/**
 * Data invariants used by the fight simulation and the dev boot. Returns a
 * list of human-readable problems; an empty array means the roster is sound.
 */
export function validateFishData(
  hasBehavior?: (id: string) => boolean,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const fish of FISH) {
    if (ids.has(fish.id)) problems.push(`duplicate fish id: ${fish.id}`);
    ids.add(fish.id);
    if (!(fish.area in AREA_BY_ID)) {
      problems.push(`${fish.id}: unknown area ${fish.area}`);
    }
    const text = fishText(fish.id);
    if (!text) problems.push(`${fish.id}: missing FISH_TEXT entry`);
    else if (!text.temper) problems.push(`${fish.id}: empty temper`);
    if (!TEMPERAMENT_IDS.includes(FISH_TEMPERAMENT[fish.id])) {
      problems.push(`${fish.id}: missing temperament`);
    }
    if (hasBehavior && !hasBehavior(fish.behavior)) {
      problems.push(`${fish.id}: missing behavior script ${fish.behavior}`);
    }
    const [minWeight, maxWeight] = TIER_WEIGHT[fish.tier];
    if (fish.weight < minWeight || fish.weight > maxWeight) {
      problems.push(
        `${fish.id}: ${fish.tier} weight ${fish.weight} outside ${minWeight}..${maxWeight}`,
      );
    }
    if (fish.windows) {
      for (const window of fish.windows) {
        if (
          window.from < 0 ||
          window.from >= 1440 ||
          window.to < 0 ||
          window.to >= 1440
        ) {
          problems.push(`${fish.id}: window out of range`);
        }
        if (window.from === window.to) {
          problems.push(`${fish.id}: window must not be 24h`);
        }
        if (fish.tier === "legendary" && windowLength(window) > 180) {
          problems.push(`${fish.id}: legendary window longer than 3 hours`);
        }
      }
    }
  }

  if (FISH.length !== 40) {
    problems.push(`expected 40 species, found ${FISH.length}`);
  }

  for (const area of Object.values(AREA_BY_ID)) {
    const roster = fishInArea(area.id);
    if (roster.length === 0) problems.push(`${area.id}: empty roster`);
    const always = roster.filter(
      (fish) =>
        (!fish.windows || fish.windows.length === 0) &&
        (!fish.weather || fish.weather.length === 0),
    );
    if (always.length === 0) {
      problems.push(`${area.id}: no all-day fish`);
    }
    for (const tier of Object.keys(TIER_SHARE) as FishTier[]) {
      const count = roster.filter((fish) => fish.tier === tier).length;
      const share = roster.length === 0 ? 0 : count / roster.length;
      const [minShare, maxShare] = TIER_SHARE[tier];
      if (count === 0 || share < minShare || share > maxShare) {
        problems.push(
          `${area.id}: ${tier} share ${(share * 100).toFixed(0)}% (${count}/${roster.length}) outside ${minShare * 100}..${maxShare * 100}%`,
        );
      }
    }
  }

  return problems;
}
