import { AnimatedSprite, Container, Graphics, Sprite } from "pixi.js";
import { C, VIEW } from "../config";
import type { AssetBag } from "../assets";
import { randRange } from "../utils";

interface Swimmer {
  sprite: Sprite;
  speed: number;
  baseY: number;
  phase: number;
}

interface Sparkle {
  sprite: AnimatedSprite;
  baseAlpha: number;
  phase: number;
  speed: number;
}

/**
 * The dim, animated lake used behind menus and result screens. It shares the
 * same water/fish art as the playable scene so the whole game feels coherent.
 */
export class Backdrop extends Container {
  private readonly swimmers: Swimmer[] = [];
  private readonly sparkles: Sparkle[] = [];
  private time = 0;

  constructor(assets: AssetBag) {
    super();

    const g = new Graphics();
    g.rect(0, 0, VIEW.width, VIEW.height).fill(C.deep);
    g.rect(0, 18, VIEW.width, 46).fill({ color: 0x0d5d99 });
    g.rect(0, 64, VIEW.width, 72).fill({ color: C.ocean });
    g.rect(0, 136, VIEW.width, 100).fill({ color: 0x0b78bd });
    g.rect(0, 236, VIEW.width, 34).fill({ color: 0x095b91 });

    for (let y = 30; y < 236; y += 18) {
      const inset = ((y / 18) % 3) * 12;
      g.rect(inset, y, VIEW.width - inset * 2, 1).fill({
        color: C.cyan,
        alpha: 0.06,
      });
    }

    // Far shore.
    g.rect(0, 0, VIEW.width, 16).fill(0x1f4038);
    g.rect(0, 15, VIEW.width, 3).fill(0x2f5753);
    g.rect(0, 18, VIEW.width, 1).fill({ color: C.cream, alpha: 0.12 });
    this.addChild(g);

    // Silhouetted treeline sitting on the far shore. Drawn instead of using the
    // tree sprite so the crowns are not clipped by the top of the world.
    const treeline = new Graphics();
    for (let x = -10; x < VIEW.width + 18; x += 13) {
      const height = 5 + ((x * 17) % 7);
      const width = 11 + ((x * 11) % 4);
      treeline.rect(x, 15 - height, width, height).fill(0x1a3730);
      treeline.rect(x + 2, 15 - height - 2, width - 4, 2).fill(0x1a3730);
      treeline
        .rect(x + 4, 15 - height - 4, Math.max(2, width - 8), 2)
        .fill(0x1a3730);
    }
    this.addChild(treeline);

    for (let i = 0; i < 9; i += 1) {
      const sprite = new AnimatedSprite(assets.ripples);
      sprite.anchor.set(0.5);
      sprite.position.set(randRange(14, VIEW.width - 14), randRange(40, 228));
      sprite.animationSpeed = randRange(0.03, 0.08);
      sprite.scale.set(randRange(1, 1.8));
      sprite.alpha = randRange(0.12, 0.35);
      sprite.play();
      this.sparkles.push({
        sprite,
        baseAlpha: sprite.alpha,
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.5, 1.2),
      });
      this.addChild(sprite);
    }

    const fishIds = Object.keys(assets.fish);
    for (let i = 0; i < 7; i += 1) {
      const id = fishIds[(i * 3) % fishIds.length];
      const texture = assets.fish[id];
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(randRange(1.4, 2.4));
      sprite.alpha = randRange(0.1, 0.2);
      const direction = Math.random() > 0.5 ? 1 : -1;
      sprite.scale.x = Math.abs(sprite.scale.x) * direction;
      sprite.position.set(randRange(0, VIEW.width), randRange(50, 222));
      this.swimmers.push({
        sprite,
        speed: randRange(5, 14) * direction,
        baseY: sprite.y,
        phase: randRange(0, Math.PI * 2),
      });
      this.addChild(sprite);
    }

    // Soft vignette so panels read clearly.
    const vignette = new Graphics();
    for (let i = 0; i < 5; i += 1) {
      const alpha = 0.1 - i * 0.016;
      vignette
        .rect(i * 10, i * 6, VIEW.width - i * 20, VIEW.height - i * 12)
        .stroke({
          width: 10,
          color: C.ink,
          alpha,
        });
    }
    vignette
      .rect(0, 0, VIEW.width, VIEW.height)
      .fill({ color: C.ink, alpha: 0.18 });
    this.addChild(vignette);
  }

  update(dt: number): void {
    this.time += dt;
    for (const item of this.swimmers) {
      const sprite = item.sprite;
      sprite.x += item.speed * dt;
      if (sprite.x < -20) sprite.x = VIEW.width + 20;
      if (sprite.x > VIEW.width + 20) sprite.x = -20;
      sprite.y = item.baseY + Math.sin(this.time * 0.8 + item.phase) * 6;
    }
    for (const item of this.sparkles) {
      item.sprite.alpha =
        item.baseAlpha *
        (0.55 + 0.45 * Math.sin(this.time * item.speed + item.phase));
    }
  }
}
