import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { AssetBag } from "../../assets";
import type { AreaDef, AreaPalette, SceneLayout } from "../../areas";
import { C, TIMING, VIEW } from "../../config";
import { fishInArea } from "../../fish";
import { TEXT } from "../../texts";
import { clamp, easeOutCubic, lerp, randRange } from "../../utils";
import { mixColor } from "../../world";
import { makeText } from "../../ui/theme";
import { castAway, layoutBounds, safeCastSpot } from "../castSafety";
import type { SceneRenderer } from "./types";

type ScenePhase = "idle" | "flying" | "waiting" | "bite" | "fight" | "result";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

interface Jump {
  sprite: Sprite;
  t: number;
  duration: number;
  fromX: number;
  fromY: number;
  spin: number;
  /** Caught fish stops above the angler's head instead of vanishing. */
  hold: boolean;
  /** Full scale used for the jump and the held fish. */
  scale: number;
}

/**
 * Gap between the angler's hat and the bottom edge of a landed fish, in scene
 * pixels. The fish is centred on the angler and its name is drawn right above
 * it, so the catch reads as one group instead of three loose pieces.
 */
const CATCH_CLEARANCE = 26;

/** Deepest the float goes when something nibbles the bait, in scene pixels. */
const NIBBLE_DIP = 2.6;
/** How far the body slides down when the fish actually takes the bait. */
const BITE_SINK = 12;
/**
 * Radius of the escape half-ring, in scene pixels. It sits just outside the
 * float's footprint and the ring the surface pushes out around it, so the gauge
 * is never lost inside the water ripples.
 */
const ESCAPE_ARC_RADIUS = 9;

/**
 * How far under the surface the float is `nibbleTime` seconds before a nibble
 * ends: a fast jab down over the first third, then a slower rise back to rest.
 */
function nibbleDip(nibbleTime: number): number {
  const progress = 1 - nibbleTime / TIMING.nibbleDuration;
  const plunge =
    progress < 0.35
      ? easeOutCubic(progress / 0.35)
      : 1 - easeOutCubic((progress - 0.35) / 0.65);
  return plunge * NIBBLE_DIP;
}

/**
 * Poses from the 4×4 character sheet. Row 3 is the side view facing right,
 * row 2 the back view looking away from the camera; a water body picks the
 * set that points the rod at its water.
 */
const ANGLER_POSES = {
  side: {
    idle: [12],
    cast: [12, 13, 14, 15],
    wait: [13],
    pull: [14, 15],
    land: [15],
    /** Rod tip in scene pixels relative to the angler (frame 13: tip 31,18). */
    rodTip: { x: 15, y: -14 },
  },
  back: {
    idle: [8],
    cast: [8, 9, 10, 11],
    wait: [9],
    pull: [10, 11],
    land: [11],
    /** The back view holds the rod straight up (frame 9: tip 18,1). */
    rodTip: { x: 2, y: -30 },
  },
} as const;

type AnglerPose = (typeof ANGLER_POSES)[keyof typeof ANGLER_POSES];

/**
 * Shared fishing stage: angler, rod, line, bobber, particles and the catch
 * animation. The area-specific world is painted by a {@link SceneRenderer},
 * so every water body can look completely different without duplicating the
 * fishing mechanics.
 */
export class FishingScene extends Container {
  readonly area: AreaDef;
  readonly layout: SceneLayout;

  private readonly assets: AssetBag;
  private readonly renderer: SceneRenderer;
  private readonly palette: AreaPalette;

  private readonly angler = new Sprite();
  private readonly previewG = new Graphics();
  private readonly line = new Graphics();
  private readonly bobber = new Container();
  private readonly bobberBody = new Graphics();
  private readonly bobberWash = new Graphics();
  private readonly bobberRipple = new Graphics();
  private readonly bobberClip = new Graphics();
  private readonly escapeRing = new Graphics();
  private readonly motionG = new Graphics();
  private readonly particlesG = new Graphics();
  private readonly ringsG = new Graphics();
  private readonly props = new Container();
  /** Trunks in the water; the area renderer rocks them in `animate`. */
  private readonly floating = new Container();
  private readonly lightGlow = new Graphics();
  private readonly lightFlame = new Graphics();
  private readonly biteMark: Text;

  private readonly fishShadows: {
    sprite: Sprite;
    speed: number;
    baseY: number;
    phase: number;
  }[] = [];

  /** Rod tip of the lowered waiting pose, per view. */
  private readonly rodTip: { x: number; y: number };
  private readonly frames: AnglerPose;
  private lanternLevel = 0;
  private escapeMeter = 0;

  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private jumps: Jump[] = [];
  private heldFish: Sprite | null = null;
  private heldFishTime = 0;
  /** Where the landed fish is held; `top` is its upper edge. */
  private catchSpot = { x: 0, y: 0, top: 0 };
  private time = 0;
  /** Target overcast level, 0..1, set from the area's weather front. */
  private cloudTarget = 0;
  /** Smoothed overcast level: cloud shadows crawl in with the front. */
  private cloudiness = 0;

