import { FIGHT } from "../../config";
import { angleDelta } from "./angles";
import { FIGHT_RADIUS } from "./constants";
import type { FightState } from "./state";
import { depositMissShare, relieveEscape } from "./zone";

/**
 * How far past the rim the warning arrow reaches, in pixels.
 *
 * The view draws it as two chevrons at `FIGHT_RADIUS + 6` and `+ 12`, so the
 * grab target sits between them: the player grabs the arrow, not the water in
 * front of the fish.
 */
export const COUNTER_ARROW_REACH = FIGHT_RADIUS + 9;

/**
 * The grab wedge: the dash side of the ring, where a press starts a counter.
 *
 * It used to be a disc around the arrow tip, which meant "press this pixel".
 * The press is a direction, not a pixel: the player reads "the fish will bolt
 * that way" and puts the button down on that side, then pulls to the middle of
 * the ring. A wedge from the ring out to just past the arrow is the same
 * gesture with room for the hand, and the view highlights exactly this shape,
 * so the spot the player sees and the spot the model accepts cannot disagree.
 *
 * It is deliberately a band, not the whole side of the water: the press has to
 * be aimed at the dash, so the float and the open middle stay out of it.
 *
 * `COUNTER_GRAB_ARC` is the half-angle around the dash heading, in radians;
 * the radii bound the muscle of the ring, so the middle (where the player aims
 * during ordinary pulling) stays outside the grab.
 */
export const COUNTER_GRAB_ARC = 0.5;
/** Inner radius of the wedge, in pixels: no grabbing over the float. */
export const COUNTER_GRAB_INNER = FIGHT_RADIUS * 0.8;
/** Outer radius: past the arrow tip by `counterGrab`. */
export const COUNTER_GRAB_OUTER = COUNTER_ARROW_REACH + FIGHT.counterGrab;

/** Is `(x, y)` inside the grab wedge centred on `heading`? */
export function inGrabWedge(
  state: FightState,
  x: number,
  y: number,
  heading: number,
): boolean {
  const dx = x - state.centerX;
  const dy = y - state.centerY;
  const radius = Math.hypot(dx, dy);
  if (radius < COUNTER_GRAB_INNER || radius > COUNTER_GRAB_OUTER) return false;
  return Math.abs(angleDelta(Math.atan2(dy, dx), heading)) <= COUNTER_GRAB_ARC;
}

/** Where the button went down: inside the wedge of the dash? */
function pressInWedge(state: FightState, heading: number): boolean {
  if (state.pressX === null || state.pressY === null) return false;
  return inGrabWedge(state, state.pressX, state.pressY, heading);
}

/**
 * Is this press-and-drag the counter gesture?
 *
 * The counter used to be an aim: hold the line and point the pull against the
 * dash, and the burst was cancelled if the angle was close enough. That made
 * every dash the same reflex — pull the other way — and it fought with the aim
 * the player was already using to drag the fish back into the ring, so a
 * perfectly normal pull could spend the counter without meaning to.
 *
 * Now the move is physical: the press has to land on the dash side of the
 * ring, and the drag has to travel toward the middle of the ring. The same
 * gesture as a finger pinning the burst by its tail. Aim still matters for
 * everything else; the counter is its own beat.
 */
export function counterGesture(state: FightState): boolean {
  const s = state;
  if (s.pointerX === null || s.pointerY === null) return false;
  if (!pressInWedge(s, s.counterAngle)) return false;

  const dragX = s.pointerX - s.pressX!;
  const dragY = s.pointerY - s.pressY!;
  const drag = Math.hypot(dragX, dragY);
  if (drag < FIGHT.counterDrag) return false;

  // Toward the middle: the drag has to point at the ring's centre, within a
  // generous cone. A drag that circles the ring is not a pull on the line.
  const toCentreX = s.centerX - s.pressX!;
  const toCentreY = s.centerY - s.pressY!;
  const reach = Math.hypot(toCentreX, toCentreY);
  if (reach <= 0) return false;
  const inward = (dragX * toCentreX + dragY * toCentreY) / (drag * reach);
  return inward >= Math.cos(Math.PI / 3);
}

/** The short window in which the gesture cancels a dash. */
export class FightCounter {
  constructor(private readonly state: FightState) {}

  openWindow(window: number = FIGHT.counterWindow): void {
    const s = this.state;
    s.counterWindow = window;
    s.counterAngle = s.escapeAngle;
    // Resting through the telegraph is one way into the window; the other is a
    // press prepared on the dash side, which `notePress` latched.
    s.counterArmed = s.warnRest >= FIGHT.counterRest;
    s.preBurstAngle = s.lastSteerAngle;
    s.counterUsed = false;
    s.counterPending = true;
  }

  /**
   * A new press just went down. If a dash was already live, the grab is
   * prepared: the player pressed on the warning, not a moment after the burst.
   * Otherwise the press belongs to ordinary pulling and arms nothing.
   */
  notePress(): void {
    const s = this.state;
    s.counterPrepared =
      s.warnTime > 0 || s.feintTimer > 0 || s.counterWindow > 0;
  }

  /**
   * Close the window as unanswered. The round uses this when a pause froze a
   * live dash: the player got a longer look, so the dash still costs what a
   * missed counter costs instead of waiting harmlessly in the pause.
   */
  consumeUnanswered(): void {
    const s = this.state;
    if (!s.counterPending) return;
    s.counterPending = false;
    s.counterWindow = 0;
    s.counterUsed = true;
    s.escapeLock = FIGHT.escapeLockTime;
    depositMissShare(s, FIGHT.uncounteredBurst * s.escapeHold);
  }

  update(step: number, pull: { x: number; y: number } | null): void {
    const s = this.state;
    if (s.counterPending) {
      s.counterWindow = Math.max(0, s.counterWindow - step);
      if (s.counterWindow <= 0) {
        s.counterPending = false;
        // A strong dash that was not answered pushes the fish closer to
        // tearing free; holding the button alone does not count as an answer.
        s.escapeLock = FIGHT.escapeLockTime;
        depositMissShare(s, FIGHT.uncounteredBurst * s.escapeHold);
      }
    }
    if (s.counterWindow <= 0 || s.counterUsed || !pull) return;
    // The burst is still ablaze: its heading can be read on the same frame the
    // gesture lands, so the arrow and the grab cannot disagree.
    s.counterAngle = s.escapeAngle;
    if (!counterGesture(s)) return;
    // A grab that skips the rest is still a deliberate press: either it landed
    // on the live dash (`counterPrepared`) or it is this very frame's edge. The
    // gate only keeps a pull that was already running from turning into a
    // counter by drag.
    if (!s.counterArmed && !s.counterPrepared && !s.freshPress) return;

    s.counterUsed = true;
    s.counterPending = false;
    s.counterWindow = 0;
    // The counter pays back most of a miss, pending fill included.
    relieveEscape(s, FIGHT.counterRelief * s.escapeHold);
    s.advantage = FIGHT.advantage;
    // The lock cue lasts exactly as long as the stun: while it is on screen the
    // fish hangs still, so the player never sees a padlock on a fish that is
    // already jerking away again.
    s.counterFlash = FIGHT.counterStun;
    s.vx = 0;
    s.vy = 0;
    if (s.current) s.moveTime = s.current.dur;
    s.stun = FIGHT.counterStun;
    s.onCounter?.();
  }
}
