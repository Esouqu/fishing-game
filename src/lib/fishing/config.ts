import type { TimePhase, WeatherId } from "./types";

/** Virtual resolution — every screen is laid out in these units. */
export const VIEW = { width: 480, height: 270 } as const;

export const FONT_FAMILY = "Handjet";

export const CASTS_PER_SESSION = 10;
export const COMBO_MULTIPLIERS = [1, 1.25, 1.5, 1.75, 2] as const;

/** Multiplier applied to the next catch after `streak` successful catches. */
export function comboMultiplier(streak: number): number {
  const index = Math.min(Math.max(0, streak), COMBO_MULTIPLIERS.length - 1);
  return COMBO_MULTIPLIERS[index];
}

export const PERFECT_MULTIPLIER = 1.5;
export const START_PROGRESS = 0.35;

/** Rosy-42 (+3 blues) palette used by the Tiny Coast Pack. */
export const C = {
  ink: 0x14182e,
  night: 0x1b1f21,
  deep: 0x124e89,
  panel: 0x2b2b45,
  panelAlt: 0x3a3f5e,
  steel: 0x4c6885,
  steelLight: 0x686f99,
  steelPale: 0xa3a7c2,
  cream: 0xf5ffe8,
  white: 0xdfe0e8,
  gold: 0xf0b541,
  yellow: 0xffee83,
  orange: 0xff8933,
  red: 0xe64539,
  redDark: 0x9c2a70,
  green: 0x63ab3f,
  greenDark: 0x3b7d4f,
  teal: 0x2f5753,
  blue: 0x0095e9,
  cyan: 0x2ce8f5,
  navy: 0x124e89,
  brown: 0xab5130,
  brownDark: 0x7d3833,
  brownLight: 0xcf752b,
  sand: 0xf0b541,
  skin: 0xffae70,
  magenta: 0x9c2a70,
  ocean: 0x0a6cb0,
} as const;

export type FishRarity = "common" | "uncommon" | "rare" | "legendary";

export interface FishSpecies {
  id: string;
  /** Russian display name. */
  name: string;
  /** Latin / English name for flavour. */
  latin: string;
  points: number;
  /** Relative spawn weight. */
  weight: number;
  /** Minigame difficulty knobs. */
  speed: number;
  /** Progress lost per second while the fish is outside the ring. */
  drain: number;
  tint: number;
  rarity: FishRarity;
  /** Movement script key in `game/behaviors.ts` (defaults to the fish id). */
  behavior: string;
  /** Time-of-day windows where this fish bites. Omitted = any time. */
  time?: readonly TimePhase[];
  /** Weather fronts where this fish bites. Omitted = any weather. */
  weather?: readonly WeatherId[];
}

/** Fish at or above this score count as rare for the bonus multipliers. */
export const RARE_SCORE = 180;