  private phase: ScenePhase = "idle";
  private castT = 0;
  private castPower = 0;
  private bobberBaseX: number;
  private bobberBaseY: number;
  private anglerTimer = 0;
  private anglerFrames: readonly number[] = [12];
  private anglerFps = 10;
  private pulling = false;

  private nibbleTime = 0;
  /** Where the float body is heading behind the waterline mask, in pixels. */
  private sinkTarget = 0;

  private fightBobberX: number;
  private fightBobberY: number;
  private fightTargetX: number;
  private fightTargetY: number;
  private fightDirX = 1;
  private fightDirY = 0;
  private hookJerk = 0;

  /** Called when a cast bobber hits the water. */
  onCastLanded?: () => void;

  constructor(assets: AssetBag, area: AreaDef, renderer: SceneRenderer) {
    super();
    this.assets = assets;
    this.area = area;
    this.renderer = renderer;
    this.layout = area.layout;
    this.palette = area.palette;

    const { anglerX, anglerY } = {
      anglerX: this.layout.angler.x,
      anglerY: this.layout.angler.y,
    };
    this.frames = ANGLER_POSES[this.layout.anglerView ?? "side"];
    this.rodTip = {
      x: anglerX + this.frames.rodTip.x,
      y: anglerY + this.frames.rodTip.y,
    };
    this.bobberBaseX = anglerX;
    this.bobberBaseY = anglerY;
    this.fightBobberX = anglerX;
    this.fightBobberY = anglerY;
    this.fightTargetX = anglerX;
    this.fightTargetY = anglerY;

    const background = new Graphics();
    this.renderer.drawWorld(background);
    this.addChild(background);

    this.addAmbientFish();
    // Water-borne trunks ride above the underwater shoal and under the surface
    // motion, so the ripples run over them and their own roll can be animated
    // without a repaint.
    this.floating = new Container();
    this.addChild(this.floating);
    this.renderer.drawFloating?.(this.floating);
    this.addChild(this.motionG);
    this.addChild(this.previewG);

    this.props.sortableChildren = true;
    this.renderer.drawScenery(this.props);
    this.addAnglerShadow();
    this.addLightLayers();
    this.addChild(this.props);

    this.setAngler(this.frames.idle, 8);
    this.angler.anchor.set(0.5, 1);
    this.angler.position.set(anglerX, anglerY);
    this.angler.zIndex = anglerY;
    this.props.addChild(this.angler);

    this.bobberClip.rect(-4, -12, 8, 12).fill(0xffffff);
    this.bobber.addChild(this.bobberClip);

    // The waterline stays at y=0; the mask hides everything below it, and the
    // fight sinks the body through this clip as the escape meter grows. Only the
    // waterline shine belongs to the float itself — the rings it pushes out are
    // spawned into the shared ripple list further down, so they match the
    // ripples every splash makes.
    this.bobberWash.rect(-2, 0, 5, 1).fill({
      color: this.palette.snow,
      alpha: 0.38,
    });
    this.bobber.addChild(this.bobberWash);
    this.bobber.addChild(this.bobberRipple);

    this.bobberBody.rect(-2, -4, 5, 8).fill(C.ink);
    this.bobberBody.rect(-1, -3, 3, 3).fill(C.red);
    this.bobberBody.rect(-1, 0, 3, 3).fill(C.cream);
    this.bobberBody.rect(0, -6, 1, 2).fill(C.ink);
    this.bobber.addChild(this.bobberBody);
    this.bobberBody.mask = this.bobberClip;
    this.escapeRing.visible = false;
    this.bobber.addChild(this.escapeRing);

    this.bobber.visible = false;
    this.addChild(this.line, this.bobber);

    this.biteMark = makeText(TEXT.game.biteMark, {
      size: 22,
      color: C.gold,
      weight: 800,
      align: "center",
    });
    this.biteMark.anchor.set(0.5, 1);
    this.biteMark.visible = false;
    this.biteMark.style.stroke = { color: C.ink, width: 3 };
    // Never leave it sitting at the scene origin: if anything shows it before
    // the first frame pass, it must already be over the float.
    this.placeBiteMark(0);
    this.addChild(this.biteMark);

    this.addChild(this.particlesG, this.ringsG);
  }

  // -------------------------------------------------------------- decoration

  private addAnglerShadow(): void {
    const shadow = new Graphics();
    const x = this.layout.angler.x - 1;
    const y = this.layout.angler.y - 6;
    shadow.ellipse(x, y, 9, 3).fill({ color: 0x0a1c2a, alpha: 0.32 });
    shadow.ellipse(x, y, 5, 1.8).fill({ color: 0x0a1c2a, alpha: 0.35 });
    shadow.zIndex = this.layout.angler.y - 0.2;
    this.props.addChild(shadow);
  }

  private addLightLayers(): void {
    const light = this.layout.light;
    if (!light) return;
    this.lightGlow.zIndex = light.y - 0.3;
    this.lightGlow.blendMode = "add";
    this.props.addChild(this.lightGlow);

    this.lightFlame.zIndex = light.y + 0.1;
    this.lightFlame.blendMode = "add";
    this.props.addChild(this.lightFlame);
  }

