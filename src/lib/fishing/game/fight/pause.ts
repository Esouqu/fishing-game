import { FIGHT } from "../../config";
import type { FightCounter } from "./counter";
import type { FightMotion } from "./motion";
import type { FightState } from "./state";

/**
 * Resolve the dash that was live when the round went into the pause menu.
 *
 * The pause freezes the whole fight, so without this a player could stop the
 * clock on any telegraph, study it for as long as they liked, and come back to
 * the same counter window. A reaction window must not be banked through a
 * menu: the dash the player paused on resolves now, along its true heading, and
 * its counter window is already spent. A pause during the calm part of the
 * fight costs nothing, and the landing window is not touched — the final pull
 * is a single deliberate button, not a timed window.
 */
export function resumeFightAfterPause(
  state: FightState,
  motion: FightMotion,
  counter: FightCounter,
): void {
  if (!state.running) return;
  if (state.warnTime > 0) {
    if (motion.resolveTelegraph()) {
      counter.openWindow();
    } else {
      // A paused feint resolves fully: the false lunge and then the turn.
      motion.resolveFeintTurn();
      counter.openWindow(FIGHT.feintWindow);
    }
  } else if (state.feintTimer > 0) {
    motion.resolveFeintTurn();
    counter.openWindow(FIGHT.feintWindow);
  }
  counter.consumeUnanswered();
}