export function isRareFish(fish: FishSpecies): boolean {
  return fish.points >= RARE_SCORE;
}
export const FISH: readonly FishSpecies[] = [
  {
    id: "bluegill",
    name: "Солнечник",
    latin: "Bluegill",
    points: 35,
    weight: 22,
    speed: 0.3,
    drain: 0.18,
    tint: 0x63ab3f,
    rarity: "common",
    behavior: "bluegill",
    time: ["day"],
    weather: ["clear", "overcast"],
  },
  {
    id: "capelin",
    name: "Шэд",
    latin: "Capelin",
    points: 45,
    weight: 20,
    speed: 0.34,
    drain: 0.185,
    tint: 0xa3a7c2,
    rarity: "common",
    behavior: "capelin",
    time: ["day"],
  },
  {
    id: "sardine",
    name: "Сардина",
    latin: "Sardine",
    points: 55,
    weight: 18,
    speed: 0.38,
    drain: 0.19,
    tint: 0x4fa4b8,
    rarity: "common",
    behavior: "sardine",
    time: ["day"],
    weather: ["clear"],
  },
  {
    id: "flounder",
    name: "Песковник",
    latin: "Flounder",
    points: 60,
    weight: 16,
    speed: 0.4,
    drain: 0.195,
    tint: 0xcf752b,
    rarity: "common",
    behavior: "flounder",
    time: ["day"],
    weather: ["clear"],
  },
  {
    id: "tilapia",
    name: "Тиляпия",
    latin: "Tilapia",
    points: 65,
    weight: 15,
    speed: 0.42,
    drain: 0.2,
    tint: 0xff5277,
    rarity: "common",
    behavior: "tilapia",
    time: ["day"],
  },
  {
    id: "carp",
    name: "Карп",
    latin: "Carp",
    points: 80,
    weight: 13,
    speed: 0.46,
    drain: 0.21,
    tint: 0xf0b541,
    rarity: "common",
    behavior: "carp",
  },
  {
    id: "angelfish",
    name: "Лещ",
    latin: "Angelfish",
    points: 95,
    weight: 11,
    speed: 0.5,
    drain: 0.215,
    tint: 0xdfe0e8,
    rarity: "uncommon",
    behavior: "angelfish",
    time: ["dawn", "dusk", "night"],
  },
  {
    id: "largemouthbass",
    name: "Большеротый окунь",
    latin: "Largemouth Bass",
    points: 110,
    weight: 9,
    speed: 0.54,
    drain: 0.22,
    tint: 0x3b7d4f,
    rarity: "uncommon",
    behavior: "largemouthbass",
    time: ["day", "dusk"],
  },
  {
    id: "chub",
    name: "Голавль",
    latin: "Chub",
    points: 120,
    weight: 8,
    speed: 0.57,
    drain: 0.225,
    tint: 0x8f9a6a,
    rarity: "uncommon",
    behavior: "chub",
    time: ["dawn", "day", "dusk"],
  },
  {
    id: "smallmouthbass",
    name: "Лесоплюх",
    latin: "Smallmouth Bass",
    points: 130,
    weight: 7,
    speed: 0.6,
    drain: 0.23,
    tint: 0x7d6a3f,
    rarity: "uncommon",
    behavior: "smallmouthbass",
    time: ["dawn", "dusk"],
    weather: ["fog"],
  },
  {
    id: "rainbowtrout",
    name: "Тигровая форель",
    latin: "Rainbow Trout",
    points: 140,
    weight: 6,
    speed: 0.62,
    drain: 0.235,
    tint: 0xff8933,
    rarity: "uncommon",
    behavior: "rainbowtrout",
    time: ["day"],
    weather: ["clear"],
  },
  {
    id: "cod",
    name: "Сомик",
    latin: "Cod",
    points: 150,
    weight: 5,
    speed: 0.65,
    drain: 0.24,
    tint: 0xab5130,
    rarity: "uncommon",
    behavior: "cod",
    time: ["night"],
    weather: ["rain", "storm"],
  },
  {
    id: "walleye",
    name: "Жёлтый судак",
    latin: "Walleye",
    points: 160,
    weight: 4.5,
    speed: 0.68,
    drain: 0.245,
    tint: 0xd6b04a,
    rarity: "uncommon",
    behavior: "walleye",
    time: ["dusk", "night"],
  },
  {
    id: "catfish",
    name: "Сом",
    latin: "Catfish",
    points: 200,
    weight: 3.5,
    speed: 0.74,
    drain: 0.255,
    tint: 0x8f4d57,
    rarity: "rare",
    behavior: "catfish",
    time: ["night"],
    weather: ["rain", "storm"],
  },
  {
    id: "eel",
    name: "Угорь",
    latin: "Eel",
    points: 210,
    weight: 3,
    speed: 0.78,
    drain: 0.26,
    tint: 0x4a5a3a,
    rarity: "rare",
    behavior: "eel",
    time: ["night"],
    weather: ["rain", "storm"],
  },
  {
    id: "grouper",
    name: "Пятнистый криворот",
    latin: "Grouper",
    points: 220,
    weight: 2.6,
    speed: 0.8,
    drain: 0.265,
    tint: 0x9a8a5a,
    rarity: "rare",
    behavior: "grouper",
    time: ["dusk", "night"],
  },
  {
    id: "redsnapper",
    name: "Берикс",
    latin: "Red Snapper",
    points: 240,
    weight: 2.2,
    speed: 0.84,
    drain: 0.27,
    tint: 0xe64539,
    rarity: "rare",
    behavior: "redsnapper",
    time: ["night"],
    weather: ["fog"],
  },
  {
    id: "lionfish",
    name: "Иглобрюх",
    latin: "Lionfish",
    points: 250,
    weight: 1.9,
    speed: 0.86,
    drain: 0.275,
    tint: 0xff5277,
    rarity: "rare",
    behavior: "lionfish",
    time: ["day"],
    weather: ["clear", "storm"],
  },
  {
    id: "tuna",
    name: "Тунец",
    latin: "Tuna",
    points: 320,
    weight: 1.2,
    speed: 0.92,
    drain: 0.33,
    tint: 0x2f6fa8,
    rarity: "legendary",
    behavior: "tuna",
    time: ["day"],
    weather: ["storm"],
  },
  {
    id: "sturgeon",
    name: "Осётр",
    latin: "Sturgeon",
    points: 400,
    weight: 0.6,
    speed: 1,
    drain: 0.31,
    tint: 0x2ce8f5,
    rarity: "legendary",
    behavior: "sturgeon",
    time: ["night"],
    weather: ["storm", "fog"],
  },
] as const;