  private addAmbientFish(): void {
    const roster = fishInArea(this.area.id);
    if (roster.length === 0) return;
    for (let i = 0; i < 3; i += 1) {
      const species = roster[(i * 4) % roster.length];
      const texture = this.assets.fish[species.id];
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.alpha = 0.08;
      sprite.tint = 0x0d4a66;
      sprite.scale.set(randRange(0.62, 0.95));
      const direction = Math.random() > 0.5 ? 1 : -1;
      sprite.scale.x = Math.abs(sprite.scale.x) * direction;

      let placed = false;
      for (let attempt = 0; attempt < 24 && !placed; attempt += 1) {
        const x = randRange(30, VIEW.width - 30);
        const y = randRange(40, VIEW.height - 40);
        if (!this.renderer.isWater(x, y)) continue;
        sprite.position.set(x, y);
        placed = true;
      }
      if (!placed) continue;

      this.fishShadows.push({
        sprite,
        speed: randRange(6, 14) * direction,
        baseY: sprite.y,
        phase: randRange(0, Math.PI * 2),
      });
      this.addChildAt(sprite, 1);
    }
  }

  /** Warm light and flame; the fixture itself is drawn by the area renderer. */
  private drawLight(): void {
    const glow = this.lightGlow;
    const flame = this.lightFlame;
    glow.clear();
    flame.clear();

    const light = this.layout.light;
    if (!light) return;
    // A campfire keeps burning in daylight; a lamp only matters after dusk.
    const level =
      light.kind === "fire"
        ? Math.max(this.lanternLevel, 0.62)
        : this.lanternLevel;
    if (level <= 0.02) return;

    const flicker =
      0.9 +
      Math.sin(this.time * 9.3) * 0.06 +
      Math.sin(this.time * 23.1) * 0.04;
    const alpha = level * flicker;
    const x = light.x;
    const y = light.y - 7;
    const bright = mixColor(light.color, 0xffffff, 0.55);

    const rings = light.kind === "fire" ? 6 : 8;
    for (let i = 0; i < rings; i += 1) {
      const t = i / (rings - 1);
      const radius = light.radius * (1 - t * 0.82);
      glow.circle(x, y, radius).fill({
        color: mixColor(light.color, bright, t),
        alpha: (0.008 + t * 0.03) * alpha,
      });
    }
    glow.ellipse(x + 3, light.y + 2, 10, 3).fill({
      color: light.color,
      alpha: 0.09 * alpha,
    });

    if (light.kind === "fire") {
      const ember = Math.sin(this.time * 13) * 1.2;
      flame.rect(x - 5, y + 1, 10, 5).fill({
        color: light.color,
        alpha: 0.75 * alpha,
      });
      flame.rect(x - 4, y - 2, 8, 5).fill({
        color: bright,
        alpha: 0.9 * alpha,
      });
      flame.rect(x - 2 + ember, y - 7, 4, 6).fill({
        color: 0xfff2b0,
        alpha: 0.9 * alpha,
      });
      flame.rect(x + 1, y - 11, 2, 5).fill({
        color: 0xffd166,
        alpha: 0.65 * alpha,
      });
      flame.rect(x, y - 10, 1, 3).fill({
        color: 0xffffff,
        alpha: 0.55 * alpha,
      });
    } else {
      flame.rect(x - 2, y + 1, 4, 3).fill({
        color: 0xffd166,
        alpha: 0.85 * alpha,
      });
      flame.rect(x - 1, y, 2, 2).fill({
        color: 0xffef9a,
        alpha: alpha,
      });
      flame.rect(x - 1, y + 2, 1, 1).fill({
        color: 0xffffff,
        alpha: 0.9 * alpha,
      });
    }
  }

  /** 0 = off, 1 = night-bright; smooth so dusk and dawn look gradual. */
  setLantern(level: number): void {
    const t = clamp((level - 0.08) / 0.52);
    this.lanternLevel = t * t * (3 - 2 * t);
  }

  /**
   * How much the sky is overcast, 0..1. The water surface uses it to throw
   * drifting cloud shadows; it is eased in `update`, so a new front does not
   * pop a dark patch onto the lake.
   */
  setCloudiness(level: number): void {
    this.cloudTarget = clamp(level, 0, 1);
  }

  /** Dev hook: apply the current front's cloud cover without the blend. */
  snapCloudiness(level: number): void {
    this.cloudTarget = clamp(level, 0, 1);
    this.cloudiness = this.cloudTarget;
  }

  // ------------------------------------------------------------- public API

  get bobberPosition(): { x: number; y: number } {
    return { x: this.bobber.x, y: this.bobber.y };
  }

  /** Where the bobber settled after the cast. */
  get castPoint(): { x: number; y: number } {
    return { x: this.bobberBaseX, y: this.bobberBaseY };
  }

  get isLineOut(): boolean {
    return this.bobber.visible && this.phase !== "idle";
  }

  /** The float view, moved above the fight fish while the fight is active. */
  get bobberView(): Container {
    return this.bobber;
  }

  /** Put the float back into the lake layer after the fight. */
  restoreBobber(): void {
    if (this.bobber.parent !== this) this.addChild(this.bobber);
  }

