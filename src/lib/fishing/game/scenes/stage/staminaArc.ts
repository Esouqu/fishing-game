import type { Graphics } from "pixi.js";
import { C, FIGHT } from "../../../config";
import { clamp } from "../../../utils";
import { STAMINA_ARC_RADIUS } from "./setup";

/**
 * The gauge is a shallow stub under the float, not a half-ring: it used to wrap
 * most of the float and read as a second outline of the bobber. A quarter turn
 * is enough to show a 0..1 value and leaves the waterline ring around the float
 * alone.
 */
const FROM = Math.PI * 0.25;
const TO = Math.PI * 0.75;
const SPAN = TO - FROM;

/**
 * The fish's remaining endurance, as a thick stub under the float.
 *
 * It used to be the escape clock, but a second pressure gauge next to the
 * sinking float told the player the same thing twice. The float now owns the
 * escape cue — the more the fish pulls away, the deeper it goes under — and
 * this arc answers the other question: how much fight is left in the fish. It
 * drains from the right end towards the left as the fish tires; the pale outer
 * tick is the landing threshold, where the final pull opens.
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
    width: 4,
    color: C.ink,
    alpha: 0.3,
    cap: "round",
  });
  if (stamina > 0.01) {
    g.arc(0, 0, STAMINA_ARC_RADIUS, FROM, FROM + SPAN * stamina).stroke({
      width: 2.5,
      color,
      alpha: 0.95,
      cap: "round",
    });
  }

  // Landing threshold on the fish's own gauge: when the draining arc reaches
  // this notch the final pull opens. It belongs here, on the endurance arc, not
  // on the player's stamina bar — it is the fish's condition, not the angler's.
  const threshold = FROM + SPAN * FIGHT.landThreshold;
  const cos = Math.cos(threshold);
  const sin = Math.sin(threshold);
  g.moveTo(cos * (STAMINA_ARC_RADIUS - 3.5), sin * (STAMINA_ARC_RADIUS - 3.5))
    .lineTo(cos * (STAMINA_ARC_RADIUS + 3.5), sin * (STAMINA_ARC_RADIUS + 3.5))
    .stroke({ width: 1, color: C.cream, alpha: 0.85 });

  if (ready) {
    // Tired enough to land: the still-drawn part of the gauge breathes.
    //
    // The glow used to wrap the whole arc, so at the threshold — when only a
    // fifth of the gauge is left — the empty rest lit up as a second, muddy gold
    // band and the arc read as full. Keeping the pulse on the filled segment
    // makes the highlight say the same thing as the fill: this is how much fish
    // is left, and now it can be landed.
    const pulse = (Math.sin(time * 8) + 1) / 2;
    const lit = Math.max(stamina, 0.06);
    g.arc(0, 0, STAMINA_ARC_RADIUS, FROM, FROM + SPAN * lit).stroke({
      width: 2.5 + pulse * 0.8,
      color: C.gold,
      alpha: 0.55 + pulse * 0.45,
      cap: "round",
    });
  }
}
