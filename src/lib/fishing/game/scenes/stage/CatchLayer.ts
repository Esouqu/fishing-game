import { Sprite, Texture } from "pixi.js";
import { TIMING } from "../../../config";
import { clamp, lerp, randRange } from "../../../utils";
import { FxLayer } from "./FxLayer";
import { CATCH_CLEARANCE } from "./setup";

export class CatchLayer extends FxLayer {
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
  }

  protected clearHeldFish(): void {
    if (this.heldFish) {
      this.heldFish.destroy();
      this.heldFish = null;
    }
    this.heldFishTime = 0;
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
  }
}