  /** True when a virtual-screen point is open water, not shore or pier. */
  isWaterAt(x: number, y: number): boolean {
    return this.renderer.isWater(x, y);
  }

  /** 0..1 escape pressure, shown by the sinking float, taut line and ring. */
  setEscapeMeter(value: number): void {
    this.escapeMeter = clamp(value);
    this.drawEscapeRing();
  }

  /**
   * The escape clock, drawn as a half-ring under the float.
   *
   * It used to be a full circle around the float plus a second, pulsing ring
   * once the meter passed 70%. In a fight that already has one big ring around
   * the zone, a circle drawn on the float read as a second boundary the player
   * might try to keep the fish inside. A half-ring below the float is a gauge,
   * not a boundary: it hugs the waterline the float sits on, it fills from the
   * right to the left as the fish tears the line, and it never draws anything
   * above the float where the bite mark lives.
   */
  private drawEscapeRing(): void {
    const g = this.escapeRing;
    g.clear();
    if (this.phase !== "fight" || this.escapeMeter <= 0.01) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const p = clamp(this.escapeMeter);
    const color = p < 0.5 ? C.cyan : p < 0.8 ? C.gold : C.red;
    // Angles are in canvas space, so 0.18π..0.82π is the arc under the float.
    const from = Math.PI * 0.18;
    const to = Math.PI * 0.82;
    g.arc(0, 0, ESCAPE_ARC_RADIUS, from, to).stroke({
      width: 3,
      color: C.ink,
      alpha: 0.3,
      cap: "round",
    });
    g.arc(0, 0, ESCAPE_ARC_RADIUS, from, from + (to - from) * p).stroke({
      width: 1.5,
      color,
      alpha: 0.95,
      cap: "round",
    });
  }

  playCast(power: number): void {
    this.previewG.clear();
    this.pulling = false;
    // A fresh cast starts with an empty escape gauge: the previous round's
    // pressure never carries over onto the new float.
    this.escapeMeter = 0;
    this.drawEscapeRing();
    this.castPower = clamp(power);
    const zone = this.layout.bobber;
    const spread = zone.spreadBase + this.castPower * zone.spreadPower;
    let targetX: number;
    let targetY: number;
    if (zone.axis === "y") {
      // Casting away from the angler: power controls how far up the frame the
      // float lands, while the sideways spread stays random.
      const center = (zone.minX + zone.maxX) / 2;
      targetX = clamp(
        center + randRange(-spread, spread),
        zone.minX,
        zone.maxX,
      );
      targetY = clamp(
        lerp(zone.maxY, zone.minY, this.castPower) + randRange(-4, 4),
        zone.minY,
        zone.maxY,
      );
    } else {
      // The power axis is always clamped to the band: a sideways jitter that
      // pushed the float past the near edge would drag the ring onto the bank.
      targetX = clamp(
        lerp(zone.minX, zone.maxX, this.castPower) + randRange(-6, 6),
        zone.minX,
        zone.maxX,
      );
      // A sideways cast may be aimed at a band further out than the angler
      // (the river puts it mid-channel instead of on the near shelf).
      const aimY = zone.centerY ?? this.layout.angler.y;
      targetY = clamp(aimY + randRange(-spread, spread), zone.minY, zone.maxY);
    }

    const spot = this.settleCast(targetX, targetY);
    this.bobberBaseX = spot.x;
    this.bobberBaseY = spot.y;
    this.bobber.position.set(this.rodTip.x - 1, this.rodTip.y - 2);
    this.bobber.visible = true;
    this.bobberWash.visible = false;
    this.bobber.alpha = 1;
    this.biteMark.visible = false;
    this.phase = "flying";
    this.castT = 0;
    this.setAngler(this.frames.cast, 11);
    this.spawnSplash(this.rodTip.x, this.rodTip.y, 6, 0.6);
  }

  /**
   * Keeps the landed float far enough from the bank and the angler that the
   * whole fight ring lands on water. The area bands already satisfy this at
   * every power, so the search is a guarantee rather than the tuning knob; it
   * only reports in development when a band edit broke the rule.
   */
  private settleCast(
    x: number,
    y: number,
  ): { x: number; y: number; moved: number; safe: boolean } {
    const isWater = (px: number, py: number): boolean =>
      this.renderer.isWater(px, py);
    const spot = safeCastSpot({
      point: { x, y },
      isWater,
      angler: this.layout.angler,
      away: castAway(this.layout),
      bounds: layoutBounds(this.layout),
    });
    if (import.meta.env.DEV && !spot.safe) {
      console.warn(
        `[fishing] ${this.area.id}: no cast spot clears the fight ring ` +
          `(landed at ${x.toFixed(0)},${y.toFixed(0)})`,
      );
    } else if (import.meta.env.DEV && spot.moved > 0) {
      console.warn(
        `[fishing] ${this.area.id}: the cast needed ${spot.moved}px more ` +
          `distance to clear the ring; widen the bobber band in areas.ts`,
      );
    }
    return spot;
  }

  beginWaiting(): void {
    if (this.phase === "flying") this.phase = "waiting";
  }

