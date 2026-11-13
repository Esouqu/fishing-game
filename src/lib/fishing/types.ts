import type { Application } from "pixi.js";

export type WeatherId = "clear" | "overcast" | "rain" | "storm" | "fog";
export type TimePhase = "dawn" | "day" | "dusk" | "night";

export interface CatchRecord {
  fishId: string;
  name: string;
  latin: string;
  points: number;
  perfect: boolean;
  /** Rolled catch weight in kilograms. */
  weightKg: number;
  /** Combo multiplier applied to this catch. */
  multiplier: number;
}

export interface SessionResult {
  score: number;
  casts: number;
  caught: number;
  perfect: number;
  bestFish: CatchRecord | null;
  catches: CatchRecord[];
  /** Longest streak of successful catches in a row. */
  bestStreak: number;
  /** Highest combo multiplier reached during the session. */
  bestMultiplier: number;
  date: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  caught: number;
  best: string;
  date: number;
  bot?: boolean;
}

export interface LeaderboardStanding {
  rank: number;
  total: number;
  inTop: boolean;
  entry: LeaderboardEntry;
}

export type StartScreen = "menu" | "game";

export interface FishingGameOptions {
  /** Element the canvas is appended to. Required. */
  container: HTMLElement;
  /** Base URL of the copied art/font folder. Default: `/assets/fishing`. */
  assetBase?: string;
  /** localStorage namespace so multiple games do not share scores. */
  storagePrefix?: string;
  /** Start muted. */
  muted?: boolean;
  /** Open the menu or jump straight into a session. */
  startScreen?: StartScreen;
  /** Nickname saved with the result in the local leaderboard. */
  playerName?: string;
  /** Called when the player presses "Выход" in the menu (if provided). */
  onExit?: () => void;
  /** Called once a 10-cast session is completed. */
  onScore?: (result: SessionResult) => void;
  /** Called when the painter is ready to be interacted with. */
  onReady?: () => void;
}

export interface FishingGameInstance {
  readonly app: Application;
  readonly muted: boolean;
  destroy(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  showMenu(): void;
  setMuted(muted: boolean): void;
}

export interface NormalizedOptions {
  container: HTMLElement;
  assetBase: string;
  storagePrefix: string;
  muted: boolean;
  startScreen: StartScreen;
  playerName: string;
  onExit?: () => void;
  onScore?: (result: SessionResult) => void;
  onReady?: () => void;
}

export function normalizeOptions(
  options: FishingGameOptions,
): NormalizedOptions {
  const base = options.assetBase ?? `${import.meta.env.BASE_URL}assets/fishing`;
  return {
    container: options.container,
    assetBase: base.replace(/\/+$/, ""),
    storagePrefix: options.storagePrefix ?? "quiet-cove",
    muted: options.muted ?? false,
    startScreen: options.startScreen ?? "menu",
    playerName: (options.playerName ?? "").trim(),
    onExit: options.onExit,
    onScore: options.onScore,
    onReady: options.onReady,
  };
}
