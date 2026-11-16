import { FIGHT, type FishSpecies } from "../../config";
import type { Temperament } from "../../types";
import { clamp } from "../../utils";
import { angleDelta } from "./angles";
import { BubbleField } from "./bubbles";
import { FIGHT_RADIUS, MAX_SPEED, PULL_ACCEL, TAU } from "./constants";
import { createFightState } from "./createState";
import { FightCounter } from "./counter";
import { pullVector } from "./input";
import { updateZone } from "./zone";
import { FightMotion } from "./motion";
import { FightStamina } from "./stamina";
import type { FightState } from "./state";
import type { Bubble, MinigameOptions, MinigameResult } from "./types";

/**
 * The whole ring-fight simulation, with no rendering attached.
 *
 * Holding the pull button tires the fish and spends grip; releasing the button
 * rests the fish and restores grip. Aim with the cursor or a direction key.
 * Bubbles warn about a burst; resting first and then pulling against it lands a
 * counter-pull. When the fish is tired and inside the circle, a separate final
 * pull lands it.
 *
 * The model is deliberately pure so the same rules can be replayed headlessly
 * by `scripts/simulate-fight.ts` without a browser or a Pixi renderer.
 */
export class FightModel {
  private readonly state: FightState;
  private readonly motion: FightMotion;
  private readonly stamina: FightStamina;
  private readonly counter: FightCounter;
  private readonly bubbleField: BubbleField;

  constructor(fish: FishSpecies, options: MinigameOptions) {
    const state = createFightState(fish, options);
    this.state = state;
    this.motion = new FightMotion(state);
    this.stamina = new FightStamina(state);
    this.counter = new FightCounter(state);
    this.bubbleField = new BubbleField(state);

    state.lastAngle = Math.random() * TAU;
    state.escapeAngle = state.lastAngle;
    this.motion.nextMove();
    this.update(0);
  }

  get centerX(): number {
    return this.state.centerX;
  }

  get centerY(): number {
    return this.state.centerY;
  }

  get result(): MinigameResult | null {
    return this.state.finishResult;
  }

  get onFinish(): ((result: MinigameResult) => void) | undefined {
    return this.state.onFinish;
  }

  set onFinish(handler: ((result: MinigameResult) => void) | undefined) {
    this.state.onFinish = handler;
  }

  get isRunning(): boolean {
    return this.state.running;
  }

  /** True while the player is actively steering; drives the reel sound. */
  get isSteering(): boolean {
    return this.state.steeringNow;
  }

  get time(): number {
    return this.state.elapsed;
  }

  get fishOffset(): { x: number; y: number } {
    return { x: this.state.fishX, y: this.state.fishY };
  }

  /** Screen position of the fish silhouette, used by the trailing float. */
  get fishPoint(): { x: number; y: number } {
    return {
      x: this.state.centerX + this.state.fishX,
      y: this.state.centerY + this.state.fishY,
    };
  }

  /** Current fish velocity, used to trail the float behind the fish. */
  get fishVelocity(): { x: number; y: number } {
    return { x: this.state.vx, y: this.state.vy };
  }

  get enduranceValue(): number {
    return this.state.endurance;
  }

  get gripValue(): number {
    return this.state.grip;
  }

  get isGripLocked(): boolean {
    return this.state.gripLock > 0;
  }

  get hasAdvantage(): boolean {
    return this.state.advantage > 0;
  }

  get isReady(): boolean {
    return this.state.ready;
  }

  get isOutside(): boolean {
    return this.state.outside;
  }

  /** 0..1 escape meter; 1 means the fish has torn free. */
  get escapeMeter(): number {
    return clamp(this.state.outsideTimer / this.state.escapeHold, 0, 1);
  }

  get warn(): number {
    return this.state.warnTime;
  }

  get warnHeading(): number {
    return this.state.warnAngle;
  }

  /** True while a feinting dash is still hiding its true heading. */
  get isFeint(): boolean {
    return this.state.feintActive;
  }

