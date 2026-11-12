import type { FishSpecies } from "../config";

export type DashDir = "away" | "toward" | "flip" | "same";

export type MoveKind = "pause" | "dash" | "arc" | "wave" | "zigzag";

/**
 * One beat of a fish's movement script. Directions are resolved at runtime
 * against the player's pull, so the same script reads differently depending
 * on where the player is pulling.
 *
 * - `away`   — bolts against the rod, away from the pull
 * - `toward` — gives in and shoots along the pull for a beat
 * - `flip`   — the opposite edge from the previous dash
 * - `same`   — repeat the previous dash edge
 */
export interface Move {
  kind: MoveKind;
  dir?: DashDir;
  dur: number;
  /** Strong moves warn the player with a flash and an arrow first. */
  strong?: boolean;
  /** Wave / zigzag amplitude as a fraction of the column. */
  amplitude?: number;
  /** Full sine cycles for `wave`. */
  cycles?: number;
  /** Target changes for `zigzag`. */
  count?: number;
}

const pause = (dur: number): Move => ({ kind: "pause", dur });
const dash = (dir: DashDir, dur: number, strong = false): Move => ({
  kind: "dash",
  dir,
  dur,
  strong,
});
const arc = (dir: DashDir, dur: number, strong = false): Move => ({
  kind: "arc",
  dir,
  dur,
  strong,
});
const wave = (dur: number, amplitude: number, cycles = 1): Move => ({
  kind: "wave",
  dur,
  amplitude,
  cycles,
});
const zigzag = (count: number, dur: number, amplitude = 0.28): Move => ({
  kind: "zigzag",
  dur,
  count,
  amplitude,
});

/**
 * Species scripts, keyed by `FishSpecies.behavior`. They are deliberately
 * short and loop forever: each fish keeps re-reading the player's position.
 */
const SCRIPTS: Record<string, () => Move[]> = {
  // Широкая дуга, затем короткий прямой рывок.
  bluegill: () => [arc("toward", 1.15), dash("away", 0.3)],
  // Два противоположных рывка, затем долгое затишье.
  catfish: () => [
    dash("away", 0.45, true),
    pause(0.3),
    dash("toward", 0.45, true),
    pause(1.8),
  ],
  // Два последовательных рывка в одном направлении.
  capelin: () => [dash("flip", 0.26), pause(0.12), dash("same", 0.26)],
  // Рывок, затем движения по диагонали.
  rainbowtrout: () => [dash("flip", 0.32, true), wave(0.9, 0.26, 1.2)],
  // Широкие боковые движения, затем рывок за пределы круга.
  largemouthbass: () => [
    arc("toward", 1),
    arc("away", 1),
    dash("away", 0.34, true),
  ],
  // Плавные широкие дуги, рывки, долгое затишье.
  carp: () => [
    arc("away", 1.15),
    arc("toward", 1.15),
    dash("away", 0.3),
    dash("toward", 0.3),
    pause(1.5),
  ],
  // Уплывает от рыбака, затем поворачивает с малыми амплитудами.
  cod: () => [dash("away", 0.5, true), wave(1.1, 0.2, 1), wave(1.1, 0.2, 1)],
  // Длинный прямой рывок, затем короткий вбок.
  sturgeon: () => [
    dash("away", 0.95, true),
    pause(0.15),
    dash("toward", 0.26, true),
  ],
  // Три коротких рывка в разные стороны, затем длительное затишье.
  sardine: () => [
    dash("flip", 0.24),
    pause(0.1),
    dash("flip", 0.24),
    pause(0.1),
    dash("flip", 0.24),
    pause(1.4),
  ],
  // Длинные и прямые выпады в противоположную сторону.
  tuna: () => [
    dash("away", 0.62, true),
    pause(0.25),
    dash("away", 0.62, true),
    pause(0.6),
  ],
  // Несколько рывков по диагонали в противоположных направлениях.
  redsnapper: () => [dash("flip", 0.28), dash("flip", 0.28), pause(0.35)],
  // Дугообразные рывки.
  tilapia: () => [arc("away", 0.95), arc("toward", 0.95)],
  // Долгое затишье, затем короткий прямой рывок.
  walleye: () => [pause(2), dash("flip", 0.28, true)],
  // Короткий рывок вбок, затем движение по кривой.
  angelfish: () => [dash("flip", 0.22), arc("flip", 0.9)],
  // Рывки по траектории в форме буквы S.
  eel: () => [wave(1.5, 0.4, 2), dash("flip", 0.3)],
  // Медленно, с переменными рывками за пределы круга.
  lionfish: () => [
    pause(0.9),
    dash("away", 0.48, true),
    pause(0.7),
    dash("toward", 0.48, true),
    pause(0.6),
  ],
  // Медленно, поворачивает плавно, чередуя стороны.
  grouper: () => [wave(2.4, 0.3, 1.5)],
  // Два прямых рывка, второй под углом к первому.
  flounder: () => [dash("flip", 0.3), pause(0.2), dash("away", 0.4)],
  // Диагональные рывки ближе к границе круга.
  smallmouthbass: () => [
    dash("away", 0.34),
    pause(0.15),
    dash("flip", 0.34),
    pause(0.15),
  ],
  // Короткий рывок, небольшая дуга, длинный изогнутый рывок.
  chub: () => [dash("flip", 0.24), arc("flip", 0.6), arc("away", 1, true)],
};

const FALLBACK: Move[] = [
  dash("flip", 0.35),
  pause(0.5),
  arc("away", 1),
  zigzag(3, 0.9),
  pause(0.8),
];

export function buildScript(fish: FishSpecies): Move[] {
  const factory = SCRIPTS[fish.behavior];
  if (factory) return factory();
  return FALLBACK;
}