  /** Small fake dip shortly before the real bite — anticipation, not a prompt. */
  showNibble(): void {
    if (this.phase !== "waiting") return;
    this.nibbleTime = TIMING.nibbleDuration;
    this.spawnSplash(this.bobberBaseX, this.bobberBaseY + 3, 2, 0.25);
  }

  showBite(): void {
    this.phase = "bite";
    this.biteMark.visible = true;
    // Placed the moment it is shown. The per-frame pass only moves the mark
    // while it is visible, so showing it first left one frame at the spot the
    // mark had last been put — the very corner of the scene on the first bite —
    // and the exclamation mark then jumped to the float.
    this.placeBiteMark(0);
  }

  /** Puts the bite mark over the float, `bounce` pixels higher. */
  private placeBiteMark(bounce: number): void {
    this.biteMark.position.set(this.bobber.x + 2, this.bobber.y - 8 - bounce);
  }

  /** Golden sparkle when the bobber lands inside the luck zone. */
  celebrateLuck(): void {
    this.spawnSplash(this.bobberBaseX, this.bobberBaseY, 18, 1, [
      C.gold,
      C.yellow,
    ]);
    this.rings.push({
      x: this.bobberBaseX,
      y: this.bobberBaseY,
      radius: 3,
      maxRadius: 28,
      life: 0.62,
      maxLife: 0.62,
    });
  }

  setFight(): void {
    this.phase = "fight";
    this.pulling = false;
    this.biteMark.visible = false;
    this.fightBobberX = this.bobberBaseX;
    this.fightBobberY = this.bobberBaseY;
    this.fightTargetX = this.bobberBaseX;
    this.fightTargetY = this.bobberBaseY;
    this.fightDirX = 0;
    this.fightDirY = 1;
    this.setAngler(this.frames.wait, 8);
    this.hookJerk = 0.22;
    this.spawnHookBurst();
  }

  /** Holding LMB: wind-up before a cast or a pull during the fight. */
  setPulling(pulling: boolean): void {
    if (this.pulling === pulling) return;
    this.pulling = pulling;

    if (pulling) {
      if (this.phase === "idle" || this.phase === "fight") {
        this.setAngler(this.frames.pull, 9);
      }
      return;
    }

    if (this.phase === "idle") this.setAngler(this.frames.idle, 8);
    else if (this.phase === "fight") this.setAngler(this.frames.wait, 8);
  }

  /** During the fight the float rides slightly ahead of the fish. */
  setFightFish(
    x: number,
    y: number,
    vx: number,
    vy: number,
    lead = false,
  ): void {
    if (this.phase !== "fight") return;
    const speed = Math.hypot(vx, vy);
    if (speed > 6) {
      this.fightDirX = vx / speed;
      this.fightDirY = vy / speed;
    }
    // Always lead the fish: a bit stronger while the player is actively
    // steering, so the float reads as being dragged in the travel direction.
    const offset = lead ? 8 : 6;
    this.fightTargetX = x + this.fightDirX * offset;
    this.fightTargetY = y + this.fightDirY * offset;
  }

  /**
   * Presents a landed fish above the angler and returns the y of its top edge,
   * so the label can be drawn directly on top of it.
   */
  catchFish(texture: Texture, scale = 1.15): number {
    this.phase = "result";
    this.pulling = false;
    this.biteMark.visible = false;
    this.clearHeldFish();
    const fromX = this.bobber.x;
    const fromY = this.bobber.y;
    this.spawnSplash(fromX, fromY, 18, 1.1);

    const half = (texture.height * scale) / 2;
    const holdY = this.layout.angler.y - CATCH_CLEARANCE - half;
    this.catchSpot = { x: this.layout.angler.x, y: holdY, top: holdY - half };

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.scale.set(scale);
    sprite.position.set(fromX, fromY);
    this.addChild(sprite);
    this.jumps.push({
      sprite,
      t: 0,
      duration: TIMING.catchJump,
      fromX,
      fromY,
      spin: randRange(-0.5, 0.5),
      hold: true,
      scale,
    });

    this.setAngler(this.frames.land, 6);
    this.bobber.visible = false;
    return this.catchSpot.top;
  }

  escapeFish(): void {
    this.phase = "result";
    this.pulling = false;
    this.biteMark.visible = false;
    this.spawnSplash(this.bobber.x, this.bobber.y, 10, 0.9);
    this.bobber.visible = false;
    this.setAngler(this.frames.idle, 8);
  }

  resetCast(): void {
    this.phase = "idle";
    this.pulling = false;
    // The escape gauge belongs to one fight, not to the session: a new cast
    // always starts from an empty gauge, even if the previous round ended with
    // the line at the edge of tearing.
    this.escapeMeter = 0;
    this.drawEscapeRing();
    this.previewG.clear();
    this.biteMark.visible = false;
    this.bobber.visible = false;
    this.line.clear();
    this.setAngler(this.frames.idle, 8);
    this.castT = 0;
    this.nibbleTime = 0;
    this.clearHeldFish();
    for (const jump of this.jumps) jump.sprite.destroy();
    this.jumps = [];
  }

  /** Fade the held catch while the idle cast prompt returns. */
  setHeldFishAlpha(alpha: number): void {
    if (this.heldFish) {
      this.heldFish.alpha = clamp(alpha, 0, 1);
    }
  }

