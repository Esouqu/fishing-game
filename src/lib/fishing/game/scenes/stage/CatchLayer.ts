import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { TIMING } from "../../../config";
import type { FishTier } from "../../../types";
import { clamp, lerp, randRange } from "../../../utils";
import { FxLayer } from "./FxLayer";
import { CATCH_CLEARANCE } from "./setup";

/** Step the catch's sunburst turns in, in radians: whole-pixel beats, not drift. */
const RAY_STEP = 0.04;
/** Seconds per radian of that spin. */
const RAY_SPIN = 0.12;

interface RayLook {
  /** Every other ray runs long; these two colours alternate with it. */
  long: number;
  short: number;
  /** The glow in the middle, where all the rays meet. */
  core: number;
  /** Overall strength: a common catch glows, a trophy blazes. */
  intensity: number;
}

/**
 * The burst is keyed to the rarity of the catch, because that is the one thing
 * the round is already telling the player through the ring, the codex and the
 * weight: a trophy should not come up under the same light as a roach.
 *
 * Common keeps the warm cream of the reference effect, rare turns it to ice,
 * legendary to gold — the same three colours the codex uses for the tiers.
 */
const RAY_LOOK: Record<FishTier, RayLook> = {
  common: { long: 0xfff3d8, short: 0xefcf9f, core: 0xfff8ea, intensity: 0.62 },
  rare: { long: 0xe4f4ff, short: 0x8fc8ee, core: 0xf2fbff, intensity: 0.84 },
  legendary: { long: 0xfff1bd, short: 0xffc45c, core: 0xfff8d8, intensity: 1 },
};

export class CatchLayer extends FxLayer {
  /**
   * The light behind a landed fish.
   *
   * A catch arrived as a sprite that flew out of the water and hovered over the
   * angler, with nothing marking it as the payoff of the round. The rays are
   * that mark: a sunburst of thin wedges behind the fish, spinning slowly and
   * fading in with the jump. They live in their own node so they stay *behind*
   * the fish whatever else the layer draws.
   */
  private readonly rayNode = new Container();
  private readonly rayG = new Graphics();
  /** Tier the burst was baked for; a different catch re-bakes it. */
  private rayTier: FishTier | null = null;
  private raySpin = 0;
  private rayFade = 0;
  private rayDim = 1;

  catchFish(texture: Texture, scale = 1.15, tier: FishTier = "common"): number {
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

    // Behind the fish: added before the sprite, so every later child paints over
    // it.
    this.buildRays(tier);
    this.rayNode.position.set(fromX, fromY);
    this.rayFade = 0;
    this.rayDim = 1;
    this.rayNode.alpha = 0;
    this.addChild(this.rayNode);

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
    // The gauges belong to one fight, not to the session: a new cast always
    // starts from a rested fish and an empty escape clock, even if the previous
    // round ended with the line at the edge of tearing.
    this.escapeMeter = 0;
    this.fishStamina = 1;
    this.drawStaminaArc();
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
    this.rayDim = clamp(alpha, 0, 1);
    this.applyRayAlpha();
  }

  /**
   * The sunburst, baked once per rarity. Many thin wedges rather than a dozen
   * spokes: they taper out of the centre and widen towards the rim, so the whole
   * disc reads as light. A radial gradient would be the one blurred thing on a
   * pixel-art screen, so the glow is built from three hard discs instead.
   */
  private buildRays(tier: FishTier): void {
    if (this.rayTier === tier) return;
    this.rayTier = tier;
    if (!this.rayNode.parent) this.rayNode.addChild(this.rayG);
    this.rayNode.blendMode = "add";
    const look = RAY_LOOK[tier];
    const g = this.rayG;
    g.clear();
    const beams = 24;
    for (let i = 0; i < beams; i += 1) {
      const angle = (i / beams) * Math.PI * 2;
      const long = i % 2 === 0;
      const inner = 1;
      const outer = long ? 22 : 14;
      // Narrow at the centre, wide at the rim: a wedge, not a needle.
      const tip = 0.3;
      const edge = long ? 1.3 : 0.9;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const px = -sin;
      const py = cos;
      g.poly([
        cos * inner + px * tip,
        sin * inner + py * tip,
        cos * outer + px * edge,
        sin * outer + py * edge,
        cos * outer - px * edge,
        sin * outer - py * edge,
        cos * inner - px * tip,
        sin * inner - py * tip,
      ]).fill({
        color: long ? look.long : look.short,
        alpha: (long ? 0.55 : 0.34) * look.intensity,
      });
    }
    // The glow in the middle, where every wedge meets.
    for (const [radius, alpha] of [
      [8, 0.16],
      [5, 0.24],
      [2.5, 0.36],
    ] as const) {
      g.circle(0, 0, radius).fill({
        color: look.core,
        alpha: alpha * look.intensity,
      });
    }
  }

  /** Follows the fish, turns a notch at a time and eases its own opacity. */
  private updateRays(dt: number, x: number, y: number): void {
    if (this.rayTier === null) return;
    this.rayNode.position.set(x, y);
    this.rayFade += (1 - this.rayFade) * Math.min(1, dt * 7);
    this.raySpin =
      Math.round((this.raySpin + dt * RAY_SPIN) / RAY_STEP) * RAY_STEP;
    this.rayNode.rotation = this.raySpin;
    this.applyRayAlpha();
  }

  private applyRayAlpha(): void {
    // A slow breath, so the light is alive without pulsing like a warning.
    const breath = 0.92 + Math.sin(this.time * 2.1) * 0.08;
    this.rayNode.alpha = this.rayFade * this.rayDim * 0.9 * breath;
  }

  protected clearHeldFish(): void {
    if (this.heldFish) {
      this.heldFish.destroy();
      this.heldFish = null;
    }
    this.heldFishTime = 0;
    this.rayFade = 0;
    this.rayNode.alpha = 0;
  }

  // ---------------------------------------------------------------- internal
  protected updateJumps(dt: number): void {
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
      // The burst rides with the fish out of the water, not at the landing spot:
      // it is the fish that is lit.
      if (jump.hold) this.updateRays(dt, jump.sprite.x, jump.sprite.y);
      return true;
    });
  }

  protected updateHeldFish(dt: number): void {
    if (!this.heldFish) return;
    this.heldFishTime += dt;
    this.heldFish.x =
      this.catchSpot.x + Math.sin(this.heldFishTime * 1.7) * 1.2;
    this.heldFish.y = this.catchSpot.y + Math.sin(this.heldFishTime * 3.4) * 2;
    this.heldFish.rotation = Math.sin(this.heldFishTime * 2.2) * 0.06;
    this.updateRays(dt, this.heldFish.x, this.heldFish.y);
  }
}
