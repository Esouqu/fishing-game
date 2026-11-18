import { FIGHT } from "../../config";
/**
 * The numbers behind the dash zone, in one editable table.
 *
 * The zone is a feel, and a feel can only be judged while it moves, so these
 * live here instead of as `const`s in the rules: the dev panel (`F8`) turns them
 * while the fight runs. The model *and* the view read this object every frame,
 * so a slider changes both the picture and what the fight accepts вЂ” the
 * highlight and the rule cannot drift apart.
 *
 * Nothing is persisted by the game: the panel's В«Р’ РљРћР”В» writes the whole table
 * back into this file through the dev server, so a tuned set becomes the
 * shipped default.
 */
export interface ZoneTuning {
  /** Seconds for the zone to fade in when it appears; 0 is an instant cut. */
  fadeIn: number;
  /** Seconds for it to fade out once the dash is over. */
  fadeOut: number;
  /** Seconds before the real zone of a feint appears, after the false one. */
  delay: number;
  /**
   * How long the real zone stays on screen, in seconds. The counter is open for
   * exactly this long: a press inside the band is a grab for as long as the band
   * is painted, and the ant never has to guess when a shorter window opens.
   */
  truthTime: number;
  /** How long the false zone of a feint stays on screen, in seconds. */
  lieTime: number;
  /** Seconds for a zone that was countered to drain to the blocked grey. */
  greyTime: number;
  /** Half-angle of the grab wedge, in degrees. */
  grabArc: number;
  /** Inner radius of the wedge band, in pixels from the centre of the ring. */
  distance: number;
  /** Depth of the band, in pixels, from `distance` outwards. */
  grabDepth: number;
  /**
   * Smallest and largest gap between the *edges* of the false and the real zone
   * of a feint, in degrees: the angle between the two headings is this plus the
   * two half-angles, so a gap of 0 means the zones touch.
   */
  spreadMin: number;
  spreadMax: number;
  /** Minimum quiet time between two dashes, in seconds. */
  dashGap: number;
  /** Fill and rim opacity, 0..1. */
  fill: number;
  rim: number;
  /** Rim thickness, in pixels. */
  rimWidth: number;
  /** Draw the rim outside the zone's edge instead of inside it. */
  rimOutside: boolean;
  /** How far the drag has to travel toward the centre before the grab counts, in pixels. */
  counterDrag: number;
  /** Seconds of rest through the telegraph that arm the grab without a fresh press. */
  counterRest: number;
  /** Seconds the fish hangs stunned after a landed counter. */
  counterStun: number;
  /**
   * The padlock that seals a landed counter: how long it stays lit, how big it
   * is, how high it rides above its anchor and whether it hangs on the float
   * (where the player is already looking) or on the fish.
   */
  lockTime: number;
  lockScale: number;
  lockLift: number;
  lockAtFloat: boolean;
  /**
   * The counter's receipt ring, drawn around the float: the radius it starts at
   * and how far it runs out while the stun lasts.
   */
  cueSize: number;
  cueGrow: number;
}

// #region zone-mix
export const ZONE_DEFAULTS: ZoneTuning = {
  fadeIn: 0.15,
  fadeOut: 0.3,
  delay: 0.3,
  truthTime: 0.7,
  lieTime: 0.5,
  greyTime: 0.15,
  grabArc: 18.0,
  distance: 30.0,
  grabDepth: 20.0,
  spreadMin: 10.0,
  spreadMax: 30.0,
  dashGap: 0.7,
  fill: 0.16,
  rim: 0.5,
  rimWidth: 1.0,
  rimOutside: false,
  counterDrag: FIGHT.counterDrag,
  counterRest: FIGHT.counterRest,
  counterStun: FIGHT.counterStun,
  lockTime: 0.35,
  lockScale: 1,
  lockLift: -4,
  lockAtFloat: true,
  cueSize: 12,
  cueGrow: 12,
};
// #endregion zone-mix

/** Live values: the panel writes, the fight reads. */
export const zoneTuning: ZoneTuning = { ...ZONE_DEFAULTS };

export function resetZoneTuning(): void {
  Object.assign(zoneTuning, ZONE_DEFAULTS);
}

/** Degrees to radians, for the angular knobs. */
export function zoneRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Inner radius of the grab band, in pixels. */
export function zoneInner(): number {
  return zoneTuning.distance;
}

/** Outer radius of the grab band, in pixels. */
export function zoneOuter(): number {
  return zoneTuning.distance + zoneTuning.grabDepth;
}

/** Half-angle of the grab band, in radians. */
export function zoneArc(): number {
  return zoneRadians(zoneTuning.grabArc);
}

/**
 * Angular offset of a feint's false heading from the real one, in radians: the
 * panel's edge gap plus the two half-angles that separate the headings themselves.
 */
export function zoneFeintOffset(gapDegrees: number): number {
  return zoneRadians(gapDegrees) + zoneArc() * 2;
}