export const FISH_BY_ID: Record<string, FishSpecies> = Object.fromEntries(
  FISH.map((fish) => [fish.id, fish]),
);

/**
 * Hidden luck: +1 per perfect catch, reset on a lost fish.
 */
export const LUCK_MAX = 3;
export const LUCK_RARE_STEP = 0.4;

/**
 * Narrow luck zone on the cast bar. Its centre is re-rolled for every cast, so
 * the player has to read the bar instead of memorising one perfect release.
 */
export const LUCK_BAND = { min: 0.5, max: 0.92, width: 0.07 } as const;

/** Rare-fish weight multiplier after landing inside the luck zone. */
export const LUCK_ZONE_MULT = 2.4;

/** Chance that a fish swims past without biting. */
export const PASS_BY_CHANCE = 0.12;

/** Short beat after spooking a fish, before the next cast is allowed. */
export const SPOOK_HOLD = 0.95;

/** Scene layout in virtual pixels. */
export const SCENE = {
  anglerX: 240,
  anglerY: 186,
  dockX: 218,
  dockY: 150,
  dockWidth: 44,
  dockBottom: 268,
  shoreY: 232,
  waterTop: 12,
  bobberMinY: 60,
  bobberMaxY: 96,
} as const;

export interface WaterProfile {
  /** Weight multiplier applied to common fish. */
  commonFactor: number;
  /** Weight multiplier applied to rare fish. */
  rareFactor: number;
  /** How wild the fish behave in this water (0.9 calm .. 1.12 rough). */
  wildness: number;
}

/**
 * Cast distance is still a real choice: close water is calm and common, the
 * far pool is rough, rarer and more valuable. There are no visible zones any
 * more — the further the bobber lands, the stronger the effect.
 */
export function waterProfile(power: number): WaterProfile {
  const t = power < 0 ? 0 : power > 1 ? 1 : power;
  return {
    commonFactor: 1.5 + (0.55 - 1.5) * t,
    rareFactor: 0.55 + (1.85 - 0.55) * t,
    wildness: 0.88 + (1.05 - 0.88) * t,
  };
}

export const TIMING = {
  chargeCycle: 0.85,
  castFlight: 0.5,
  resultHold: 1.7,
  escapedHold: 1.35,
  /** Random pause between the cast landing and the bite. */
  waitMin: 2.4,
  waitMax: 5,
  /** Random lead time before the bite when the bobber starts twitching. */
  nibbleLeadMin: 0.5,
  nibbleLeadMax: 0.9,
  nibbleDuration: 0.34,
  /** Warning window before a strong fish dash. */
  telegraph: 0.36,
} as const;
