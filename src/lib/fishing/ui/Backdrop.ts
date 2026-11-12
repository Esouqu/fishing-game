import { Container, Graphics, Sprite } from "pixi.js";
import { C, VIEW } from "../config";
import type { AssetBag } from "../assets";
import type { WorldClock } from "../world";
import { randRange } from "../utils";
import { Atmosphere } from "../game/Atmosphere";

interface Swimmer {
  sprite: Sprite;
  speed: number;
  baseY: number;
  phase: number;
}

interface WaterMark {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
  alpha: number;
}

/**
 * The dim, animated lake used behind menus and result screens. It shares the
 * same water/fish art as the playable scene so the whole game feels coherent.
 */
export class Backdrop extends Container {
  private readonly swimmers: Swimmer[] = [];
  private readonly marks: WaterMark[] = [];
  private readonly marksG = new Graphics();
  private readonly atmosphere = new Atmosphere();
  private time = 0;

  constructor(assets: AssetBag, clock?: WorldClock) {
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

    for (let i = 0; i < 12; i += 1) {
      this.marks.push({
        x: randRange(12, VIEW.width - 12),
        y: randRange(38, 230),
        radius: randRange(4, 11),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.45, 1.1),
        alpha: randRange(0.04, 0.09),
      });
    }
    this.addChild(this.marksG);

    const fishIds = Object.keys(assets.fish);
    for (let i = 0; i < 7; i += 1) {
      const id = fishIds[(i * 3) % fishIds.length];
      const texture = assets.fish[id];
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(randRange(0.6, 0.95));
      sprite.alpha = randRange(0.1, 0.18);
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

    // Weather sits above the fish but below the dark vignette.
    this.addChild(this.atmosphere);
    if (clock) {
      this.atmosphere.setWorld(clock.palette, clock.weatherDef);
      this.tint = clock.palette.tint;
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
    this.drawWaterMarks();
    this.atmosphere.update(dt);
    for (const item of this.swimmers) {
      const sprite = item.sprite;
      sprite.x += item.speed * dt;
      if (sprite.x < -20) sprite.x = VIEW.width + 20;
      if (sprite.x > VIEW.width + 20) sprite.x = -20;
      sprite.y = item.baseY + Math.sin(this.time * 0.8 + item.phase) * 6;
    }
  }

  private drawWaterMarks(): void {
    const g = this.marksG;
    g.clear();
    for (const mark of this.marks) {
      const pulse = (Math.sin(this.time * mark.speed + mark.phase) + 1) / 2;
      const radius = mark.radius * (0.65 + pulse * 0.45);
      g.ellipse(mark.x, mark.y, radius, radius * 0.38).stroke({
        width: 1,
        color: C.cyan,
        alpha: mark.alpha * (0.4 + pulse * 0.6),
      });
    }
  }
}
