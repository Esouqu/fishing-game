import { Container, Graphics, Rectangle, Sprite } from "pixi.js";
import { C, VIEW } from "../config";
import type { AssetBag } from "../assets";
import type { WorldClock } from "../world";
import { WINTER, winterWaterAt } from "../world";
import { randRange } from "../utils";
import { Atmosphere } from "../game/Atmosphere";
import { CURSORS } from "../cursors";

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

    // Menus have no full-screen input catcher of their own, so the backdrop
    // becomes the hover target that carries the custom default cursor.
    this.eventMode = "static";
    this.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.cursor = CURSORS.default;

    const g = new Graphics();

    // Cold depth gradient: darker water in the foreground, turquoise near the
    // far bank, matching the playable lake.
    for (let y = 0; y < VIEW.height; y += 1) {
      const t = 1 - y / VIEW.height;
      g.rect(0, y, VIEW.width, 1).fill(winterWaterAt(t));
    }

    for (let y = 30; y < 250; y += 18) {
      const inset = ((y / 18) % 3) * 12;
      g.rect(inset, y, VIEW.width - inset * 2, 1).fill({
        color: WINTER.ice,
        alpha: 0.07,
      });
    }

    // Snowy far shore with a clipped pine treeline.
    g.rect(0, 0, VIEW.width, 13).fill(WINTER.farShoreSnow);
    g.rect(0, 11, VIEW.width, 3).fill(WINTER.snowShade);
    for (let x = -10; x < VIEW.width + 18; x += 13) {
      const height = 5 + ((x * 17) % 7);
      const width = 11 + ((x * 11) % 4);
      g.rect(x, 12 - height, width, height).fill(WINTER.treeDark);
      g.rect(x + 2, 12 - height - 3, width - 4, 3).fill(WINTER.treeDark);
      g.rect(x + 4, 12 - height - 5, Math.max(2, width - 8), 2).fill(
        WINTER.treeDark,
      );
      g.rect(x + 3, 12 - height - 5, Math.max(2, width - 6), 1).fill({
        color: WINTER.farShoreSnow,
        alpha: 0.85,
      });
    }
    g.rect(0, 16, VIEW.width, 1).fill({ color: WINTER.ice, alpha: 0.7 });
    this.addChild(g);

    // Drift ice near the far and near edges.
    const ice = new Graphics();
    for (const spot of [
      { x: 34, y: 25, w: 16, h: 3 },
      { x: 132, y: 21, w: 11, h: 2 },
      { x: 308, y: 23, w: 14, h: 2.5 },
      { x: 424, y: 27, w: 9, h: 2 },
      { x: 60, y: 256, w: 18, h: 3 },
      { x: 210, y: 262, w: 12, h: 2 },
      { x: 390, y: 258, w: 15, h: 2.5 },
    ]) {
      ice.ellipse(spot.x, spot.y, spot.w, spot.h).fill({
        color: WINTER.ice,
        alpha: 0.55,
      });
      ice
        .ellipse(
          spot.x - spot.w * 0.15,
          spot.y - 0.8,
          spot.w * 0.5,
          spot.h * 0.5,
        )
        .fill({ color: WINTER.snowLight, alpha: 0.7 });
    }
    this.addChild(ice);

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
      sprite.tint = 0x0d4a66;
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
        color: WINTER.ice,
        alpha: mark.alpha * (0.4 + pulse * 0.6),
      });
    }
  }
}
