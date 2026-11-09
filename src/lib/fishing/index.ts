import { Game } from "./Game";
import type { FishingGameInstance, FishingGameOptions } from "./types";

/**
 * Creates and mounts the fishing game inside the given element.
 *
 * ```ts
 * const game = await createFishingGame({ container: document.getElementById("game")! });
 * // later
 * game.destroy();
 * ```
 */
export async function createFishingGame(
  options: FishingGameOptions,
): Promise<FishingGameInstance> {
  return Game.create(options);
}

export { Game } from "./Game";
export type { LeaderboardViewOptions } from "./Game";
export type {
  CatchRecord,
  FishingGameInstance,
  FishingGameOptions,
  LeaderboardEntry,
  LeaderboardStanding,
  SessionResult,
  StartScreen,
} from "./types";
export {
  FISH,
  CASTS_PER_SESSION,
  COMBO_MULTIPLIERS,
  PERFECT_MULTIPLIER,
} from "./config";