  /** True once the false lunge has turned into the real dash. */
  get feintRevealed(): boolean {
    return this.state.feintHasRevealed;
  }

  /** The heading the counter should oppose; true heading after a feint. */
  get counterHeading(): number {
    return this.state.escapeAngle;
  }

  /** True heading of the last feint, for the short turn flash. */
  get turnHeading(): number {
    return this.state.escapeAngle;
  }

  get turnFlash(): number {
    return this.state.turnFlashValue;
  }

  get counterFlashValue(): number {
    return this.state.counterFlash;
  }

  /** Remaining stun time after a successful counter. */
  get stunValue(): number {
    return this.state.stun;
  }

  get bubbles(): readonly Bubble[] {
    return this.state.bubbles;
  }

  get temperament(): Temperament {
    return this.state.temperament;
  }

  get escapeHold(): number {
    return this.state.escapeHold;
  }

  /** True when the fish is tired and inside the circle. */
  get canLand(): boolean {
    return this.state.running && this.state.ready;
  }

  /** Hold to pull; release to rest. */
  setHold(held: boolean): void {
    this.state.hold = held;
    if (!held) {
      this.state.stickyX = 0;
      this.state.stickyY = 0;
    }
  }

  /** Separate final pull: RMB/F, or a tap on the tired fish. */
  finalPull(): void {
    const s = this.state;
    if (!s.running || s.finalCooldown > 0) return;
    s.finalCooldown = FIGHT.resistCooldown;

    const inside = Math.hypot(s.fishX, s.fishY) <= FIGHT_RADIUS;
    if (s.endurance <= FIGHT.landThreshold && inside) {
      this.finish(true);
      return;
    }

    // Too early: the fish tears away and costs grip.
    s.endurance = clamp(s.endurance + FIGHT.resistEndurance);
    s.grip = clamp(s.grip - FIGHT.resistGrip);
    s.escapeAngle = this.fishAngle() + (Math.random() - 0.5) * 0.6;
    this.motion.bolt(0.45);
    s.onResist?.();
  }

  /** Cursor position in screen space; while held it sets the pull direction. */
  setPointer(x: number | null, y: number | null): void {
    this.state.pointerX = x;
    this.state.pointerY = y;
  }

  /** Optional keyboard steering direction (normalized by the caller). */
  setDirection(x: number, y: number): void {
    this.state.directionX = x;
    this.state.directionY = y;
  }

