import { LUCK_BAND } from "../../config";
import { randRange } from "../../utils";
import { CastFlowCore } from "./CastFlowCore";
import { PULL_KEYS, PRIMARY_KEYS, type PullKey } from "./setup";

export abstract class CastFlowInput extends CastFlowCore {
  setPointer(x: number, y: number): void {
    this.pointerX = x;
    this.pointerY = y;
  }

  pointerDown(button: number, pointerType = "mouse"): void {
    // Right click is the final pull; the browser menu is suppressed.
    if (button === 2) return;
    const target =
      this.phaseValue === "fighting" && !this.paused
        ? this.fight.landingTarget
        : null;
    // A tap on the tired fish lands it, but only on a touch screen. With a
    // mouse, the left button *is* the reel: pressing it with the cursor over
    // the fish used to land the catch on the release, so the same button both
    // pulled the line and loosed the strike. Desktop players keep RMB / F for
    // the final pull.
    const tap = pointerType === "touch" || pointerType === "pen";
    if (target && tap) {
      const dx = this.pointerX - target.x;
      const dy = this.pointerY - target.y;
      if (Math.hypot(dx, dy) <= 20) {
        this.tapLanding = true;
        this.tapIconX = target.x;
        this.tapIconY = target.y;
        return;
      }
    }
    this.tapLanding = false;
    this.pressStart();
  }

  pointerUp(): void {
    if (this.tapLanding) {
      const moved = Math.hypot(
        this.pointerX - this.tapIconX,
        this.pointerY - this.tapIconY,
      );
      this.tapLanding = false;
      if (moved <= 22) {
        this.finalPull();
        return;
      }
    }
    this.pressEnd();
  }

  pointerCancel(): void {
    this.tapLanding = false;
    this.pressEnd();
  }

  /** Gameplay keys; the screen handles pause and codex first. */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.phaseValue === "fighting" && event.code === "KeyF") {
      if (!event.repeat) this.finalPull();
      return true;
    }
    if (this.phaseValue === "fighting" && event.code in PULL_KEYS) {
      this.pullKeys.add(event.code as PullKey);
      return true;
    }
    if (PRIMARY_KEYS.has(event.code)) {
      if (!event.repeat) this.pressStart();
      return true;
    }
    return false;
  }

  handleKeyUp(event: KeyboardEvent): void {
    if (this.pullKeys.delete(event.code as PullKey)) return;
    if (PRIMARY_KEYS.has(event.code)) this.pressEnd();
  }
  protected pressStart(): void {
    if (this.paused) return;
    if (this.phaseValue === "idle") {
      this.phaseValue = "charging";
      this.scene.setPulling(true);
      this.chargeValue = 0;
      this.chargeDir = 1;
      this.chargeSoundTimer = 0;
      this.chargeTime = 0;
      this.lastZoneInside = -Infinity;
      this.wasInsideZone = false;
      this.luckZoneHit = false;
      this.luckBandCenterValue = randRange(LUCK_BAND.min, LUCK_BAND.max);
    } else if (this.phaseValue === "waiting") {
      // The wait starts the moment the cast is released, but the float needs
      // `castFlight` seconds to hit the water. A press during that arc is not a
      // strike: before this guard it counted as an early hook and spooked a
      // fish that had not even landed yet.
      if (!this.scene.castLanded) return;
      this.earlyHook();
    } else if (this.phaseValue === "bite") {
      // The player just pressed on the bite prompt — hook immediately. The
      // fight starts with no strike held, so landing stays a deliberate press.
      this.pressed = true;
      this.hookFish();
    } else if (this.phaseValue === "fighting") {
      this.pressed = true;
      this.scene.setPulling(true);
      this.fight.setHold(true);
    }
  }

  protected pressEnd(): void {
    this.pressed = false;
    this.scene.setPulling(false);
    if (this.phaseValue === "charging") this.doCast();
    this.fight.setHold(false);
  }

  /** Final pull: RMB/F on desktop, a tap on the tired fish on touch. */
  finalPull(): void {
    if (this.phaseValue !== "fighting" || this.paused) return;
    this.fight.finalPull();
  }
  protected readPullDirection(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const key of this.pullKeys) {
      const [dx, dy] = PULL_KEYS[key];
      x += dx;
      y += dy;
    }
    const length = Math.hypot(x, y);
    return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }
}
