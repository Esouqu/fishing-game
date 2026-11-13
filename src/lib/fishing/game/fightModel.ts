import {
  FIGHT,
  RARE_SCORE,
  TEMPERAMENTS,
  TIMING,
  VIEW,
  pickTemperament,
  type FishSpecies,
  type Temperament,
} from "../config";
import { clamp, easeInOutQuad, lerp } from "../utils";
import { buildScript, type Move } from "./behaviors";

export interface MinigameResult {
  won: boolean;
  perfect: boolean;
}

export interface MinigameOptions {
  /** Where the bobber landed; the circle is built around this point. */
  anchor: { x: number; y: number };
  /** Water roughness from the cast distance: 0.88 calm .. 1.05 rough. */
  wildness?: number;
  /** Called when a strong dash is telegraphed. */
  onWarn?: () => void;
  /** Called when the player lands a counter-pull. */
  onCounter?: () => void;
  /** Called when the fish becomes landable. */
  onReady?: () => void;
  /** Called when an early final pull makes the fish resist. */
  onResist?: () => void;
  /** Called when the grip runs out. */
  onGripOut?: () => void;
}

export interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export const FIGHT_RADIUS = 34;
export const MAX_SLIPS = 2;
const TAU = Math.PI * 2;
const ESCAPE_HOLD = 2.1;
const PULL_ACCEL = 540;
const MAX_SPEED = 260;