  private clearHeldFish(): void {
    if (this.heldFish) {
      this.heldFish.destroy();
      this.heldFish = null;
    }
    this.heldFishTime = 0;
  }

  // ---------------------------------------------------------------- internal

  private setAngler(frames: readonly number[], fps: number): void {
    this.anglerFrames = frames;
    this.anglerFps = fps;
    this.anglerTimer = 0;
    this.angler.texture =
      this.assets.angler[frames[0]] ??
      this.assets.angler[this.frames.idle[0]] ??
      Texture.WHITE;
  }

  private spawnHookBurst(): void {
    const x = this.bobberBaseX;
    const y = this.bobberBaseY;
    this.spawnSplash(x, y, 24, 1.45);

    // Hook strike: a short, energetic spray in addition to the normal splash.
    for (let i = 0; i < 16; i += 1) {
      const maxLife = randRange(0.35, 0.85);
      this.particles.push({
        x: x + randRange(-3, 3),
        y: y + randRange(-2, 2),
        vx: randRange(-72, 72),
        vy: randRange(-150, -40),
        life: maxLife,
        maxLife,
        size: i % 4 === 0 ? 3 : 2,
        color: Math.random() > 0.5 ? C.cyan : this.palette.ice,
      });
    }

    this.rings.push({
      x,
      y,
      radius: 2,
      maxRadius: 30,
      life: 0.55,
      maxLife: 0.55,
    });
  }

  private spawnSplash(
    x: number,
    y: number,
    count: number,
    strength: number,
    colors: [number, number] = [this.palette.snow, this.palette.ice],
  ): void {
    for (let i = 0; i < count; i += 1) {
      const maxLife = randRange(0.3, 0.7);
      this.particles.push({
        x: x + randRange(-2, 2),
        y: y + randRange(-2, 2),
        vx: randRange(-46, 46) * strength,
        vy: randRange(-95, -28) * strength,
        life: maxLife,
        maxLife,
        size: Math.random() > 0.7 ? 2 : 1,
        color: Math.random() > 0.4 ? colors[0] : colors[1],
      });
    }
    this.rings.push({
      x,
      y,
      radius: 2,
      maxRadius: 12 + strength * 4,
      life: 0.55,
      maxLife: 0.55,
    });
    this.rings.push({
      x,
      y,
      radius: 1,
      maxRadius: 8 + strength * 3,
      life: 0.42,
      maxLife: 0.42,
    });
  }

  update(dt: number): void {
    this.time += dt;
    // Same time constant as the atmosphere's weather blend, so the shadows
    // arrive with the grey sky instead of before it.
    const k = 1 - Math.exp(-dt / 3.5);
    this.cloudiness += (this.cloudTarget - this.cloudiness) * k;
    this.drawLight();
    this.updateAngler(dt);
    this.updateAmbient(dt);
    this.updateCast(dt);
    this.updateParticles(dt);
    this.updateJumps(dt);
    this.updateHeldFish(dt);
    this.renderer.drawMotion(this.motionG, this.time, this.cloudiness);
    this.renderer.animate?.(this.time);
  }

  private updateAngler(dt: number): void {
    if (this.anglerFrames.length <= 1) {
      this.angler.texture =
        this.assets.angler[this.anglerFrames[0]] ??
        this.assets.angler[this.frames.idle[0]] ??
        this.angler.texture;
      return;
    }
    this.anglerTimer += dt * this.anglerFps;
    const index = Math.min(
      this.anglerFrames.length - 1,
      Math.floor(this.anglerTimer),
    );
    const frame = this.anglerFrames[index];
    const texture = this.assets.angler[frame];
    if (texture) this.angler.texture = texture;
  }

  private updateAmbient(dt: number): void {
    for (const item of this.fishShadows) {
      const sprite = item.sprite;
      // Half the body plus a little, so a fish turns before its nose is over
      // the snow instead of after its tail has left the water.
      const reach = sprite.width * 0.4;
      let facing = item.speed >= 0 ? 1 : -1;
      const nextX = sprite.x + item.speed * dt;
      const span = VIEW.width + reach * 2;

      // A fish that leaves the frame comes back on the other side, but only
      // when that edge is open water: the bay runs to the frame, the lake does
      // not.
      if (nextX < -reach || nextX > VIEW.width + reach) {
        const wrapped = nextX < 0 ? nextX + span : nextX - span;
        if (
          this.renderer.isWater(wrapped, sprite.y) &&
          this.renderer.isWater(wrapped + facing * reach, sprite.y)
        ) {
          sprite.x = wrapped;
          sprite.y = this.ambientY(item);
          continue;
        }
      }

      // The shoal lives in the water. A fish that reached the bank used to
      // slide straight up the snow and pop out on the far side of the frame;
      // now it turns, and it only turns when there is water behind it, so a
      // fish trapped in a corner of the channel cannot jitter on the shore.
      const headX = nextX + facing * reach;
      if (
        !this.renderer.isWater(nextX, sprite.y) ||
        !this.renderer.isWater(headX, sprite.y)
      ) {
        const turned = -item.speed;
        const backX = sprite.x + Math.sign(turned) * reach;
        if (
          this.renderer.isWater(sprite.x, sprite.y) &&
          this.renderer.isWater(backX, sprite.y)
        ) {
          item.speed = turned;
          facing = Math.sign(turned);
          sprite.scale.x = Math.abs(sprite.scale.x) * facing;
        }
        continue;
      }

      sprite.x = nextX;
      // The bob follows the body, so a fish near the surface stays under it.
      const nextY = this.ambientY(item);
      if (this.renderer.isWater(sprite.x, nextY)) sprite.y = nextY;
    }
  }

