import type { Graphics } from "pixi.js";
import { C, FIGHT } from "../../../config";
import { clamp } from "../../../utils";
import { FLOAT_ARC_RADIUS } from "./setup";

/** Escape half-ring: 0.18π..0.82π in canvas space, i.e. under the float. */
const ESCAPE_FROM = Math.PI * 0.18;
const ESCAPE_TO = Math.PI * 0.82;
/** Stamina half-ring: the same span mirrored over the float. */
const STAMINA_FROM = -ESCAPE_FROM;
const STAMINA_TO = -ESCAPE_TO;
/** Both gauges share this share of a full turn. */
const SPAN = ESCAPE_TO - ESCAPE_FROM;

/** From this share of the escape meter the fish is about to tear the line off. */
const ESCAPE_WARN = 0.7;

/**
 * The groove both gauges are drawn in. The rail used to be a dark ink line,
 * which vanished against the night water and left the empty part of a gauge
 * invisible; a pale steel line reads as an empty track at a glance.
 */
function drawRail(
  g: Graphics,
  from: number,
  to: number,
  counterclockwise: boolean,
): void {
  g.arc(0, 0, FLOAT_ARC_RADIUS, from, to, counterclockwise).stroke({
    width: 2.5,
    color: C.steelPale,
    alpha: 0.35,
    cap: "round",
  });
}

/**
 * The fish's remaining endurance, as a half-ring over the float.
 *
 * The pair of arcs around the float tells the whole fight: this one answers
 * "how much fight is left in the fish". It drains from the right end towards
 * the left, leaving a shrinking core on the right; the pale tick is the landing
 * threshold, where the final pull opens. The escape clock is the mirrored arc
 * under the float.
 *
 * Both are drawn in the float's local space, so they follow the bobber as the
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

  drawRail(g, STAMINA_FROM, STAMINA_TO, true);
  if (stamina > 0.01) {
    g.arc(
      0,
      0,
      FLOAT_ARC_RADIUS,
      STAMINA_FROM,
      STAMINA_FROM - SPAN * stamina,
      true,
    ).stroke({
      width: 1.5,
      color,
      alpha: 0.95,
      cap: "round",
    });
  }

  // Landing threshold on the fish's own gauge: when the draining arc reaches
  // this notch the final pull opens. It belongs here, on the endurance arc, not
  // on the player's stamina bar — it is the fish's condition, not the angler's.
  const threshold = STAMINA_FROM - SPAN * FIGHT.landThreshold;
  const cos = Math.cos(threshold);
  const sin = Math.sin(threshold);
  g.moveTo(cos * (FLOAT_ARC_RADIUS - 3), sin * (FLOAT_ARC_RADIUS - 3))
    .lineTo(cos * (FLOAT_ARC_RADIUS + 3), sin * (FLOAT_ARC_RADIUS + 3))
    .stroke({ width: 1, color: C.cream, alpha: 0.8 });

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
    g.arc(
      0,
      0,
      FLOAT_ARC_RADIUS,
      STAMINA_FROM,
      STAMINA_FROM - SPAN * lit,
      true,
    ).stroke({
      width: 1.5 + pulse * 0.6,
      color: C.gold,
      alpha: 0.55 + pulse * 0.45,
      cap: "round",
    });
  }
}

/**
 * How far the fish has torn the line out, as the half-ring under the float.
 *
 * The escape used to be told by the float sinking alone, which read as the
 * float bobbing rather than as a countdown. The pair of arcs now says both
 * halves of the fight at a glance: the top one empties as the fish tires, this
 * one fills from the right side as the line runs out. From `ESCAPE_WARN` the
 * red starts breathing, so the last stretch is noticed without reading numbers.
 */
export function drawFishEscape(g: Graphics, value: number, time: number): void {
  g.clear();
  const escape = clamp(value);

  drawRail(g, ESCAPE_FROM, ESCAPE_TO, false);
  if (escape <= 0.01) return;

  const danger = escape >= ESCAPE_WARN;
  const pulse = danger ? (Math.sin(time * 9) + 1) / 2 : 0;
  g.arc(
    0,
    0,
    FLOAT_ARC_RADIUS,
    ESCAPE_FROM,
    ESCAPE_FROM + SPAN * escape,
  ).stroke({
    width: danger ? 1.5 + pulse * 1 : 1.5,
    color: C.red,
    alpha: danger ? 0.7 + pulse * 0.3 : 0.85,
    cap: "round",
  });
}
