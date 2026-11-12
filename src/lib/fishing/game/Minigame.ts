import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { C, FIGHT, SCENE, TIMING, VIEW } from "../config";
import type { FishSpecies } from "../config";
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
  /** Called when an early strike makes the fish resist. */
  onResist?: () => void;
  /** Called when the grip runs out. */
  onGripOut?: () => void;
}

interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const RADIUS = 34;
const FISH_SCALE = 1;
const SILHOUETTE = 0x0b2233;
const SILHOUETTE_WARN = 0x2a5a78;
const TAU = Math.PI * 2;
const MAX_SLIPS = 2;
const ESCAPE_HOLD = 1.35;
const PULL_ACCEL = 430;
const MAX_SPEED = 235;

function angleDelta(from: number, to: number): number {
  let delta = (to - from + Math.PI) % TAU;
  if (delta < 0) delta += TAU;
  return delta - Math.PI;
}

/**
 * Ring fight at the bobber.
 *
 * The fish is free inside the ring and its species script keeps trying to bolt
 * outside. Moving the cursor (or pressing a direction key) steers the fish and
 * spends grip; standing still restores grip. When the fish is tired and inside
 * the circle, a still press lands it. During a telegraphed burst, resting and
 * then pulling against it lands a counter-pull.
 */
export class Minigame extends Container {
  private readonly fish: FishSpecies;
  private readonly wildness: number;
  private readonly fishSprite: Sprite;
  private readonly ringG = new Graphics();
  private readonly wakeG = new Graphics();
  private readonly bubbleG = new Graphics();
  private readonly barG = new Graphics();
  private readonly gripG = new Graphics();

  private readonly centerX: number;
  private readonly centerY: number;

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
  private counterFlash = 0;
  private preBurstAngle: number | null = null;
  private lastSteerAngle: number | null = null;
  private ready = false;
  private lastReadyChime = -Infinity;

  private strikeHeld = false;
  private strikeTime = 0;
  private strikeResolved = false;
  private strikeCooldown = 0;
  private strikeOriginX = 0;
  private strikeOriginY = 0;

  private pointerX: number | null = null;
  private pointerY: number | null = null;
  private prevPointerX: number | null = null;
  private prevPointerY: number | null = null;
  private pointerActive = 0;
  private directionX = 0;
  private directionY = 0;
  private steeringNow = false;

  private readonly bubbles: Bubble[] = [];
  private bubbleTimer = 0;

  private running = true;
  private perfect = true;
  private slips = 0;
  private outside = false;
  private outsideTimer = 0;
  private slipCooldown = 0;
  private time = 0;
  private finishResult: MinigameResult | null = null;

  onFinish?: (result: MinigameResult) => void;
  /** Fired once per telegraphed strong dash. */
  onWarn?: () => void;
  onCounter?: () => void;
  onReady?: () => void;
  onResist?: () => void;
  onGripOut?: () => void;

  constructor(fish: FishSpecies, icon: Texture, options: MinigameOptions) {
    super();
    this.fish = fish;
    this.wildness = options.wildness ?? 1;
    this.onWarn = options.onWarn;
    this.onCounter = options.onCounter;
    this.onReady = options.onReady;
    this.onResist = options.onResist;
    this.onGripOut = options.onGripOut;
    this.eventMode = "none";

    this.centerX = clamp(options.anchor.x, RADIUS + 8, VIEW.width - RADIUS - 8);
    this.centerY = clamp(
      options.anchor.y + 24,
      RADIUS + 28,
      VIEW.height - RADIUS - 8,
    );

    this.addChild(this.ringG);
    this.addChild(this.wakeG);

    this.fishSprite = new Sprite(icon);
    this.fishSprite.anchor.set(0.5);
    this.fishSprite.scale.set(FISH_SCALE);
    this.fishSprite.alpha = 0.92;
    this.fishSprite.tint = SILHOUETTE;
    this.addChild(this.fishSprite);
    this.addChild(this.bubbleG);

    this.addChild(this.barG);
    this.addChild(this.gripG);

    this.lastAngle = Math.random() * TAU;
    this.escapeAngle = this.lastAngle;
    this.script = buildScript(fish);
    this.nextMove();
    this.update(0);
  }