  update(dt: number): void {
    const s = this.state;
    if (!s.running) return;
    s.elapsed += dt;
    const step = Math.min(dt, 0.05);

    s.finalCooldown = Math.max(0, s.finalCooldown - step);

    const canPull = s.gripLock <= 0;
    const pull = s.hold && canPull ? pullVector(s) : null;
    s.steeringNow = pull !== null;
    // An un-pulled fish is not content to circle the middle of the ring: the
    // longer the player leaves it alone, the further out it aims.
    s.neglect = pull ? 0 : s.neglect + step;
    if (pull) {
      const angle = Math.atan2(pull.y, pull.x);
      s.lastSteerAngle = angle;
      if (
        s.lastAimAngle !== null &&
        Math.abs(angleDelta(s.lastAimAngle, angle)) < 0.2
      ) {
        s.sameAimTime += step;
        if (s.sameAimTime >= FIGHT.sameAimTime) {
          s.feintPending = true;
          s.sameAimTime = 0;
        }
      } else {
        s.sameAimTime = 0;
      }
      s.lastAimAngle = angle;
    } else {
      s.sameAimTime = 0;
      s.lastAimAngle = null;
    }

    this.stamina.updateGrip(step, pull !== null);
    this.stamina.updateEndurance(step, pull);
    this.stamina.maybeDesperate();
    s.advantage = Math.max(0, s.advantage - step);
    s.counterFlash = Math.max(0, s.counterFlash - step);
    s.stun = Math.max(0, s.stun - step);
    s.turnFlashValue = Math.max(0, s.turnFlashValue - step);

    if (s.warnTime > 0) {
      s.warnTime = Math.max(0, s.warnTime - step);
      // Rest means releasing the pull button, as in the mod.
      s.warnRest = s.hold ? 0 : s.warnRest + step;
      // The fish holds still and shivers while the warning is shown.
      s.vx *= Math.max(0, 1 - 7 * step);
      s.vy *= Math.max(0, 1 - 7 * step);
      s.bubbleTimer -= step;
      if (s.bubbleTimer <= 0) {
        s.bubbleTimer = 0.04;
        this.bubbleField.spawn(false);
      }
      if (s.warnTime === 0) {
        if (s.feintActive) {
          // False start: the fish lunges toward the arrow, then turns.
          this.motion.boltAt(s.warnAngle, FIGHT.feintPower);
          s.feintTimer = FIGHT.feintDelay;
          this.bubbleField.burst();
        } else {
          this.motion.bolt();
          this.bubbleField.burst();
          this.counter.openWindow();
        }
      }
    } else if (s.feintTimer > 0) {
      s.warnRest = s.hold ? 0 : s.warnRest + step;
      s.feintTimer = Math.max(0, s.feintTimer - step);
      if (s.feintTimer === 0) {
        // The turn: kill the false velocity and strike along the true heading.
        s.vx = 0;
        s.vy = 0;
        this.motion.boltAt(s.escapeAngle, 1);
        s.turnFlashValue = 0.18;
        s.feintHasRevealed = true;
        this.bubbleField.burst();
        this.counter.openWindow(FIGHT.feintWindow);
      }
    } else {
      if (s.stun > 0) {
        // A countered dash is cancelled: the fish hangs in place and cannot
        // start a new move until the stun expires.
        s.vx *= Math.max(0, 1 - 12 * step);
        s.vy *= Math.max(0, 1 - 12 * step);
      } else {
        if (step > 0) this.motion.advanceScript(step);
        this.motion.updateTarget();
        this.motion.steer(step);
      }
    }

    this.counter.update(step, pull);

    if (pull) {
      // A heavier fish comes in slower: the angler's pull has to drag its mass
      // across the circle, so the same input moves it less far per second.
      const power = PULL_ACCEL * s.load.pull;
      s.vx += pull.x * power * step;
      s.vy += pull.y * power * step;
    }

    // Water drag plus a hard speed cap keeps the pull responsive but fair.
    s.vx *= Math.max(0, 1 - 0.9 * step);
    s.vy *= Math.max(0, 1 - 0.9 * step);
    const speed = Math.hypot(s.vx, s.vy);
    if (speed > MAX_SPEED) {
      const k = MAX_SPEED / speed;
      s.vx *= k;
      s.vy *= k;
    }

    s.fishX += s.vx * step;
    s.fishY += s.vy * step;

    this.bubbleField.update(step);
    if (updateZone(s, step)) {
      this.finish(false);
      return;
    }
    if (!s.running) return;

    if (this.stamina.updateReady()) this.finish(true);

    // A fish that bolts far beyond the circle has thrown the hook outright;
    // ordinary dashes are resolved by the outside timer instead.
    if (Math.hypot(s.fishX, s.fishY) > FIGHT_RADIUS * 2) {
      this.finish(false);
    }
  }

  fishAngle(): number {
    return this.motion.fishAngle();
  }

  private finish(won: boolean): void {
    const s = this.state;
    if (!s.running) return;
    s.running = false;
    // The fight is over, so the player is no longer steering, even if the
    // button is still down: `isSteering` drives the reel loop, and a stale
    // `true` here restarted the loop in the same frame the catch was settled
    // (it then kept playing under the whole catch display).
    s.steeringNow = false;
    s.hold = false;
    s.finishResult = { won, perfect: won && s.perfect };
    s.onFinish?.(s.finishResult);
  }
}
