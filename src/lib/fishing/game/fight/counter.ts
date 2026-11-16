import { FIGHT } from "../../config";
import { angleDelta } from "./angles";
import type { FightState } from "./state";

/** The short window in which pulling against a dash cancels it. */
export class FightCounter {
  constructor(private readonly state: FightState) {}

  openWindow(window: number = FIGHT.counterWindow): void {
    const s = this.state;
    s.counterWindow = window;
    s.counterAngle = s.escapeAngle;
    s.counterArmed = s.warnRest >= FIGHT.counterRest;
    s.preBurstAngle = s.lastSteerAngle;
    s.counterUsed = false;
    s.counterPending = true;
  }

  update(step: number, pull: { x: number; y: number } | null): void {
    const s = this.state;
    if (s.counterPending) {
      s.counterWindow = Math.max(0, s.counterWindow - step);
      if (s.counterWindow <= 0) {
        s.counterPending = false;
        // A strong dash that was not answered pushes the fish closer to
        // tearing free; holding the button alone does not count as an answer.
        s.outsideTimer = Math.min(
          s.escapeHold - 0.001,
          s.outsideTimer + FIGHT.uncounteredBurst,
        );
      }
    }
    if (s.counterWindow <= 0 || s.counterUsed || !pull) return;

    const angle = Math.atan2(pull.y, pull.x);
    const opposed =
      Math.abs(angleDelta(angle, s.counterAngle + Math.PI)) <=
      FIGHT.counterAngle;
    const reversed =
      s.preBurstAngle !== null &&
      Math.abs(angleDelta(s.preBurstAngle, angle)) > Math.PI / 2;

    if (!opposed || (!s.counterArmed && !reversed)) return;

    s.counterUsed = true;
    s.counterPending = false;
    s.counterWindow = 0;
    s.outsideTimer = Math.max(0, s.outsideTimer - FIGHT.counterRelief);
    s.advantage = FIGHT.advantage;
    s.counterFlash = 0.6;
    s.vx = 0;
    s.vy = 0;
    if (s.current) s.moveTime = s.current.dur;
    s.stun = FIGHT.counterStun;
    s.onCounter?.();
  }
}