  get result(): MinigameResult | null {
    return this.finishResult;
  }

  get fishSpecies(): FishSpecies {
    return this.fish;
  }

  /** Perfect slips still available, shown by the HUD pips. */
  get slipsLeft(): number {
    return Math.max(0, MAX_SLIPS - this.slips);
  }

  /** True while the player is actively steering; drives the reel sound. */
  get isSteering(): boolean {
    return this.steeringNow;
  }

  /** Anchor of the dashed ring, mostly for debugging and screenshots. */
  get ringCenter(): { x: number; y: number } {
    return { x: this.centerX, y: this.centerY };
  }

  /** The button is only for the finishing strike; it does not pull. */
  setStrikeHold(held: boolean): void {
    if (held === this.strikeHeld) return;
    this.strikeHeld = held;
    this.strikeTime = 0;
    this.strikeResolved = false;
    if (held) {
      this.strikeOriginX = this.pointerX ?? this.centerX;
      this.strikeOriginY = this.pointerY ?? this.centerY;
    }
  }

  /** Cursor position in screen space; steering follows recent movement. */
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
    this.time += dt;
    const step = Math.min(dt, 0.05);

    this.trackPointer(step);
    this.updateStrike(step);
    if (!this.running) return;

    const canPull = this.gripLock <= 0;
    const pull = canPull ? this.pullVector() : null;
    this.steeringNow = pull !== null;
    if (pull) this.lastSteerAngle = Math.atan2(pull.y, pull.x);

    this.updateGrip(step, pull !== null);
    this.updateEndurance(step, pull !== null);
    this.advantage = Math.max(0, this.advantage - step);
    this.counterFlash = Math.max(0, this.counterFlash - step);

    if (this.warnTime > 0) {
      this.warnTime = Math.max(0, this.warnTime - step);
      this.warnRest = pull ? 0 : this.warnRest + step;
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
      if (step > 0) this.advanceScript(step);
      this.updateTarget();
      this.steer(step);
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
    this.draw(pull !== null);

    this.fishSprite.position.set(
      this.centerX + this.fishX,
      this.centerY + this.fishY,
    );
    this.fishSprite.rotation = clamp(this.vx / 420, -0.45, 0.45);
    const face =
      this.vx < -6
        ? -1
        : this.vx > 6
          ? 1
          : this.fishSprite.scale.x < 0
            ? -1
            : 1;
    this.fishSprite.scale.set(face * FISH_SCALE, FISH_SCALE);
    this.fishSprite.tint = this.warnTime > 0 ? SILHOUETTE_WARN : SILHOUETTE;

    if (Math.hypot(this.fishX, this.fishY) > RADIUS * 1.65) {
      this.finish(false);
    }
  }

  // --------------------------------------------------------------- input

  private trackPointer(step: number): void {
    if (this.pointerX === null || this.pointerY === null) {
      this.pointerActive = 0;
      this.prevPointerX = null;
      this.prevPointerY = null;
      return;
    }
    if (this.prevPointerX === null || this.prevPointerY === null) {
      this.prevPointerX = this.pointerX;
      this.prevPointerY = this.pointerY;
      this.pointerActive = 0;
      return;
    }
    const moved = Math.hypot(
      this.pointerX - this.prevPointerX,
      this.pointerY - this.prevPointerY,
    );
    this.prevPointerX = this.pointerX;
    this.prevPointerY = this.pointerY;
    if (moved > 0.4) this.pointerActive = FIGHT.pointerActive;
    else this.pointerActive = Math.max(0, this.pointerActive - step);
  }

  private updateStrike(step: number): void {
    this.strikeCooldown = Math.max(0, this.strikeCooldown - step);
    if (!this.strikeHeld || this.strikeResolved || this.strikeCooldown > 0) {
      return;
    }
    if (this.pointerX !== null && this.pointerY !== null) {
      const moved = Math.hypot(
        this.pointerX - this.strikeOriginX,
        this.pointerY - this.strikeOriginY,
      );
      // A drag is steering, not a landing strike.
      if (moved > FIGHT.strikeMove) {
        this.strikeResolved = true;
        return;
      }
    }
    this.strikeTime += step;
    if (this.strikeTime < FIGHT.strikeHold) return;
    this.strikeResolved = true;
    this.resolveStrike();
  }

