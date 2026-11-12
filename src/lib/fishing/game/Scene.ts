import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { AssetBag } from "../assets";
import { C, SCENE, TIMING, VIEW } from "../config";
import { clamp, easeOutCubic, lerp, randRange } from "../utils";
import { makeText } from "../ui/theme";

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
}

interface WaterMark {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
  alpha: number;
}

interface Whirl {
  x: number;
  y: number;
  radius: number;
  phase: number;
  spin: number;
  alpha: number;
}

/**
 * Top-down lake, dock and angler. All fishing visuals live here; the HUD and
 * minigame are separate layers owned by GameScreen.
 */
export class LakeScene extends Container {
  private readonly assets: AssetBag;
  private readonly angler = new Sprite();
  private readonly previewG = new Graphics();
  private readonly line = new Graphics();
  private readonly bobber = new Container();
  private readonly bobberBody = new Graphics();
  private readonly bobberRipple = new Graphics();
  private readonly waterMarksG = new Graphics();
  private readonly particlesG = new Graphics();
  private readonly ringsG = new Graphics();
  private readonly biteMark: Text;
  private readonly waterMarks: WaterMark[] = [];
  private readonly whirls: Whirl[] = [];
  private readonly fishShadows: {
    sprite: Sprite;
    speed: number;
    baseY: number;
    phase: number;
  }[] = [];

  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private jumps: Jump[] = [];
  private heldFish: Sprite | null = null;
  private heldFishTime = 0;
  private time = 0;

  private phase: ScenePhase = "idle";
  private castT = 0;
  private castPower = 0;
  private bobberBaseX: number = SCENE.anglerX;
  private bobberBaseY: number = SCENE.bobberMinY;
  private anglerTimer = 0;
  private anglerFrames: number[] = [10];
  private anglerFps = 10;

  private nibbleTime = 0;

  private fightBobberX: number = SCENE.anglerX;
  private fightBobberY: number = SCENE.bobberMinY;
  private fightTargetX: number = SCENE.anglerX;
  private fightTargetY: number = SCENE.bobberMinY;
  private fightDirX = 1;
  private fightDirY = 0;

  /** Called when a cast bobber hits the water. */
  onCastLanded?: () => void;

  constructor(assets: AssetBag) {
    super();
    this.assets = assets;

    const background = new Graphics();
    this.drawWater(background);
    this.drawShore(background);
    this.addChild(background);

    this.addAmbientFish();
    this.addChild(this.waterMarksG);
    this.addChild(this.previewG);
    this.addWaterMarks();
    this.drawDock();

    this.angler.texture = assets.angler[10] ?? Texture.WHITE;
    this.angler.anchor.set(0.5, 1);
    this.angler.position.set(SCENE.anglerX, SCENE.anglerY);
    this.addChild(this.angler);

    this.bobber.addChild(this.bobberRipple);
    this.bobberBody.rect(-3, -5, 7, 11).fill(C.ink);
    this.bobberBody.rect(-2, -4, 5, 5).fill(C.red);
    this.bobberBody.rect(-2, 1, 5, 4).fill(C.cream);
    this.bobberBody.rect(-1, -8, 2, 3).fill(C.ink);
    this.bobber.addChild(this.bobberBody);
    this.bobber.visible = false;
    this.addChild(this.line, this.bobber);

    this.biteMark = makeText("!", {
      size: 22,
      color: C.gold,
      weight: 800,
      align: "center",
    });
    this.biteMark.anchor.set(0.5, 1);
    this.biteMark.visible = false;
    this.biteMark.style.stroke = { color: C.ink, width: 3 };
    this.addChild(this.biteMark);

    this.addChild(this.particlesG, this.ringsG);

    this.addScenery();
  }

  // ---------------------------------------------------------------- drawing