  /** Vertical bob of an ambient fish, in scene pixels. */
  private ambientY(item: { baseY: number; phase: number }): number {
    return item.baseY + Math.sin(this.time * 0.7 + item.phase) * 5;
  }

  private updateCast(dt: number): void {
    const flight = TIMING.castFlight;
    const tension = this.phase === "fight" ? this.escapeMeter : 0;
    if (this.nibbleTime > 0) {
      this.nibbleTime = Math.max(0, this.nibbleTime - dt);
    }
    if (this.phase === "flying") {
      this.castT += dt;
      const t = clamp(this.castT / flight);
      const eased = easeOutCubic(t);
      const fromX = this.rodTip.x - 1;
      const fromY = this.rodTip.y - 2;
      const x = lerp(fromX, this.bobberBaseX, eased);
      const y =
        lerp(fromY, this.bobberBaseY, eased) -
        Math.sin(Math.PI * t) * (26 + this.castPower * 24);
      this.bobber.position.set(x, y);
      this.bobberBody.y = 0;
      this.bobberBody.rotation = t * Math.PI * 2;
      if (t >= 1) {
        this.bobberBody.rotation = 0;
        this.bobber.position.set(this.bobberBaseX, this.bobberBaseY);
        this.phase = "waiting";
        this.spawnSplash(
          this.bobberBaseX,
          this.bobberBaseY,
          8,
          0.7 + this.castPower * 0.4,
        );
        this.onCastLanded?.();
        // Frame 13 holds the rod level over the water while the float waits.
        this.setAngler(this.frames.wait, 8);
      }
    } else if (this.phase === "waiting" || this.phase === "bite") {
      const bob = Math.sin(this.time * 3.1) * 1.2;
      this.bobber.position.set(this.bobberBaseX, this.bobberBaseY + bob);
      // A nibble tugs the float down a little; a real bite takes it all the way
      // under. Both are done by sliding the body behind the waterline mask, so
      // the float reads as being pulled down through the surface instead of
      // bouncing on it.
      this.sinkTarget =
        this.phase === "bite"
          ? BITE_SINK
          : this.nibbleTime > 0
            ? nibbleDip(this.nibbleTime)
            : 0;
      this.bobberBody.rotation =
        this.phase === "bite" ? Math.sin(this.time * 30) * 0.2 : 0;
    } else if (this.phase === "fight") {
      const follow = Math.min(1, dt * 14);
      this.fightBobberX = lerp(this.fightBobberX, this.fightTargetX, follow);
      this.fightBobberY = lerp(this.fightBobberY, this.fightTargetY, follow);
      this.hookJerk = Math.max(0, this.hookJerk - dt);
      const jerkT = this.hookJerk > 0 ? 1 - this.hookJerk / 0.22 : 1;
      const jerk =
        this.hookJerk > 0
          ? Math.sin(jerkT * Math.PI * 2) * 3.6 * (1 - jerkT)
          : 0;
      this.bobber.position.set(
        this.fightBobberX,
        this.fightBobberY + Math.sin(this.time * 8) * 1.2 + jerk,
      );
      // Struck fish: the float pops back to the surface and only dips again as
      // the escape meter grows.
      this.sinkTarget = tension * 4 - jerk * 0.8;
      this.bobberBody.rotation = Math.sin(this.time * 6) * 0.16;
      if (Math.random() < dt * 2) {
        this.spawnSplash(this.fightBobberX, this.fightBobberY, 1, 0.35);
      }
    } else {
      this.bobberBody.y = 0;
      this.sinkTarget = 0;
    }

    // One shared clock for the sink. Going down is a slow glide, not a snap:
    // the bite window is only about half a second, so the float has to be
    // *pulled* under for the player to read it as the fish taking the bait,
    // not as the sprite being teleported.
    const sinkRate = this.sinkTarget > this.bobberBody.y ? 5.5 : 9;
    this.bobberBody.y = lerp(
      this.bobberBody.y,
      this.sinkTarget,
      Math.min(1, dt * sinkRate),
    );
    // The waterline shine belongs to a float that is on the surface.
    this.bobberWash.alpha = clamp(1 - this.bobberBody.y / 5);

    // Line + bite marker. A high escape meter straightens and stiffens the
    // line; the float itself is being dragged under.
    this.line.clear();
    if (this.bobber.visible) {
      const rodX = this.rodTip.x;
      const rodY = this.rodTip.y;
      const bx = this.bobber.x;
      // The float slides under the surface on a bite and again as the escape
      // meter grows (that is what `bobberBody.y` is). The line used to stay
      // pinned to the float's resting spot, so a drowned float kept a line
      // hanging in mid-air above it. It now follows the body down.
      const by = this.bobber.y - 5 + this.bobberBody.y;
      const sag = this.phase === "fight" ? Math.max(0.5, 2 - tension * 1.5) : 8;
      const jitter =
        this.phase === "fight" ? Math.sin(this.time * 30) * tension * 1.2 : 0;
      this.line.moveTo(rodX, rodY);
      this.line.quadraticCurveTo(
        (rodX + bx) / 2 + jitter,
        (rodY + by) / 2 + sag,
        bx,
        by,
      );
      this.line.stroke({
        width: 1 + tension * 1.2,
        color: C.cream,
        alpha: 0.6 + tension * 0.35,
      });
    }

    this.biteMark.visible = this.phase === "bite";
    if (this.biteMark.visible) {
      this.placeBiteMark(Math.abs(Math.sin(this.time * 6)) * 5);
    }

    // --- the water answers the float ------------------------------------
    // Ellipses, not the splash rings: this is the waterline of a float sitting
    // in the lake, so it is drawn as a squashed ring on the surface. The splash
    // rings are for things that *enter* the water; the float never leaves it.
    this.bobberRipple.clear();
    this.bobberWash.visible =
      this.phase === "waiting" ||
      this.phase === "bite" ||
      this.phase === "fight";
    if (this.bobberWash.visible) {
      /** Looking down at the water: rings are circles cut by the surface. */
      const surface = 0.72;
      const pulse = (Math.sin(this.time * 2.4) + 1) / 2;
      // Dragged by the fish the whole footprint grows, the way a float being
      // pulled sideways opens a wider ring around itself.
      const resting = 4.6 + pulse * 1.4 + tension * 5;
      this.bobberRipple.ellipse(0, 0, resting, resting * surface).stroke({
        width: 1,
        color: this.palette.ice,
        alpha: 0.42 + pulse * 0.18 + tension * 0.2,
      });
      // A tug on the bait also pushes the surface: the ellipse spreads with the
      // dip and fades as the float settles back.
      const tug =
        this.nibbleTime > 0 ? nibbleDip(this.nibbleTime) / NIBBLE_DIP : 0;
      if (tug > 0) {
        const rx = 5 + tug * 6;
        this.bobberRipple.ellipse(0, 0, rx, rx * surface).stroke({
          width: 1,
          color: this.palette.snow,
          alpha: 0.55 * (1 - tug * 0.3),
        });
      }
    }
  }

