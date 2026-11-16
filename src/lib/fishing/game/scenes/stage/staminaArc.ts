import type { Graphics } from "pixi.js";
import { C, FIGHT } from "../../../config";
import { clamp } from "../../../utils";
import { STAMINA_ARC_RADIUS } from "./setup";

/** The arc under the float: 0.18π..0.82π in canvas space. */
const FROM = Math.PI * 0.18;
const TO = Math.PI * 0.82;

/**
 * The fish's remaining endurance, as a half-ring under the float.
 *
 * It used to be the escape clock, but a second pressure gauge next to the
 * sinking float told the player the same thing twice. The float now owns the
 * escape cue — the more the fish pulls away, the deeper it goes under — and
 * this arc answers the other question: how much fight is left in the fish. It
 * drains from the left as the fish tires; the pale outer rim appears when the
 * catch is landable.
 *
 * The arc is drawn in the float's local space, so it follows the bobber as the
 * fish drags it around the ring.
 */
export function drawFishStamina(
  g: Graphics,
  value: number,
  time: number,
): void {
  g.clear();
  const stamina = clamp(value);
  const ready = stamina <= FIGHT.landThreshold;
  const color = stamina <= 0.5 ? C.gold : C.cyan;

  g.arc(0, 0, STAMINA_ARC_RADIUS, FROM, TO).stroke({
    width: 3,
    color: C.ink,
    alpha: 0.3,
    cap: "round",
  });
  if (stamina > 0.01) {
    g.arc(0, 0, STAMINA_ARC_RADIUS, FROM, FROM + (TO - FROM) * stamina).stroke({
      width: 1.5,
      color,
      alpha: 0.95,
      cap: "round",
    });
  }

  // Landing threshold on the fish's own gauge: when the draining arc reaches
  // this notch the final pull opens. It belongs here, on the endurance arc, not
  // on the player's stamina bar — it is the fish's condition, not the angler's.
  const threshold = FROM + (TO - FROM) * FIGHT.landThreshold;
  const cos = Math.cos(threshold);
  const sin = Math.sin(threshold);
  g.moveTo(cos * (STAMINA_ARC_RADIUS - 3), sin * (STAMINA_ARC_RADIUS - 3))
    .lineTo(cos * (STAMINA_ARC_RADIUS + 3), sin * (STAMINA_ARC_RADIUS + 3))
    .stroke({ width: 1, color: C.cream, alpha: 0.8 });

  if (ready) {
    // Tired enough to land: the same gold breathes one pixel outside the gauge,
    // so the window reads without a second object over the water.
    const pulse = (Math.sin(time * 8) + 1) / 2;
    g.arc(0, 0, STAMINA_ARC_RADIUS + 1.5, FROM, TO).stroke({
      width: 1,
      color: C.gold,
      alpha: 0.2 + pulse * 0.4,
      cap: "round",
    });
  }
}
