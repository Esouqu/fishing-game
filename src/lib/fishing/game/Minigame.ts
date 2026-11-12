import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { C, START_PROGRESS, TIMING, VIEW } from "../config";
import type { FishSpecies } from "../config";
import { chance, clamp, easeInOutQuad, lerp } from "../utils";
import { buildScript, type Move } from "./behaviors";

export interface MinigameResult {
  won: boolean;
  perfect: boolean;
}

export interface MinigameOptions {
  /** Where the bobber landed; the circle is built around this point. */
  anchor: { x: number; y: number };
  /** Water roughness from the cast distance: 0.82 calm .. 1.2 rough. */
  wildness?: number;
  /** Called when a strong dash is telegraphed. */
  onWarn?: () => void;
}

const RADIUS = 34;
const FISH_SCALE = 1.45;
const TAU = Math.PI * 2;
const MAX_SLIPS = 2;
const ESCAPE_HOLD = 1.35;
const PULL_ACCEL = 300;
const MAX_SPEED = 230;

function darken(color: number, amount: number): number {
  const r = Math.round(((color >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((color >> 8) & 0xff) * (1 - amount));
  const b = Math.round((color & 0xff) * (1 - amount));
  return (r << 16) | (g << 8) | b;
}

function angleDelta(from: number, to: number): number {
  let delta = (to - from + Math.PI) % TAU;
  if (delta < 0) delta += TAU;
  return delta - Math.PI;
}

/**
 * Stardew-style reeling, but played inside a dashed circle in the water.
 *
 * The fish is free inside the ring and its species script keeps trying to bolt
 * outside. The player holds the mouse button and pulls the fish toward the
 * cursor (arrow keys work too) while a small bar above the ring fills. Leaving
 * the ring costs one perfect attempt and drains the bar; staying outside for
 * too long lets the fish escape for good.
 */
export class Minigame extends Container {
  private readonly fish: FishSpecies;
  private readonly wildness: number;
  private readonly fishSprite: Sprite;
  private readonly ringG = new Graphics();
  private readonly wakeG = new Graphics();
  private readonly barG = new Graphics();

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
  private flash = 0;

  private progress = START_PROGRESS;
  private hold = false;
  private pointerX: number | null = null;
  private pointerY: number | null = null;
  private directionX = 0;
  private directionY = 0;
  private biasX = 0;
  private biasY = 0;

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

  constructor(fish: FishSpecies, icon: Texture, options: MinigameOptions) {
    super();
    this.fish = fish;
    this.wildness = options.wildness ?? 1;
    this.onWarn = options.onWarn;
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
    this.addChild(this.fishSprite);

    this.addChild(this.barG);

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
  /** Anchor of the dashed ring, mostly for debugging and screenshots. */
  get ringCenter(): { x: number; y: number } {
    return { x: this.centerX, y: this.centerY };
  }

  setHold(hold: boolean): void {
    this.hold = hold;
  }

  /** Cursor position in screen space; `null` falls back to pulling inward. */
  setPointer(x: number | null, y: number | null): void {
    this.pointerX = x;
    this.pointerY = y;
  }

  /** Optional keyboard pull direction (normalized by the caller). */
  setDirection(x: number, y: number): void {
    this.directionX = x;
    this.directionY = y;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.time += dt;
    const step = Math.min(dt, 0.05);

    const pull = this.pullVector();
    if (pull) {
      this.biasX += (pull.x - this.biasX) * Math.min(1, step * 3.2);
      this.biasY += (pull.y - this.biasY) * Math.min(1, step * 3.2);
    }

    if (this.warnTime > 0) {
      this.warnTime = Math.max(0, this.warnTime - step);
      this.flash = Math.max(0, this.flash - step);
      // The fish holds still and shivers while the warning is shown.
      this.vx *= Math.max(0, 1 - 7 * step);
      this.vy *= Math.max(0, 1 - 7 * step);
      if (this.warnTime === 0) this.bolt();
    } else {
      if (step > 0) this.advanceScript(step);
      this.updateTarget();
      this.steer(step);
    }

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

    this.updateZone(step);
    if (!this.running) return;

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
    this.fishSprite.tint = this.warnTime > 0 ? 0xffe58a : 0xffffff;

    if (this.progress >= 1) this.finish(true);
    else if (
      this.progress <= 0 ||
      Math.hypot(this.fishX, this.fishY) > RADIUS * 1.65
    ) {
      this.finish(false);
    }
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
    this.moveStartAngle = this.fishAngle();
    this.moveStartRadius = this.fishRadius();
    this.escapeAngle = this.resolveAngle(move);
    if (move.kind === "dash" || move.kind === "arc") {
      this.lastAngle = this.escapeAngle;
    }
    if (move.strong) {
      this.warnTime = TIMING.telegraph;
      this.warnAngle = this.escapeAngle;
      this.onWarn?.();
      return;
    }
    this.warnTime = 0;
    if (move.kind === "dash") this.bolt(0.7);
  }

  private resolveAngle(move: Move): number {
    const here = this.fishAngle();
    const bias = Math.hypot(this.biasX, this.biasY);
    const feint =
      bias > 0.3 && chance(0.4 + Math.min(0.35, bias * 0.3))
        ? Math.atan2(-this.biasY, -this.biasX)
        : null;
    const dir = move.dir ?? "flip";

    // Without a green zone the pull direction replaces it: "away" means
    // fighting the rod, "toward" means giving in for a beat.
    if (dir === "away") {
      if (bias > 0.15) {
        return (
          Math.atan2(-this.biasY, -this.biasX) + (Math.random() - 0.5) * 0.7
        );
      }
      return here + (Math.random() - 0.5) * 0.7;
    }
    if (dir === "toward") {
      if (bias > 0.15) {
        return Math.atan2(this.biasY, this.biasX) + (Math.random() - 0.5) * 0.6;
      }
      return here + Math.PI + (Math.random() - 0.5) * 0.6;
    }
    if (dir === "same") return this.lastAngle + (Math.random() - 0.5) * 0.4;
    if (feint !== null) return feint + (Math.random() - 0.5) * 0.5;
    return this.lastAngle + Math.PI + (Math.random() - 0.5) * 0.9;
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
      this.targetX = Math.cos(this.escapeAngle) * RADIUS * 1.28;
      this.targetY = Math.sin(this.escapeAngle) * RADIUS * 1.28;
      return;
    }

    if (kind === "arc") {
      const eased = easeInOutQuad(t);
      const angle =
        this.moveStartAngle +
        angleDelta(this.moveStartAngle, this.escapeAngle) * eased;
      const radius = lerp(this.moveStartRadius, 0.95, eased) * RADIUS;
      this.targetX = Math.cos(angle) * radius;
      this.targetY = Math.sin(angle) * radius;
      return;
    }

    if (kind === "wave") {
      const cycles = move.cycles ?? 1;
      const amp = (move.amplitude ?? 0.3) * 2.2;
      const angle = this.moveStartAngle + Math.sin(t * TAU * cycles) * amp;
      const radius = lerp(this.moveStartRadius, 1.03, t) * RADIUS;
      this.targetX = Math.cos(angle) * radius;
      this.targetY = Math.sin(angle) * radius;
      return;
    }

    if (kind === "zigzag") {
      const count = Math.max(1, move.count ?? 3);
      const amp = (move.amplitude ?? 0.28) * 3;
      const slot = Math.min(count - 1, Math.floor(t * count));
      const angle = this.moveStartAngle + (slot % 2 === 0 ? amp : -amp);
      const radius = RADIUS * 1.06;
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
      speed = 105 + this.fish.speed * 65;
      steer = 11;
    } else if (kind === "arc") {
      speed = 44 + this.fish.speed * 34;
      steer = 3.4;
    } else if (kind === "wave") {
      speed = 40 + this.fish.speed * 30;
      steer = 4;
    } else if (kind === "zigzag") {
      speed = 66 + this.fish.speed * 42;
      steer = 8;
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

  private pullVector(): { x: number; y: number } | null {
    if (!this.hold) return null;
    const dirLength = Math.hypot(this.directionX, this.directionY);
    if (dirLength > 0.1) {
      return {
        x: this.directionX / dirLength,
        y: this.directionY / dirLength,
      };
    }

    if (this.pointerX !== null && this.pointerY !== null) {
      const dx = this.pointerX - (this.centerX + this.fishX);
      const dy = this.pointerY - (this.centerY + this.fishY);
      const length = Math.hypot(dx, dy);
      if (length > 10) return { x: dx / length, y: dy / length };
    }

    // Keyboard without a mouse: gently reel straight back toward the middle.
    const distance = Math.hypot(this.fishX, this.fishY);
    if (distance > 5) {
      return { x: -this.fishX / distance, y: -this.fishY / distance };
    }
    return null;
  }

  private updateZone(dt: number): void {
    const distance = Math.hypot(this.fishX, this.fishY);
    const outside = distance > RADIUS - 2;

    if (outside && !this.outside && this.slipCooldown <= 0) {
      // Two slips are still a perfect catch; the third breaks it.
      this.slips += 1;
      this.perfect = this.slips <= MAX_SLIPS;
      this.slipCooldown = 0.5;
      this.flash = 0.2;
    }
    this.outside = outside;
    this.slipCooldown = Math.max(0, this.slipCooldown - dt);

    if (distance > RADIUS + 3) {
      this.outsideTimer += dt;
      if (this.outsideTimer >= ESCAPE_HOLD) {
        this.finish(false);
        return;
      }
    } else {
      this.outsideTimer = Math.max(0, this.outsideTimer - dt * 2);
    }

    const fill = 0.24 - this.fish.speed * 0.08;
    const drain = this.fish.drain + 0.06;
    this.progress += (outside ? -drain : fill) * dt;
    this.progress = clamp(this.progress);
  }

  private fishAngle(): number {
    if (Math.hypot(this.fishX, this.fishY) < 0.5) return this.lastAngle;
    return Math.atan2(this.fishY, this.fishX);
  }

  private fishRadius(): number {
    return clamp(Math.hypot(this.fishX, this.fishY) / RADIUS, 0, 1.4);
  }

  // -------------------------------------------------------------------- draw

  private draw(pulling: boolean): void {
    this.drawRing(pulling);
    this.drawWake();
    this.drawBar();
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
      const tipX = cx + Math.cos(this.warnAngle) * (RADIUS + 13);
      const tipY = cy + Math.sin(this.warnAngle) * (RADIUS + 13);
      const side = this.warnAngle + Math.PI / 2;
      const baseX = cx + Math.cos(this.warnAngle) * (RADIUS + 6);
      const baseY = cy + Math.sin(this.warnAngle) * (RADIUS + 6);
      g.poly([
        tipX,
        tipY,
        baseX + Math.cos(side) * 4,
        baseY + Math.sin(side) * 4,
        baseX - Math.cos(side) * 4,
        baseY - Math.sin(side) * 4,
      ]).fill({ color: C.gold, alpha: flash });
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

  private drawBar(): void {
    const g = this.barG;
    const width = 62;
    const height = 6;
    const x = this.centerX - width / 2;
    const y = clamp(this.centerY - RADIUS - 8, 28, this.centerY - RADIUS + 2);
    const pulse = (Math.sin(this.time * 8) + 1) / 2;
    const danger = this.outside || this.progress < 0.22;

    g.clear();
    g.roundRect(x - 1, y - 1, width + 2, height + 2, 2).fill(C.ink);
    g.rect(x, y, width, height).fill(
      danger ? darken(C.red, 0.25) : darken(C.orange, 0.18),
    );

    const fill = Math.max(0, Math.round(width * this.progress));
    if (fill > 0) {
      g.rect(x, y, fill, height).fill(danger ? C.red : C.green);
      g.rect(x, y, fill, 1).fill({
        color: danger ? C.cream : C.yellow,
        alpha: 0.7,
      });
    }
    g.roundRect(x - 1, y - 1, width + 2, height + 2, 2).stroke({
      width: 1,
      color: this.warnTime > 0 ? C.gold : C.steel,
      alpha: this.warnTime > 0 ? 0.6 + pulse * 0.4 : 0.6,
    });
  }

  private finish(won: boolean): void {
    if (!this.running) return;
    this.running = false;
    this.finishResult = { won, perfect: won && this.perfect };
    this.onFinish?.(this.finishResult);
  }
}