  private updateParticles(dt: number): void {
    this.particlesG.clear();
    this.particles = this.particles.filter((particle) => {
      particle.life -= dt;
      if (particle.life <= 0) return false;
      particle.vy += 220 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const alpha = clamp(particle.life / particle.maxLife);
      this.particlesG
        .rect(particle.x, particle.y, particle.size, particle.size)
        .fill({ color: particle.color, alpha });
      return true;
    });

    this.ringsG.clear();
    this.rings = this.rings.filter((ring) => {
      ring.life -= dt;
      if (ring.life <= 0) return false;
      const t = 1 - ring.life / ring.maxLife;
      const radius = lerp(ring.radius, ring.maxRadius, t);
      this.ringsG
        .circle(ring.x, ring.y, radius)
        .stroke({ width: 1, color: this.palette.snow, alpha: (1 - t) * 0.7 });
      return true;
    });
  }

  private updateJumps(dt: number): void {
    const caughtX = this.catchSpot.x;
    const caughtY = this.catchSpot.y;
    this.jumps = this.jumps.filter((jump) => {
      jump.t += dt / jump.duration;
      if (jump.t >= 1) {
        if (jump.hold) {
          jump.sprite.position.set(caughtX, caughtY);
          jump.sprite.scale.set(jump.scale);
          jump.sprite.rotation = 0;
          jump.sprite.alpha = 1;
          this.heldFish = jump.sprite;
          this.heldFishTime = 0;
          this.spawnSplash(
            this.layout.angler.x,
            this.layout.angler.y - 30,
            4,
            0.35,
          );
        } else {
          jump.sprite.destroy();
        }
        return false;
      }
      const t = jump.t;
      const arc = Math.sin(Math.PI * Math.min(1, t));
      jump.sprite.x = lerp(jump.fromX, caughtX, t);
      jump.sprite.y = lerp(jump.fromY, caughtY, t) - arc * 46;
      jump.sprite.rotation = Math.sin(t * Math.PI * 3) * 0.25 + jump.spin * t;
      jump.sprite.alpha = jump.hold ? 1 : t > 0.85 ? (1 - t) / 0.15 : 1;
      return true;
    });
  }

  private updateHeldFish(dt: number): void {
    if (!this.heldFish) return;
    this.heldFishTime += dt;
    this.heldFish.x =
      this.catchSpot.x + Math.sin(this.heldFishTime * 1.7) * 1.2;
    this.heldFish.y = this.catchSpot.y + Math.sin(this.heldFishTime * 3.4) * 2;
    this.heldFish.rotation = Math.sin(this.heldFishTime * 2.2) * 0.06;
  }
}