function angleDelta(from: number, to: number): number {
  let delta = (to - from + Math.PI) % TAU;
  if (delta < 0) delta += TAU;
  return delta - Math.PI;
}

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
  readonly fish: FishSpecies;
  readonly wildness: number;
  readonly centerX: number;
  readonly centerY: number;

  private fishX = 0;
  private fishY = 0;
  private vx = 0;
  private vy = 0;
  private targetX = 0;
  private targetY = 0;

  private script: Move[] = [];
  private moveIndex = 0;
  private current: Move | null = null;
  private moveTime = 0;
  private moveStartAngle = 0;
  private moveStartRadius = 0;
  private escapeAngle = 0;
  private lastAngle = 0;
  private warnTime = 0;
  private warnAngle = 0;
  private warnRest = 0;
  private flash = 0;

  private endurance = 1;
  private grip = 1;
  private gripLock = 0;
  private advantage = 0;
  private counterWindow = 0;
  private counterAngle = 0;
  private counterArmed = false;
  private counterUsed = false;
  private counterPending = false;
  private counterFlash = 0;
  private stun = 0;
  private preBurstAngle: number | null = null;
  private lastSteerAngle: number | null = null;
  private ready = false;
  private lastReadyChime = -Infinity;

  readonly temperament: Temperament;
  private readonly tempo: number;
  private readonly runPower: number;
  private readonly tirePower: number;
  private readonly recoveryPower: number;
  private readonly feintChance: number;
  readonly escapeHold: number;
  private readonly recoveryRate: number;

  private sameAimTime = 0;
  private lastAimAngle: number | null = null;
  private feintPending = false;
  private lastRunPending = false;
  private lastRunUsed = false;
  private lastRunRolled = false;

  private hold = false;
  private finalCooldown = 0;

  private pointerX: number | null = null;
  private pointerY: number | null = null;
  private directionX = 0;
  private directionY = 0;
  private steeringNow = false;
  /** Last meaningful cursor direction, kept while the cursor covers the fish. */
  private stickyX = 0;
  private stickyY = 0;

  private readonly bubbleList: Bubble[] = [];
  private bubbleTimer = 0;

  private running = true;
  private perfect = true;
  private slips = 0;
  private outside = false;
  private outsideTimer = 0;
  private slipCooldown = 0;
  private elapsed = 0;
  private finishResult: MinigameResult | null = null;

  onFinish?: (result: MinigameResult) => void;
  onWarn?: () => void;
  onCounter?: () => void;
  onReady?: () => void;
  onResist?: () => void;
  onGripOut?: () => void;

  constructor(fish: FishSpecies, options: MinigameOptions) {
    this.fish = fish;
    this.wildness = options.wildness ?? 1;
    this.onWarn = options.onWarn;
    this.onCounter = options.onCounter;
    this.onReady = options.onReady;
    this.onResist = options.onResist;
    this.onGripOut = options.onGripOut;

    this.temperament = pickTemperament();
    const mood = TEMPERAMENTS[this.temperament];
    this.tempo = mood.tempo;
    this.runPower = mood.run;
    this.tirePower = mood.tire;
    this.recoveryPower = mood.recovery;
    this.feintChance = mood.feint;
    this.escapeHold = ESCAPE_HOLD * mood.escape;
    this.recoveryRate = Math.max(
      0.012,
      FIGHT.recoveryBase - fish.resistance * FIGHT.recoveryScale,
    );

    this.centerX = clamp(
      options.anchor.x,
      FIGHT_RADIUS + 8,
      VIEW.width - FIGHT_RADIUS - 8,
    );
    this.centerY = clamp(
      options.anchor.y,
      FIGHT_RADIUS + 44,
      VIEW.height - FIGHT_RADIUS - 8,
    );

    this.lastAngle = Math.random() * TAU;
    this.escapeAngle = this.lastAngle;
    this.script = buildScript(fish);
    this.nextMove();
    this.update(0);
  }

  get result(): MinigameResult | null {
    return this.finishResult;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Perfect slips still available, shown by the HUD pips. */
  get slipsLeft(): number {
    return Math.max(0, MAX_SLIPS - this.slips);
  }

  /** True while the player is actively steering; drives the reel sound. */
  get isSteering(): boolean {
    return this.steeringNow;
  }

  get time(): number {
    return this.elapsed;
  }

  get fishOffset(): { x: number; y: number } {
    return { x: this.fishX, y: this.fishY };
  }

  /** Screen position of the fish silhouette, used by the trailing float. */
  get fishPoint(): { x: number; y: number } {
    return { x: this.centerX + this.fishX, y: this.centerY + this.fishY };
  }

  /** Current fish velocity, used to trail the float behind the fish. */
  get fishVelocity(): { x: number; y: number } {
    return { x: this.vx, y: this.vy };
  }

  get enduranceValue(): number {
    return this.endurance;
  }

  get gripValue(): number {
    return this.grip;
  }

  get isGripLocked(): boolean {
    return this.gripLock > 0;
  }

  get hasAdvantage(): boolean {
    return this.advantage > 0;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get isOutside(): boolean {
    return this.outside;
  }

  get outsideProgress(): number {
    return clamp(this.outsideTimer / this.escapeHold, 0, 1);
  }

  /** 0..1 escape meter; 1 means the fish has torn free. */
  get escapeMeter(): number {
    return clamp(this.outsideTimer / this.escapeHold, 0, 1);
  }

  get warn(): number {
    return this.warnTime;
  }

  get warnHeading(): number {
    return this.warnAngle;
  }

  get impactFlash(): number {
    return this.flash;
  }

  get counterFlashValue(): number {
    return this.counterFlash;
  }

  /** Remaining stun time after a successful counter. */
  get stunValue(): number {
    return this.stun;
  }

  get bubbles(): readonly Bubble[] {
    return this.bubbleList;
  }

  /** True when the fish is tired and inside the circle. */
  get canLand(): boolean {
    return this.running && this.ready;
  }

  /** Hold to pull; release to rest. */
  setHold(held: boolean): void {
    this.hold = held;
    if (!held) {
      this.stickyX = 0;
      this.stickyY = 0;
    }
  }

  get isHeld(): boolean {
    return this.hold;
  }

  /** Separate final pull: RMB/F, or a tap on the tired fish. */
  finalPull(): void {
    if (!this.running || this.finalCooldown > 0) return;
    this.finalCooldown = FIGHT.resistCooldown;

    const inside = Math.hypot(this.fishX, this.fishY) <= FIGHT_RADIUS;
    if (this.endurance <= FIGHT.landThreshold && inside) {
      this.finish(true);
      return;
    }

    // Too early: the fish tears away and costs grip.
    this.endurance = clamp(this.endurance + FIGHT.resistEndurance);
    this.grip = clamp(this.grip - FIGHT.resistGrip);
    this.escapeAngle = this.fishAngle() + (Math.random() - 0.5) * 0.6;
    this.bolt(0.45);
    this.flash = 0.24;
    this.onResist?.();
  }

  /** Cursor position in screen space; while held it sets the pull direction. */
  setPointer(x: number | null, y: number | null): void {
    this.pointerX = x;
    this.pointerY = y;
  }

  /** Optional keyboard steering direction (normalized by the caller). */
  setDirection(x: number, y: number): void {
    this.directionX = x;
    this.directionY = y;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.elapsed += dt;
    const step = Math.min(dt, 0.05);

    this.finalCooldown = Math.max(0, this.finalCooldown - step);

    const canPull = this.gripLock <= 0;
    const pull = this.hold && canPull ? this.pullVector() : null;
    this.steeringNow = pull !== null;
    if (pull) {
      const angle = Math.atan2(pull.y, pull.x);
      this.lastSteerAngle = angle;
      if (
        this.lastAimAngle !== null &&
        Math.abs(angleDelta(this.lastAimAngle, angle)) < 0.2
      ) {
        this.sameAimTime += step;
        if (this.sameAimTime >= FIGHT.sameAimTime) {
          this.feintPending = true;
          this.sameAimTime = 0;
        }
      } else {
        this.sameAimTime = 0;
      }
      this.lastAimAngle = angle;
    } else {
      this.sameAimTime = 0;
      this.lastAimAngle = null;
    }

    this.updateGrip(step, pull !== null);
    this.updateEndurance(step, pull);
    this.maybeDesperate();
    this.advantage = Math.max(0, this.advantage - step);
    this.counterFlash = Math.max(0, this.counterFlash - step);
    this.stun = Math.max(0, this.stun - step);

    if (this.warnTime > 0) {
      this.warnTime = Math.max(0, this.warnTime - step);
      // Rest means releasing the pull button, as in the mod.
      this.warnRest = this.hold ? 0 : this.warnRest + step;
      this.flash = Math.max(0, this.flash - step);
      // The fish holds still and shivers while the warning is shown.
      this.vx *= Math.max(0, 1 - 7 * step);
      this.vy *= Math.max(0, 1 - 7 * step);
      this.bubbleTimer -= step;
      if (this.bubbleTimer <= 0) {
        this.bubbleTimer = 0.04;
        this.spawnBubble(false);
      }
      if (this.warnTime === 0) {
        this.bolt();
        this.spawnBubbleBurst();
        this.openCounterWindow();
      }
    } else {
      if (this.stun > 0) {
        // A countered dash is cancelled: the fish hangs in place and cannot
        // start a new move until the stun expires.
        this.vx *= Math.max(0, 1 - 12 * step);
        this.vy *= Math.max(0, 1 - 12 * step);
      } else {
        if (step > 0) this.advanceScript(step);
        this.updateTarget();
        this.steer(step);
      }
    }

    this.updateCounter(step, pull);

    if (pull) {
      this.vx += pull.x * PULL_ACCEL * step;
      this.vy += pull.y * PULL_ACCEL * step;
    }

    // Water drag plus a hard speed cap keeps the pull responsive but fair.
    this.vx *= Math.max(0, 1 - 0.9 * step);
    this.vy *= Math.max(0, 1 - 0.9 * step);
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > MAX_SPEED) {
      const k = MAX_SPEED / speed;
      this.vx *= k;
      this.vy *= k;
    }

    this.fishX += this.vx * step;
    this.fishY += this.vy * step;

    this.updateBubbles(step);
    this.updateZone(step);
    if (!this.running) return;

    this.updateReady();

    // A fish that bolts far beyond the circle has thrown the hook outright;
    // ordinary dashes are resolved by the outside timer instead.
    if (Math.hypot(this.fishX, this.fishY) > FIGHT_RADIUS * 2) {
      this.finish(false);
    }
  }

  // --------------------------------------------------------------- input

  private pullVector(): { x: number; y: number } | null {
    if (!this.hold) return null;
    const dirLength = Math.hypot(this.directionX, this.directionY);
    if (dirLength > 0.1) {
      return {
        x: this.directionX / dirLength,
        y: this.directionY / dirLength,
      };
    }

    const fishX = this.centerX + this.fishX;
    const fishY = this.centerY + this.fishY;
    if (this.pointerX !== null && this.pointerY !== null) {
      const dx = this.pointerX - fishX;
      const dy = this.pointerY - fishY;
      const length = Math.hypot(dx, dy);
      if (length > 10) {
        this.stickyX = dx / length;
        this.stickyY = dy / length;
        return { x: this.stickyX, y: this.stickyY };
      }
    }

    // Keep pulling in the last valid direction when the cursor sits on the
    // fish itself, so the catch never slips out from under the pointer. With
    // no recorded aim yet, pull straight back toward the ring centre.
    if (this.stickyX !== 0 || this.stickyY !== 0) {
      return { x: this.stickyX, y: this.stickyY };
    }
    const radius = Math.hypot(this.fishX, this.fishY);
    if (radius > 1) {
      return { x: -this.fishX / radius, y: -this.fishY / radius };
    }
    return null;
  }

  private updateGrip(step: number, steering: boolean): void {
    if (this.gripLock > 0) {
      this.gripLock = Math.max(0, this.gripLock - step);
      this.grip = clamp(this.grip + FIGHT.gripRegen * 1.2 * step);
      if (this.gripLock === 0) {
        this.grip = Math.max(this.grip, FIGHT.gripRestore);
      }
      return;
    }

    if (steering) {
      this.grip -=
        FIGHT.gripDrain * (this.advantage > 0 ? FIGHT.advantageGrip : 1) * step;
      if (this.grip <= 0) {
        this.grip = 0;
        this.gripLock = FIGHT.gripLock;
        this.onGripOut?.();
      }
    } else {
      this.grip = clamp(this.grip + FIGHT.gripRegen * step);
    }
  }

  private updateEndurance(
    step: number,
    pull: { x: number; y: number } | null,
  ): void {
    // Burning the whole grip gives the fish a real breather; holding until
    // lockout can no longer out-tire a careful pulse.
    if (this.gripLock > 0) {
      this.endurance = clamp(this.endurance + FIGHT.lockRecovery * step);
      return;
    }

    const inside = Math.hypot(this.fishX, this.fishY) <= FIGHT_RADIUS;
    if (pull) {
      // Pulling against the fish's own movement tires it noticeably faster
      // than a lazy radial tug; aiming at the run is part of the fight.
      const speed = Math.hypot(this.vx, this.vy);
      let alignment = 1;
      if (speed > 8) {
        alignment = clamp(-(pull.x * this.vx + pull.y * this.vy) / speed, 0, 1);
      }
      const aim = FIGHT.tireAimBase + FIGHT.tireAimGain * alignment;
      const rate = FIGHT.tireBase - this.fish.resistance * FIGHT.tireScale;
      const tire = rate * (inside ? 1 : 0.3) * this.tirePower * aim;
      const bonus = this.advantage > 0 ? FIGHT.advantageTire : 1;
      this.endurance = clamp(this.endurance - tire * bonus * step);
      return;
    }

    // The fish catches its breath while the player rests inside the circle.
    if (inside) {
      this.endurance = clamp(
        this.endurance + this.recoveryRate * this.recoveryPower * step,
      );
    }
  }

  private maybeDesperate(): void {
    if (this.lastRunRolled) return;
    if (this.endurance > FIGHT.lastRunThreshold) return;
    this.lastRunRolled = true;
    const chance =
      FIGHT.lastRunChance +
      (this.temperament === "aggressive"
        ? 0.2
        : this.temperament === "stubborn"
          ? 0.15
          : 0) +
      (this.fish.points >= RARE_SCORE ? 0.15 : 0);
    if (Math.random() < chance) this.lastRunPending = true;
  }

  private openCounterWindow(): void {
    this.counterWindow = FIGHT.counterWindow;
    this.counterAngle = this.warnAngle;
    this.counterArmed = this.warnRest >= FIGHT.counterRest;
    this.preBurstAngle = this.lastSteerAngle;
    this.counterUsed = false;
    this.counterPending = true;
  }

  private updateCounter(
    step: number,
    pull: { x: number; y: number } | null,
  ): void {
    if (this.counterPending) {
      this.counterWindow = Math.max(0, this.counterWindow - step);
      if (this.counterWindow <= 0) {
        this.counterPending = false;
        // A strong dash that was not answered pushes the fish closer to
        // tearing free; holding the button alone does not count as an answer.
        this.outsideTimer = Math.min(
          this.escapeHold - 0.001,
          this.outsideTimer + FIGHT.uncounteredBurst,
        );
      }
    }
    if (this.counterWindow <= 0 || this.counterUsed || !pull) return;

    const angle = Math.atan2(pull.y, pull.x);
    const opposed =
      Math.abs(angleDelta(angle, this.counterAngle + Math.PI)) <=
      FIGHT.counterAngle;
    const reversed =
      this.preBurstAngle !== null &&
      Math.abs(angleDelta(this.preBurstAngle, angle)) > Math.PI / 2;

    if (!opposed || (!this.counterArmed && !reversed)) return;

    this.counterUsed = true;
    this.counterPending = false;
    this.counterWindow = 0;
    this.outsideTimer = Math.max(0, this.outsideTimer - FIGHT.counterRelief);
    this.advantage = FIGHT.advantage;
    this.counterFlash = 0.6;
    this.flash = 0.18;
    this.vx = 0;
    this.vy = 0;
    if (this.current) this.moveTime = this.current.dur;
    this.stun = FIGHT.counterStun;
    this.onCounter?.();
  }

  private updateReady(): void {
    const inside = Math.hypot(this.fishX, this.fishY) <= FIGHT_RADIUS;
    const readyNow = this.endurance <= FIGHT.landThreshold && inside;
    if (
      readyNow &&
      !this.ready &&
      this.elapsed - this.lastReadyChime >= FIGHT.readyChime
    ) {
      this.lastReadyChime = this.elapsed;
      this.onReady?.();
    }
    this.ready = readyNow;

    // A fish at exactly zero endurance is landed automatically; the manual
    // final pull remains available from the landing threshold.
    if (this.endurance === 0 && inside) {
      this.finish(true);
    }
  }

  // ---------------------------------------------------------------- movement

  private advanceScript(dt: number): void {
    if (this.current === null) return;
    this.moveTime += dt * this.tempo;
    if (this.moveTime >= this.current.dur) this.nextMove();
  }

  private nextMove(): void {
    let move = this.script[this.moveIndex % this.script.length];
    if (this.lastRunPending && !this.lastRunUsed) {
      this.lastRunUsed = true;
      this.lastRunPending = false;
      move = { kind: "dash", dir: "away", dur: 0.55, strong: true };
    }
    this.moveIndex += 1;
    this.current = move;
    this.moveTime = 0;
    this.flash = 0;
    this.warnRest = 0;
    this.counterWindow = 0;
    this.moveStartAngle = this.fishAngle();
    this.moveStartRadius = this.fishRadius();
    this.escapeAngle = this.resolveAngle(move);
    if (move.kind === "dash" || move.kind === "arc") {
      this.lastAngle = this.escapeAngle;
    }
    if (move.strong) {
      // A fish that senses an empty grip warns a little later.
      const pressure = this.grip < FIGHT.lowGrip ? 0.88 : 1;
      this.warnTime = TIMING.telegraph * pressure;
      this.warnAngle = this.escapeAngle;
      this.bubbleTimer = 0;
      this.onWarn?.();
      return;
    }
    this.warnTime = 0;
    if (move.kind === "dash") this.bolt(0.7);
  }

  private resolveAngle(move: Move): number {
    const here = this.fishAngle();
    const jitter = (spread: number) => (Math.random() - 0.5) * spread;
    const dir = move.dir ?? "flip";
    let base: number;

    // Escape directions are relative to the ring, never to the cursor: the
    // player's pull stays a counter-force instead of choosing the escape side.
    if (dir === "away") base = here + jitter(0.55);
    else if (dir === "toward") base = here + Math.PI + jitter(0.5);
    else if (dir === "same") base = this.lastAngle + jitter(0.35);
    else base = this.lastAngle + Math.PI + jitter(0.75);

    const feint = this.feintPending || Math.random() < this.feintChance;
    this.feintPending = false;
    if (feint && dir !== "toward") {
      base += (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.5);
    }
    return base;
  }

  /** A sudden burst, used by dash moves and after a telegraph ends. */
  private bolt(scale = 1): void {
    const power =
      (110 + this.fish.speed * 70) * scale * this.wildness * this.runPower;
    this.vx += Math.cos(this.escapeAngle) * power;
    this.vy += Math.sin(this.escapeAngle) * power;
    this.flash = 0.16;
  }

  private updateTarget(): void {
    const move = this.current;
    if (!move) return;
    const t = move.dur <= 0 ? 1 : clamp(this.moveTime / move.dur);
    const kind = move.kind;

    // Dash targets sit clearly outside the ring: a fish that is not being
    // pulled must be able to leave, so passivity is a real losing strategy.
    if (kind === "dash") {
      const radius = move.dir === "toward" ? 0.3 : move.strong ? 1.45 : 1.35;
      this.targetX = Math.cos(this.escapeAngle) * FIGHT_RADIUS * radius;
      this.targetY = Math.sin(this.escapeAngle) * FIGHT_RADIUS * radius;
      return;
    }

    if (kind === "arc") {
      const eased = easeInOutQuad(t);
      const angle =
        this.moveStartAngle +
        angleDelta(this.moveStartAngle, this.escapeAngle) * eased;
      const radius = lerp(this.moveStartRadius, 1, eased) * FIGHT_RADIUS;
      this.targetX = Math.cos(angle) * radius;
      this.targetY = Math.sin(angle) * radius;
      return;
    }

    if (kind === "wave") {
      const cycles = move.cycles ?? 1;
      const amp = (move.amplitude ?? 0.3) * 2.2;
      const angle = this.moveStartAngle + Math.sin(t * TAU * cycles) * amp;
      const radius = lerp(this.moveStartRadius, 1.05, t) * FIGHT_RADIUS;
      this.targetX = Math.cos(angle) * radius;
      this.targetY = Math.sin(angle) * radius;
      return;
    }

    if (kind === "zigzag") {
      const count = Math.max(1, move.count ?? 3);
      const amp = (move.amplitude ?? 0.28) * 3;
      const slot = Math.min(count - 1, Math.floor(t * count));
      const angle = this.moveStartAngle + (slot % 2 === 0 ? amp : -amp);
      const radius = FIGHT_RADIUS * 1.12;
      this.targetX = Math.cos(angle) * radius;
      this.targetY = Math.sin(angle) * radius;
      return;
    }

    // Pause: drift back toward the middle and catch a breath.
    const angle = this.moveStartAngle;
    this.targetX = Math.cos(angle) * FIGHT_RADIUS * 0.3;
    this.targetY = Math.sin(angle) * FIGHT_RADIUS * 0.3;
  }

  private steer(dt: number): void {
    const kind = this.current?.kind ?? "pause";
    let speed = 40;
    let steer = 4;
    if (kind === "dash") {
      speed = 130 + this.fish.speed * 70;
      steer = 7.5;
    } else if (kind === "arc") {
      speed = 42 + this.fish.speed * 30;
      steer = 3.6;
    } else if (kind === "wave") {
      speed = 38 + this.fish.speed * 28;
      steer = 4;
    } else if (kind === "zigzag") {
      speed = 64 + this.fish.speed * 40;
      steer = 6.5;
    } else if (kind === "pause") {
      speed = 12;
      steer = 2;
    }

    speed *= this.wildness;
    const dx = this.targetX - this.fishX;
    const dy = this.targetY - this.fishY;
    const distance = Math.hypot(dx, dy);
    const desiredX = distance > 1 ? (dx / distance) * speed : 0;
    const desiredY = distance > 1 ? (dy / distance) * speed : 0;
    const blend = Math.min(1, steer * dt);
    this.vx += (desiredX - this.vx) * blend;
    this.vy += (desiredY - this.vy) * blend;
  }

  private updateZone(dt: number): void {
    const distance = Math.hypot(this.fishX, this.fishY);
    const outside = distance > FIGHT_RADIUS;

    if (outside && !this.outside && this.slipCooldown <= 0) {
      // Two slips are still a perfect catch; the third breaks it.
      this.slips += 1;
      this.perfect = this.slips <= MAX_SLIPS;
      this.slipCooldown = 0.5;
      this.flash = 0.2;
    }
    this.outside = outside;
    this.slipCooldown = Math.max(0, this.slipCooldown - dt);

    if (distance > FIGHT_RADIUS) {
      // Reeling against the fish slows the escape clock to a crawl, but only
      // actually getting it back inside stops the clock. A passive player
      // therefore loses the fish, while an active one can recover.
      this.outsideTimer += dt * (this.steeringNow ? FIGHT.escapePullFactor : 1);
      if (this.outsideTimer >= this.escapeHold) {
        this.finish(false);
        return;
      }
    } else {
      // The cooldown is deliberately slow so a series of dashes still adds up.
      this.outsideTimer = Math.max(0, this.outsideTimer - dt * 0.12);
    }
  }

  fishAngle(): number {
    if (Math.hypot(this.fishX, this.fishY) < 0.5) return this.lastAngle;
    return Math.atan2(this.fishY, this.fishX);
  }

  private fishRadius(): number {
    return clamp(Math.hypot(this.fishX, this.fishY) / FIGHT_RADIUS, 0, 1.4);
  }

  // ------------------------------------------------------------------ bubbles

  private spawnBubble(burst: boolean): void {
    const baseX = this.centerX + this.fishX;
    const baseY = this.centerY + this.fishY;
    const angle = this.warnAngle + (Math.random() - 0.5) * 0.55;
    const speed = burst ? 50 + Math.random() * 50 : 20 + Math.random() * 30;
    const life = burst
      ? 0.3 + Math.random() * 0.24
      : 0.4 + Math.random() * 0.32;
    this.bubbleList.push({
      x: baseX + (Math.random() - 0.5) * 8,
      y: baseY + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: 1.2 + Math.random() * 1.6,
    });
  }

  private spawnBubbleBurst(): void {
    for (let i = 0; i < 8; i += 1) this.spawnBubble(true);
  }

  private updateBubbles(step: number): void {
    for (const bubble of this.bubbleList) {
      bubble.life -= step;
      bubble.x += bubble.vx * step;
      bubble.y += bubble.vy * step;
      bubble.vx *= Math.max(0, 1 - 1.8 * step);
      bubble.vy *= Math.max(0, 1 - 1.8 * step);
    }
    for (let i = this.bubbleList.length - 1; i >= 0; i -= 1) {
      if (this.bubbleList[i].life <= 0) this.bubbleList.splice(i, 1);
    }
  }

  private finish(won: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.finishResult = { won, perfect: won && this.perfect };
    this.onFinish?.(this.finishResult);
  }
}