  private drawWater(g: Graphics): void {
    g.rect(0, 0, VIEW.width, VIEW.height).fill(C.deep);
    g.rect(0, 10, VIEW.width, 46).fill(0x0d5d99);
    g.rect(0, 56, VIEW.width, 70).fill(C.ocean);
    g.rect(0, 126, VIEW.width, 106).fill(0x0b78bd);

    // Far shore with a dark treeline.
    g.rect(0, 0, VIEW.width, 12).fill(0x1f4038);
    g.rect(0, 10, VIEW.width, 4).fill(0x2f5753);
    g.rect(0, 14, VIEW.width, 1).fill({ color: C.cream, alpha: 0.12 });

    for (let x = 0; x < VIEW.width; x += 24) {
      const height = 3 + ((x * 7) % 5);
      g.rect(x, 14 - height, 14, height).fill({
        color: 0x18342f,
        alpha: 0.55,
      });
    }

    // Lazy wave crests.
    for (let y = 34; y < SCENE.shoreY - 12; y += 21) {
      const offset = (y * 13) % 60;
      g.rect(20 + offset, y, 30, 1).fill({ color: C.cyan, alpha: 0.09 });
      g.rect(140 + offset, y + 7, 18, 1).fill({ color: C.cyan, alpha: 0.07 });
      g.rect(300 - offset, y + 3, 26, 1).fill({ color: C.cyan, alpha: 0.08 });
    }
  }

  private drawShore(g: Graphics): void {
    const y = SCENE.shoreY;
    g.rect(0, y - 4, VIEW.width, 4).fill({ color: C.cream, alpha: 0.45 });
    g.rect(0, y - 2, VIEW.width, 3).fill(C.sand);
    g.rect(0, y + 1, VIEW.width, VIEW.height - y).fill(C.greenDark);
    g.rect(0, y + 1, VIEW.width, 5).fill(C.green);
    g.rect(0, y + 6, VIEW.width, 2).fill({ color: C.teal, alpha: 0.55 });

    for (let x = 0; x < VIEW.width; x += 17) {
      const height = 2 + ((x * 5) % 4);
      g.rect(x + 3, y + 9, 2, height).fill({ color: C.green, alpha: 0.7 });
      g.rect(x + 8, y + 13 + (x % 3), 1, 2).fill({
        color: C.green,
        alpha: 0.5,
      });
    }
  }

  private drawDock(): void {
    const g = new Graphics();
    const x = SCENE.dockX;
    const y = SCENE.dockY;
    const width = SCENE.dockWidth;
    const height = SCENE.dockBottom - y;

    g.rect(x + 5, y + 5, width, height).fill({ color: C.ink, alpha: 0.3 });
    g.rect(x, y, width, height).fill(C.brown);
    g.rect(x, y, width, 3).fill(C.brownLight);
    g.rect(x, y, 2, height).fill(C.brownDark);
    g.rect(x + width - 2, y, 2, height).fill(C.brownDark);

    for (let py = y + 7; py < SCENE.dockBottom; py += 9) {
      g.rect(x + 2, py, width - 4, 1).fill({ color: C.brownDark, alpha: 0.7 });
      g.rect(x + 6 + ((py * 7) % 20), py + 2, 2, 1).fill({
        color: C.brownDark,
        alpha: 0.4,
      });
    }

    for (let py = y + 10; py < SCENE.dockBottom - 6; py += 30) {
      g.rect(x - 3, py, 4, 9).fill(C.brownDark);
      g.rect(x + width - 1, py, 4, 9).fill(C.brownDark);
      g.rect(x - 3, py, 4, 2).fill(C.brownLight);
      g.rect(x + width - 1, py, 4, 2).fill(C.brownLight);
    }

    this.addChild(g);
  }

  private addScenery(): void {
    const scenery = new Container();
    const tree = this.assets.tree;
    const bush = this.assets.bush;
    const rock = this.assets.rock;

    const trees = [
      { x: 24, y: 274, scale: 1.15, flip: false },
      { x: 452, y: 274, scale: 1.15, flip: true },
      { x: 64, y: 268, scale: 0.85, flip: false },
      { x: 414, y: 268, scale: 0.85, flip: true },
    ];
    for (const item of trees) {
      const sprite = new Sprite(tree);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(item.x, item.y);
      sprite.scale.set(item.flip ? -item.scale : item.scale, item.scale);
      scenery.addChild(sprite);
    }

    const sideScenery = [
      { x: 6, y: 246, s: 1.2 },
      { x: 40, y: 252, s: 0.9 },
      { x: 442, y: 248, s: 1.1 },
      { x: 470, y: 254, s: 0.9 },
      { x: 148, y: 244, s: 0.8 },
      { x: 330, y: 246, s: 0.8 },
    ];
    for (const item of sideScenery) {
      const sprite = new Sprite(bush);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(item.x, item.y);
      sprite.scale.set(item.s);
      scenery.addChild(sprite);
    }

    const rocks = [
      { x: 96, y: 248, s: 1 },
      { x: 376, y: 250, s: 1.1 },
      { x: 208, y: 240, s: 0.8 },
      { x: 286, y: 242, s: 0.8 },
    ];
    for (const item of rocks) {
      const sprite = new Sprite(rock);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(item.x, item.y);
      sprite.scale.set(item.s);
      scenery.addChild(sprite);
    }

    this.addChildAt(scenery, this.getChildIndex(this.angler));
  }

