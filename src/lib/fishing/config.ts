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
export const CHEST_CHANCE = 0.1;
export const CHEST_BONUS = 150;
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
  /** Green zone size as a fraction of the column. */
  zone: number;
  /** Progress lost per second outside the zone. */
  drain: number;
  tint: number;
}

export const FISH: readonly FishSpecies[] = [
  {
    id: "minnow",
    name: "Плотва",
    latin: "Minnow",
    points: 35,
    weight: 26,
    speed: 0.3,
    zone: 0.31,
    drain: 0.16,
    tint: 0xa3a7c2,
  },
  {
    id: "perch",
    name: "Окунь",
    latin: "Perch",
    points: 50,
    weight: 20,
    speed: 0.37,
    zone: 0.3,
    drain: 0.18,
    tint: 0xf0b541,
  },
  {
    id: "bluegill",
    name: "Карась",
    latin: "Bluegill",
    points: 65,
    weight: 15,
    speed: 0.44,
    zone: 0.29,
    drain: 0.2,
    tint: 0x4fa4b8,
  },
  {
    id: "carp",
    name: "Карп",
    latin: "Carp",
    points: 85,
    weight: 12,
    speed: 0.5,
    zone: 0.28,
    drain: 0.22,
    tint: 0xcf752b,
  },
  {
    id: "chub",
    name: "Лещ",
    latin: "Chub",
    points: 110,
    weight: 9,
    speed: 0.56,
    zone: 0.27,
    drain: 0.24,
    tint: 0xdfe0e8,
  },
  {
    id: "pike",
    name: "Щука",
    latin: "Pike",
    points: 140,
    weight: 7,
    speed: 0.64,
    zone: 0.26,
    drain: 0.27,
    tint: 0x3b7d4f,
  },
  {
    id: "walleye",
    name: "Судак",
    latin: "Walleye",
    points: 170,
    weight: 5,
    speed: 0.71,
    zone: 0.25,
    drain: 0.3,
    tint: 0xffae70,
  },
  {
    id: "catfish",
    name: "Сом",
    latin: "Catfish",
    points: 210,
    weight: 3.4,
    speed: 0.79,
    zone: 0.24,
    drain: 0.33,
    tint: 0x8f4d57,
  },
  {
    id: "salmon",
    name: "Лосось",
    latin: "Salmon",
    points: 250,
    weight: 2.1,
    speed: 0.86,
    zone: 0.23,
    drain: 0.36,
    tint: 0xff5277,
  },
  {
    id: "koi",
    name: "Золотая",
    latin: "Koi",
    points: 300,
    weight: 1,
    speed: 0.93,
    zone: 0.22,
    drain: 0.4,
    tint: 0xff8933,
  },
  {
    id: "sturgeon",
    name: "Легендарная",
    latin: "Sturgeon",
    points: 400,
    weight: 0.45,
    speed: 1,
    zone: 0.21,
    drain: 0.44,
    tint: 0x2ce8f5,
  },
] as const;

export const FISH_BY_ID: Record<string, FishSpecies> = Object.fromEntries(
  FISH.map((fish) => [fish.id, fish]),
);

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
  bobberMaxY: 134,
} as const;

export type WaterZoneId = "shallow" | "deep" | "abyss";

export interface WaterZone {
  id: WaterZoneId;
  name: string;
  /** Vertical band in scene pixels, from far (low y) to near shore. */
  minY: number;
  maxY: number;
  color: number;
  /** Weight multiplier applied to common fish. */
  commonFactor: number;
  /** Weight multiplier applied to rare fish. */
  rareFactor: number;
}

/**
 * Cast distance is a real choice: close water is safe and common, the far
 * pool is rarer and more valuable. The bands match the bobber Y range.
 */
export const WATER_ZONES: readonly WaterZone[] = [
  {
    id: "shallow",
    name: "МЕЛЬ",
    minY: 106,
    maxY: 136,
    color: C.green,
    commonFactor: 1.5,
    rareFactor: 0.55,
  },
  {
    id: "deep",
    name: "ГЛУБИНА",
    minY: 80,
    maxY: 106,
    color: C.gold,
    commonFactor: 1,
    rareFactor: 1,
  },
  {
    id: "abyss",
    name: "ОМУТ",
    minY: 58,
    maxY: 80,
    color: C.red,
    commonFactor: 0.55,
    rareFactor: 1.85,
  },
] as const;

export const DEFAULT_WATER_ZONE = WATER_ZONES[0];

/** Charge fractions where one water zone becomes the next. */
export const WATER_ZONE_MARKERS = WATER_ZONES.slice(0, -1).map(
  (zone) =>
    (SCENE.bobberMaxY - zone.minY) / (SCENE.bobberMaxY - SCENE.bobberMinY),
);

export function zoneForPower(power: number): WaterZone {
  const clamped = Math.min(1, Math.max(0, power));
  const y = SCENE.bobberMaxY + (SCENE.bobberMinY - SCENE.bobberMaxY) * clamped;
  return (
    WATER_ZONES.find((zone) => y >= zone.minY && y < zone.maxY) ??
    DEFAULT_WATER_ZONE
  );
}

export const TIMING = {
  chargeCycle: 0.85,
  castFlight: 0.5,
  resultHold: 1.7,
  escapedHold: 1.35,
} as const;
