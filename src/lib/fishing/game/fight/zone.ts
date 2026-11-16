import { FIGHT } from "../../config";
import { FIGHT_RADIUS, MAX_SLIPS } from "./constants";
import type { FightState } from "./state";

/** Advances the escape/slip clock. Returns true when the fish tore free. */
export function updateZone(state: FightState, dt: number): boolean {
  const s = state;
  const distance = Math.hypot(s.fishX, s.fishY);
  const outside = distance > FIGHT_RADIUS;

  if (outside && !s.outside && s.slipCooldown <= 0) {
    // Two slips are still a perfect catch; the third breaks it.
    s.slips += 1;
    s.perfect = s.slips <= MAX_SLIPS;
    s.slipCooldown = 0.5;
  }
  s.outside = outside;
  s.slipCooldown = Math.max(0, s.slipCooldown - dt);

  if (distance > FIGHT_RADIUS) {
    // Reeling against the fish slows the escape clock to a crawl, but only
    // actually getting it back inside stops the clock. A passive player
    // therefore loses the fish, while an active one can recover.
    s.outsideTimer += dt * (s.steeringNow ? FIGHT.escapePullFactor : 1);
    if (s.outsideTimer >= s.escapeHold) return true;
  } else {
    // The cooldown is deliberately slow so a series of dashes still adds up.
    s.outsideTimer = Math.max(0, s.outsideTimer - dt * 0.12);
  }
  return false;
}