  private addWaterMarks(): void {
    // Surface ripples are drawn procedurally: the old sprite-sheet tiles had
    // opaque blue backgrounds and read as square patches on the lake.
    for (let i = 0; i < 14; i += 1) {
      this.waterMarks.push({
        x: randRange(16, VIEW.width - 16),
        y: randRange(34, SCENE.shoreY - 18),
        radius: randRange(5, 13),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.45, 1.15),
        alpha: randRange(0.05, 0.12),
      });
    }

    for (let i = 0; i < 2; i += 1) {
      this.whirls.push({
        x: randRange(52, VIEW.width - 52),
        y: randRange(62, 150),
        radius: randRange(8, 13),
        phase: randRange(0, Math.PI * 2),
        spin: randRange(0.16, 0.32),
        alpha: randRange(0.05, 0.085),
      });
    }
  }

  private addAmbientFish(): void {
    const ids = Object.keys(this.assets.fish);
    for (let i = 0; i < 3; i += 1) {
      const id = ids[(i * 4) % ids.length];
      const sprite = new Sprite(this.assets.fish[id]);
      sprite.anchor.set(0.5);
      sprite.alpha = 0.09;
      sprite.tint = 0x0f5c8f;
      sprite.scale.set(randRange(0.62, 0.95));
      const direction = Math.random() > 0.5 ? 1 : -1;
      sprite.scale.x = Math.abs(sprite.scale.x) * direction;
      sprite.position.set(randRange(20, 460), randRange(50, 180));
      this.fishShadows.push({
        sprite,
        speed: randRange(6, 14) * direction,
        baseY: sprite.y,
        phase: randRange(0, Math.PI * 2),
      });
      this.addChild(sprite);
    }
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

  playCast(power: number): void {
    this.previewG.clear();
    this.castPower = clamp(power);
    const targetY = lerp(SCENE.bobberMaxY, SCENE.bobberMinY, this.castPower);
    const spread = 20 + this.castPower * 26;
    const targetX = clamp(
      SCENE.anglerX + randRange(-spread, spread),
      SCENE.dockX - 8,
      SCENE.dockX + SCENE.dockWidth + 8,
    );

    this.bobberBaseX = targetX;
    this.bobberBaseY = targetY;
    this.bobber.position.set(SCENE.anglerX + 1, SCENE.anglerY - 30);
    this.bobber.visible = true;
    this.bobber.alpha = 1;
    this.biteMark.visible = false;
    this.phase = "flying";
    this.castT = 0;
    this.setAngler([8, 9, 10], 11);
    this.spawnSplash(SCENE.anglerX, SCENE.anglerY - 18, 6, 0.6);
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
    this.biteMark.visible = false;
    this.fightBobberX = this.bobberBaseX;
    this.fightBobberY = this.bobberBaseY;
    this.fightTargetX = this.bobberBaseX;
    this.fightTargetY = this.bobberBaseY;
    this.fightDirX = 0;
    this.fightDirY = 1;
    this.setAngler([11], 8);
    this.spawnSplash(this.bobberBaseX, this.bobberBaseY, 14, 1);
  }

  /** During the fight the float trails the fish under the surface. */
  setFightFish(x: number, y: number, vx: number, vy: number): void {
    if (this.phase !== "fight") return;
    const speed = Math.hypot(vx, vy);
    if (speed > 6) {
      this.fightDirX = vx / speed;
      this.fightDirY = vy / speed;
    }
    const trail = 8;
    this.fightTargetX = x - this.fightDirX * trail;
    this.fightTargetY = y - this.fightDirY * trail;
  }

  catchFish(texture: Texture): void {
    this.phase = "result";
    this.biteMark.visible = false;
    this.clearHeldFish();
    const fromX = this.bobber.x;
    const fromY = this.bobber.y;
    this.spawnSplash(fromX, fromY, 18, 1.1);

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.scale.set(1.5);
    sprite.position.set(fromX, fromY);
    this.addChild(sprite);
    this.jumps.push({
      sprite,
      t: 0,
      duration: 0.62,
      fromX,
      fromY,
      spin: randRange(-0.5, 0.5),
      hold: true,
    });

    this.setAngler([11], 6);
    this.bobber.visible = false;
  }

  escapeFish(): void {
    this.phase = "result";
    this.biteMark.visible = false;
    this.spawnSplash(this.bobber.x, this.bobber.y, 10, 0.9);
    this.bobber.visible = false;
    this.setAngler([10], 8);
  }

  resetCast(): void {
    this.phase = "idle";
    this.previewG.clear();
    this.biteMark.visible = false;
    this.bobber.visible = false;
    this.line.clear();
    this.setAngler([10], 8);
    this.castT = 0;
    this.nibbleTime = 0;
    this.bobberRipple.clear();
    this.clearHeldFish();
    for (const jump of this.jumps) jump.sprite.destroy();
    this.jumps = [];
  }

  private clearHeldFish(): void {
    if (this.heldFish) {
      this.heldFish.destroy();
      this.heldFish = null;
    }
    this.heldFishTime = 0;
  }

  // ---------------------------------------------------------------- internal

  private setAngler(frames: number[], fps: number): void {
    this.anglerFrames = frames;
    this.anglerFps = fps;
    this.anglerTimer = 0;
    this.angler.texture =
      this.assets.angler[frames[0]] ?? this.assets.angler[10] ?? Texture.WHITE;
  }

  private spawnSplash(
    x: number,
    y: number,
    count: number,
    strength: number,
    colors: [number, number] = [C.cream, C.cyan],
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
    this.updateAngler(dt);
    this.updateAmbient(dt);
    this.updateCast(dt);
    this.updateParticles(dt);
    this.updateJumps(dt);
    this.updateHeldFish(dt);
  }

  private updateAngler(dt: number): void {
    if (this.anglerFrames.length <= 1) {
      this.angler.texture =
        this.assets.angler[this.anglerFrames[0]] ??
        this.assets.angler[10] ??
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
    this.drawWaterMarks();
    for (const item of this.fishShadows) {
      const sprite = item.sprite;
      sprite.x += item.speed * dt;
      if (sprite.x < -20) sprite.x = VIEW.width + 20;
      if (sprite.x > VIEW.width + 20) sprite.x = -20;
      sprite.y = item.baseY + Math.sin(this.time * 0.7 + item.phase) * 5;
    }
  }

  private drawWaterMarks(): void {
    const g = this.waterMarksG;
    g.clear();

    for (const mark of this.waterMarks) {
      const pulse = (Math.sin(this.time * mark.speed + mark.phase) + 1) / 2;
      const radius = mark.radius * (0.65 + pulse * 0.45);
      g.ellipse(mark.x, mark.y, radius, radius * 0.38).stroke({
        width: 1,
        color: C.cyan,
        alpha: mark.alpha * (0.4 + pulse * 0.6),
      });
      if (pulse > 0.72) {
        g.rect(mark.x - 1, mark.y - radius * 0.38 - 2, 2, 1).fill({
          color: C.cream,
          alpha: mark.alpha * 0.8,
        });
      }
    }

    for (const whirl of this.whirls) {
      const angle = this.time * whirl.spin + whirl.phase;
      for (let i = 0; i < 3; i += 1) {
        const radius = whirl.radius * (0.45 + i * 0.17);
        const start = angle + (i * Math.PI * 2) / 3;
        // `arc()` connects the current path to the arc start, which produced a
        // stray diagonal line across the lake. Move to the start point first.
        g.moveTo(
          whirl.x + Math.cos(start) * radius,
          whirl.y + Math.sin(start) * radius,
        );
        g.arc(whirl.x, whirl.y, radius, start, start + 0.72).stroke({
          width: 1,
          color: C.cream,
          alpha: whirl.alpha,
        });
      }
    }
  }

  private updateCast(dt: number): void {
    const flight = TIMING.castFlight;
    if (this.nibbleTime > 0) {
      this.nibbleTime = Math.max(0, this.nibbleTime - dt);
    }
    if (this.phase === "flying") {
      this.castT += dt;
      const t = clamp(this.castT / flight);
      const eased = easeOutCubic(t);
      const fromX = SCENE.anglerX + 1;
      const fromY = SCENE.anglerY - 30;
      const x = lerp(fromX, this.bobberBaseX, eased);
      const y =
        lerp(fromY, this.bobberBaseY, eased) -
        Math.sin(Math.PI * t) * (34 + this.castPower * 26);
      this.bobber.position.set(x, y);
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
        this.setAngler([10], 8);
      }
    } else if (this.phase === "waiting" || this.phase === "bite") {
      const bob = Math.sin(this.time * 3.1) * 1.2;
      const nibble =
        this.nibbleTime > 0
          ? Math.sin((TIMING.nibbleDuration - this.nibbleTime) * 46) *
            1.8 *
            (this.nibbleTime / TIMING.nibbleDuration)
          : 0;
      const biteDip =
        this.phase === "bite" ? Math.sin(this.time * 26) * 2 + 3 : 0;
      this.bobber.position.set(
        this.bobberBaseX,
        this.bobberBaseY + bob + nibble + biteDip,
      );
      this.bobberBody.rotation =
        this.phase === "bite" ? Math.sin(this.time * 30) * 0.2 : 0;
    } else if (this.phase === "fight") {
      const follow = Math.min(1, dt * 14);
      this.fightBobberX = lerp(this.fightBobberX, this.fightTargetX, follow);
      this.fightBobberY = lerp(this.fightBobberY, this.fightTargetY, follow);
      this.bobber.position.set(
        this.fightBobberX,
        this.fightBobberY + Math.sin(this.time * 8) * 1.2,
      );
      this.bobberBody.rotation = Math.sin(this.time * 6) * 0.16;
      if (Math.random() < dt * 2) {
        this.spawnSplash(this.fightBobberX, this.fightBobberY, 1, 0.35);
      }
    }

    // Line + bite marker.
    this.line.clear();
    if (this.bobber.visible) {
      const rodX = SCENE.anglerX + 1;
      const rodY = SCENE.anglerY - 32;
      const bx = this.bobber.x;
      const by = this.bobber.y - 6;
      const sag = this.phase === "fight" ? 2 : 8;
      this.line.moveTo(rodX, rodY);
      this.line.quadraticCurveTo(
        (rodX + bx) / 2,
        (rodY + by) / 2 + sag,
        bx,
        by,
      );
      this.line.stroke({ width: 1, color: C.cream, alpha: 0.6 });
    }

    this.biteMark.visible = this.phase === "bite";
    if (this.biteMark.visible) {
      const bounce = Math.abs(Math.sin(this.time * 6)) * 5;
      this.biteMark.position.set(this.bobber.x, this.bobber.y - 10 - bounce);
    }

    // Bobber ripple.
    this.bobberRipple.clear();
    if (this.phase === "waiting" || this.phase === "bite") {
      const pulse = (Math.sin(this.time * 2.4) + 1) / 2;
      this.bobberRipple
        .circle(0, 0, 6 + pulse * 3)
        .stroke({ width: 1, color: C.cyan, alpha: 0.25 + pulse * 0.15 });
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
        .stroke({ width: 1, color: C.cream, alpha: (1 - t) * 0.7 });
      return true;
    });
  }

  private updateJumps(dt: number): void {
    this.jumps = this.jumps.filter((jump) => {
      jump.t += dt / jump.duration;
      if (jump.t >= 1) {
        if (jump.hold) {
          jump.sprite.position.set(SCENE.anglerX, SCENE.anglerY - 84);
          jump.sprite.scale.set(1.6);
          jump.sprite.rotation = 0;
          jump.sprite.alpha = 1;
          this.heldFish = jump.sprite;
          this.heldFishTime = 0;
          this.spawnSplash(SCENE.anglerX, SCENE.anglerY - 54, 4, 0.35);
        } else {
          jump.sprite.destroy();
        }
        return false;
      }
      const t = jump.t;
      const arc = Math.sin(Math.PI * Math.min(1, t));
      jump.sprite.x = lerp(jump.fromX, SCENE.anglerX, t);
      jump.sprite.y = lerp(jump.fromY, SCENE.anglerY - 84, t) - arc * 46;
      jump.sprite.rotation = Math.sin(t * Math.PI * 3) * 0.25 + jump.spin * t;
      jump.sprite.alpha = jump.hold ? 1 : t > 0.85 ? (1 - t) / 0.15 : 1;
      return true;
    });
  }

  private updateHeldFish(dt: number): void {
    if (!this.heldFish) return;
    this.heldFishTime += dt;
    this.heldFish.x = SCENE.anglerX + Math.sin(this.heldFishTime * 1.7) * 1.2;
    this.heldFish.y =
      SCENE.anglerY - 84 + Math.sin(this.heldFishTime * 3.4) * 2;
    this.heldFish.rotation = Math.sin(this.heldFishTime * 2.2) * 0.06;
  }
}