  private resolveStrike(): void {
    const inside = Math.hypot(this.fishX, this.fishY) <= RADIUS;
    if (this.endurance <= FIGHT.landThreshold && inside) {
      this.finish(true);
      return;
    }
    if (this.endurance > FIGHT.resistThreshold) return;

    // Too early: the fish tears away and costs grip.
    this.endurance = clamp(this.endurance + FIGHT.resistEndurance);
    this.grip = clamp(this.grip - FIGHT.resistGrip);
    this.escapeAngle = this.fishAngle() + (Math.random() - 0.5) * 0.6;
    this.bolt(0.45);
    this.flash = 0.24;
    this.strikeCooldown = FIGHT.resistCooldown;
    this.onResist?.();
  }

  private pullVector(): { x: number; y: number } | null {
    const dirLength = Math.hypot(this.directionX, this.directionY);
    if (dirLength > 0.1) {
      return {
        x: this.directionX / dirLength,
        y: this.directionY / dirLength,
      };
    }

    if (
      this.pointerActive > 0 &&
      this.pointerX !== null &&
      this.pointerY !== null
    ) {
      const dx = this.pointerX - (this.centerX + this.fishX);
      const dy = this.pointerY - (this.centerY + this.fishY);
      const length = Math.hypot(dx, dy);
      if (length > 10) return { x: dx / length, y: dy / length };
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

  private updateEndurance(step: number, steering: boolean): void {
    if (!steering) return;
    const rate = FIGHT.tireBase - this.fish.resistance * FIGHT.tireScale;
    const inside = Math.hypot(this.fishX, this.fishY) <= RADIUS;
    const tire = rate * (inside ? 1 : 0.3);
    const bonus = this.advantage > 0 ? FIGHT.advantageTire : 1;
    this.endurance = clamp(this.endurance - tire * bonus * step);
  }

  private openCounterWindow(): void {
    this.counterWindow = FIGHT.counterWindow;
    this.counterAngle = this.warnAngle;
    this.counterArmed = this.warnRest >= FIGHT.counterRest;
    this.preBurstAngle = this.lastSteerAngle;
    this.counterUsed = false;
  }

  private updateCounter(
    step: number,
    pull: { x: number; y: number } | null,
  ): void {
    if (this.counterWindow <= 0) return;
    this.counterWindow = Math.max(0, this.counterWindow - step);
    if (this.counterUsed || !pull) return;

    const angle = Math.atan2(pull.y, pull.x);
    const opposed =
      Math.abs(angleDelta(angle, this.counterAngle + Math.PI)) <=
      FIGHT.counterAngle;
    const reversed =
      this.preBurstAngle !== null &&
      Math.abs(angleDelta(this.preBurstAngle, angle)) > Math.PI / 2;

    if (!opposed || (!this.counterArmed && !reversed)) return;

    this.counterUsed = true;
    this.counterWindow = 0;
    this.advantage = FIGHT.advantage;
    this.counterFlash = 0.6;
    this.flash = 0.18;
    this.onCounter?.();
  }

  private updateReady(): void {
    const inside = Math.hypot(this.fishX, this.fishY) <= RADIUS;
    const readyNow = this.endurance <= FIGHT.landThreshold && inside;
    if (
      readyNow &&
      !this.ready &&
      this.time - this.lastReadyChime >= FIGHT.readyChime
    ) {
      this.lastReadyChime = this.time;
      this.onReady?.();
    }
    this.ready = readyNow;
  }

  // ---------------------------------------------------------------- movement

  private advanceScript(dt: number): void {
    if (this.current === null) return;
    this.moveTime += dt;
    if (this.moveTime >= this.current.dur) this.nextMove();
  }

  private nextMove(): void {
    const move = this.script[this.moveIndex % this.script.length];
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
      this.warnTime = TIMING.telegraph;
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

    // Escape directions are relative to the ring, never to the cursor: the
    // player's pull stays a counter-force instead of choosing the escape side.
    if (dir === "away") return here + jitter(0.55);
    if (dir === "toward") return here + Math.PI + jitter(0.5);
    if (dir === "same") return this.lastAngle + jitter(0.35);
    return this.lastAngle + Math.PI + jitter(0.75);
  }

  /** A sudden burst, used by dash moves and after a telegraph ends. */
  private bolt(scale = 1): void {
    const power = (110 + this.fish.speed * 70) * scale * this.wildness;
    this.vx += Math.cos(this.escapeAngle) * power;
    this.vy += Math.sin(this.escapeAngle) * power;
    this.flash = 0.16;
  }

  private updateTarget(): void {
    const move = this.current;
    if (!move) return;
    const t = move.dur <= 0 ? 1 : clamp(this.moveTime / move.dur);
    const kind = move.kind;

    if (kind === "dash") {
      const radius = move.dir === "toward" ? 0.3 : move.strong ? 1.2 : 1.12;
      this.targetX = Math.cos(this.escapeAngle) * RADIUS * radius;
      this.targetY = Math.sin(this.escapeAngle) * RADIUS * radius;
      return;
    }

    if (kind === "arc") {
      const eased = easeInOutQuad(t);
      const angle =
        this.moveStartAngle +
        angleDelta(this.moveStartAngle, this.escapeAngle) * eased;
      const radius = lerp(this.moveStartRadius, 0.9, eased) * RADIUS;
      this.targetX = Math.cos(angle) * radius;
      this.targetY = Math.sin(angle) * radius;
      return;
    }

    if (kind === "wave") {
      const cycles = move.cycles ?? 1;
      const amp = (move.amplitude ?? 0.3) * 2.2;
      const angle = this.moveStartAngle + Math.sin(t * TAU * cycles) * amp;
      const radius = lerp(this.moveStartRadius, 0.94, t) * RADIUS;
      this.targetX = Math.cos(angle) * radius;
      this.targetY = Math.sin(angle) * radius;
      return;
    }

    if (kind === "zigzag") {
      const count = Math.max(1, move.count ?? 3);
      const amp = (move.amplitude ?? 0.28) * 3;
      const slot = Math.min(count - 1, Math.floor(t * count));
      const angle = this.moveStartAngle + (slot % 2 === 0 ? amp : -amp);
      const radius = RADIUS * 0.97;
      this.targetX = Math.cos(angle) * radius;
      this.targetY = Math.sin(angle) * radius;
      return;
    }

    // Pause: drift back toward the middle and catch a breath.
    const angle = this.moveStartAngle;
    this.targetX = Math.cos(angle) * RADIUS * 0.3;
    this.targetY = Math.sin(angle) * RADIUS * 0.3;
  }

  private steer(dt: number): void {
    const kind = this.current?.kind ?? "pause";
    let speed = 40;
    let steer = 4;
    if (kind === "dash") {
      speed = 100 + this.fish.speed * 60;
      steer = 6.5;
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
    const outside = distance > RADIUS;

    if (outside && !this.outside && this.slipCooldown <= 0) {
      // Two slips are still a perfect catch; the third breaks it.
      this.slips += 1;
      this.perfect = this.slips <= MAX_SLIPS;
      this.slipCooldown = 0.5;
      this.flash = 0.2;
    }
    this.outside = outside;
    this.slipCooldown = Math.max(0, this.slipCooldown - dt);

    if (distance > RADIUS + 4) {
      this.outsideTimer += dt;
      if (this.outsideTimer >= ESCAPE_HOLD) {
        this.finish(false);
        return;
      }
    } else {
      this.outsideTimer = Math.max(0, this.outsideTimer - dt * 2);
    }
  }

  private fishAngle(): number {
    if (Math.hypot(this.fishX, this.fishY) < 0.5) return this.lastAngle;
    return Math.atan2(this.fishY, this.fishX);
  }

  private fishRadius(): number {
    return clamp(Math.hypot(this.fishX, this.fishY) / RADIUS, 0, 1.4);
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
    this.bubbles.push({
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
    for (const bubble of this.bubbles) {
      bubble.life -= step;
      bubble.x += bubble.vx * step;
      bubble.y += bubble.vy * step;
      bubble.vx *= Math.max(0, 1 - 1.8 * step);
      bubble.vy *= Math.max(0, 1 - 1.8 * step);
    }
    for (let i = this.bubbles.length - 1; i >= 0; i -= 1) {
      if (this.bubbles[i].life <= 0) this.bubbles.splice(i, 1);
    }
  }

  // -------------------------------------------------------------------- draw

  private draw(pulling: boolean): void {
    this.drawRing(pulling);
    this.drawWake();
    this.drawBubbles();
    this.drawBar();
    this.drawGrip();
  }

  private drawRing(pulling: boolean): void {
    const g = this.ringG;
    const cx = this.centerX;
    const cy = this.centerY;
    const pulse = (Math.sin(this.time * 3.2) + 1) / 2;
    const danger = this.outside;
    const warn = this.warnTime > 0;

    g.clear();
    g.circle(cx, cy, RADIUS).fill({ color: C.cyan, alpha: 0.035 });
    g.circle(cx, cy, RADIUS + 4).stroke({
      width: 1,
      color: C.cream,
      alpha: 0.08 + pulse * 0.04,
    });

    const color = danger ? C.red : C.cream;
    const alpha = danger
      ? 0.75 + pulse * 0.25
      : (pulling ? 0.82 : 0.62) + pulse * 0.16;
    const segments = 24;
    for (let i = 0; i < segments; i += 1) {
      const start = (i / segments) * TAU + this.time * 0.06;
      this.arc(g, cx, cy, RADIUS, start, start + (TAU / segments) * 0.56);
      g.stroke({ width: 1.4, color, alpha });
    }

    if (this.flash > 0) {
      g.circle(cx, cy, RADIUS + 2).stroke({
        width: 2,
        color: C.cream,
        alpha: this.flash * 2.2,
      });
    }

    if (danger) {
      const angle = this.fishAngle();
      const arc = Math.min(1.1, 0.35 + (this.outsideTimer / ESCAPE_HOLD) * 0.8);
      this.arc(g, cx, cy, RADIUS + 1, angle - arc, angle + arc);
      g.stroke({ width: 2.5, color: C.red, alpha: 0.55 + pulse * 0.4 });
    }

    if (warn) {
      const flash = 0.55 + pulse * 0.45;
      this.arc(
        g,
        cx,
        cy,
        RADIUS + 1,
        this.warnAngle - 0.55,
        this.warnAngle + 0.55,
      );
      g.stroke({ width: 3, color: C.gold, alpha: flash });
    }
  }

  /** Arc without the stray line Pixi draws from the previous path point. */
  private arc(
    g: Graphics,
    cx: number,
    cy: number,
    radius: number,
    start: number,
    end: number,
  ): void {
    g.moveTo(cx + Math.cos(start) * radius, cy + Math.sin(start) * radius);
    g.arc(cx, cy, radius, start, end);
  }

  private drawWake(): void {
    const g = this.wakeG;
    g.clear();
    const speed = Math.hypot(this.vx, this.vy);
    const x = this.centerX + this.fishX;
    const y = this.centerY + this.fishY;
    const angle = Math.atan2(this.vy, this.vx);

    g.ellipse(x, y + 5, 8 + Math.min(8, speed * 0.035), 2.4).fill({
      color: C.ink,
      alpha: 0.16,
    });
    if (speed > 45) {
      for (let i = 1; i <= 3; i += 1) {
        const back = i * 7;
        g.circle(
          x - Math.cos(angle) * back + Math.sin(this.time * 9 + i) * 1.5,
          y - Math.sin(angle) * back + Math.cos(this.time * 8 + i) * 1.2,
          0.8 + i * 0.25,
        ).fill({ color: C.cream, alpha: 0.18 - i * 0.03 });
      }
    }
  }

  private drawBubbles(): void {
    const g = this.bubbleG;
    g.clear();

    for (const bubble of this.bubbles) {
      const alpha = clamp(bubble.life / bubble.maxLife);
      g.circle(bubble.x, bubble.y, bubble.size).stroke({
        width: 1,
        color: C.cream,
        alpha: 0.65 * alpha,
      });
      g.circle(
        bubble.x - bubble.size * 0.3,
        bubble.y - bubble.size * 0.3,
        0.55,
      ).fill({ color: C.cyan, alpha: 0.7 * alpha });
    }

    if (this.counterFlash > 0) {
      const x = this.centerX + this.fishX;
      const y = this.centerY + this.fishY;
      const progress = 1 - this.counterFlash / 0.6;
      g.circle(x, y, 10 + progress * 26).stroke({
        width: 2,
        color: C.cyan,
        alpha: this.counterFlash,
      });
    }
  }

  private drawBar(): void {
    const g = this.barG;
    const width = 62;
    const height = 6;
    const x = this.centerX - width / 2;
    const y = clamp(this.centerY - RADIUS - 8, 28, this.centerY - RADIUS + 2);
    const pulse = (Math.sin(this.time * 8) + 1) / 2;
    const value = clamp(this.endurance);
    const low = value <= FIGHT.landThreshold;
    const color = low ? C.red : value <= 0.5 ? C.orange : C.green;
    const border = this.ready
      ? C.gold
      : this.outside
        ? C.red
        : this.warnTime > 0
          ? C.gold
          : C.steel;

    g.clear();
    g.roundRect(x - 1, y - 1, width + 2, height + 2, 2).fill(C.ink);
    g.rect(x, y, width, height).fill({ color: C.ink, alpha: 0.55 });

    const fill = Math.max(0, Math.round(width * value));
    if (fill > 0) {
      g.rect(x, y, fill, height).fill(color);
      g.rect(x, y, fill, 1).fill({ color: C.cream, alpha: 0.55 });
    }

    // The land threshold is the target, so keep it visible on the bar.
    g.rect(x + width * FIGHT.landThreshold, y - 1, 1, height + 2).fill({
      color: C.cream,
      alpha: 0.55,
    });

    g.roundRect(x - 1, y - 1, width + 2, height + 2, 2).stroke({
      width: 1,
      color: border,
      alpha: this.ready ? 0.65 + pulse * 0.35 : 0.6,
    });

    if (this.ready) {
      const hx = x + width + 7;
      const hy = y + 2;
      const hookAlpha = 0.7 + pulse * 0.3;
      g.moveTo(hx, hy - 6);
      g.lineTo(hx, hy + 3);
      g.quadraticCurveTo(hx, hy + 8, hx - 5, hy + 6);
      g.stroke({ width: 1.8, color: C.gold, alpha: hookAlpha });
      g.moveTo(hx - 3, hy - 6);
      g.lineTo(hx + 1, hy - 6);
      g.stroke({ width: 1.4, color: C.gold, alpha: hookAlpha });
    }
  }

  private drawGrip(): void {
    const g = this.gripG;
    const gx = SCENE.anglerX + 28;
    const gy = SCENE.anglerY - 20;
    const locked = this.gripLock > 0;
    const advantage = this.advantage > 0;
    const pulse = (Math.sin(this.time * 10) + 1) / 2;
    const fillColor = locked ? C.red : advantage ? C.gold : C.cyan;
    const boltAlpha = locked ? 0.55 + pulse * 0.4 : advantage ? 1 : 0.9;

    g.clear();
    g.roundRect(gx - 5, gy - 9, 44, 22, 3).fill({
      color: C.ink,
      alpha: 0.55,
    });
    g.roundRect(gx - 5, gy - 9, 44, 22, 3).stroke({
      width: 1,
      color: C.steel,
      alpha: 0.3,
    });

    g.poly([
      gx + 2,
      gy - 7,
      gx - 1,
      gy + 1,
      gx + 1,
      gy + 1,
      gx - 1,
      gy + 7,
      gx + 4,
      gy - 1,
      gx + 2,
      gy - 1,
    ]).fill({ color: fillColor, alpha: boltAlpha });

    const bx = gx + 7;
    const by = gy - 2;
    const bw = 26;
    const bh = 5;
    g.rect(bx, by, bw, bh).fill({ color: C.ink, alpha: 0.8 });
    g.rect(bx, by, Math.round(bw * clamp(this.grip)), bh).fill(fillColor);
    g.rect(bx, by, Math.round(bw * clamp(this.grip)), 1).fill({
      color: C.cream,
      alpha: 0.55,
    });
    g.rect(bx, by, bw, bh).stroke({
      width: 1,
      color: locked ? C.red : C.steel,
      alpha: locked ? 0.9 : 0.5,
    });
  }

  private finish(won: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.finishResult = { won, perfect: won && this.perfect };
    this.onFinish?.(this.finishResult);
  }
}
