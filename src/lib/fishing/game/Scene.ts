import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { AssetBag } from "../assets";
import { C, SCENE, TIMING, VIEW } from "../config";
import { clamp, easeOutCubic, lerp, randRange } from "../utils";
import { WINTER, winterWaterAt } from "../world";
import { makeText } from "../ui/theme";
import { TEXT } from "../texts";

type ScenePhase = "idle" | "flying" | "waiting" | "bite" | "fight" | "result";

const CAUGHT_FISH_X = SCENE.anglerX + 2;
const CAUGHT_FISH_Y = SCENE.anglerY - 44;

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

interface ScenerySpot {
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
}

/**
 * Top-down winter lake, snowy dock and angler. All fishing visuals live here;
 * the HUD and minigame are separate layers owned by GameScreen.
 */
export class LakeScene extends Container {
  private readonly assets: AssetBag;
  private readonly angler = new Sprite();
  private readonly previewG = new Graphics();
  private readonly line = new Graphics();
  private readonly bobber = new Container();
  private readonly bobberBody = new Graphics();
  private readonly bobberRipple = new Graphics();
  private readonly bobberWash = new Graphics();
  private readonly bobberClip = new Graphics();
  private readonly waterMarksG = new Graphics();
  private readonly particlesG = new Graphics();
  private readonly ringsG = new Graphics();
  private readonly props = new Container();
  private readonly lanternGlow = new Graphics();
  private readonly lanternFlame = new Graphics();
  private readonly biteMark: Text;
  private readonly waterMarks: WaterMark[] = [];
  private readonly whirls: Whirl[] = [];
  private readonly ripples: Array<{
    x: number;
    y: number;
    length: number;
    bend: number;
    slope: number;
    alpha: number;
    width: number;
    color: number;
  }> = [];
  private readonly fishShadows: {
    sprite: Sprite;
    speed: number;
    baseY: number;
    phase: number;
  }[] = [];

  /** Rod tip of the lowered waiting pose (frame 13, 32×32 sheet, tip 31,18). */
  private readonly rodTip = {
    x: SCENE.anglerX + 15,
    y: SCENE.anglerY - 14,
  };

  /** Lantern at the top-right corner of the pier. */
  private readonly lanternPos = {
    x: SCENE.lanternX,
    y: SCENE.lanternY,
  };
  private lanternLevel = 0;
  private escapeMeter = 0;

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
  private bobberBaseY: number = SCENE.anglerY;
  private anglerTimer = 0;
  private anglerFrames: number[] = [12];
  private anglerFps = 10;
  private pulling = false;

  private nibbleTime = 0;

  private fightBobberX: number = SCENE.anglerX;
  private fightBobberY: number = SCENE.anglerY;
  private fightTargetX: number = SCENE.anglerX;
  private fightTargetY: number = SCENE.anglerY;
  private fightDirX = 1;
  private fightDirY = 0;
  private hookJerk = 0;

  /** Called when a cast bobber hits the water. */
  onCastLanded?: () => void;

  constructor(assets: AssetBag) {
    super();
    this.assets = assets;

    const background = new Graphics();
    this.addWaterRipples();
    this.drawWater(background);
    this.drawShore(background);
    this.addChild(background);

    this.addAmbientFish();
    this.addChild(this.waterMarksG);
    this.addChild(this.previewG);
    this.addWaterMarks();
    this.drawDock();

    this.angler.texture = assets.angler[12] ?? Texture.WHITE;
    this.angler.anchor.set(0.5, 1);
    this.angler.position.set(SCENE.anglerX, SCENE.anglerY);

    this.props.sortableChildren = true;
    this.bobberClip.rect(-4, -12, 8, 12).fill(0xffffff);
    this.bobber.addChild(this.bobberClip);
    this.bobber.addChild(this.bobberRipple);

    // The waterline stays at y=0; the mask hides everything below it, and the
    // fight sinks the body through this clip as the escape meter grows. The
    // wash is drawn behind the body so the float itself stays crisp on top of
    // the water effect.
    this.bobberWash.rect(-2, 0, 5, 1).fill({
      color: WINTER.snow,
      alpha: 0.38,
    });
    this.bobberWash.ellipse(0, 1, 4.8, 1.5).stroke({
      width: 1,
      color: WINTER.ice,
      alpha: 0.6,
    });
    this.bobberWash.ellipse(0, 1, 3.1, 0.9).stroke({
      width: 1,
      color: WINTER.ice,
      alpha: 0.4,
    });
    this.bobber.addChild(this.bobberWash);

    this.bobberBody.rect(-2, -4, 5, 8).fill(C.ink);
    this.bobberBody.rect(-1, -3, 3, 3).fill(C.red);
    this.bobberBody.rect(-1, 0, 3, 3).fill(C.cream);
    this.bobberBody.rect(0, -6, 1, 2).fill(C.ink);
    this.bobber.addChild(this.bobberBody);
    this.bobberBody.mask = this.bobberClip;

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
    this.addChild(this.biteMark);

    this.addChild(this.particlesG, this.ringsG);

    this.addScenery();
  }

  // ---------------------------------------------------------------- drawing

  private shoreEdgeAt(y: number): number {
    return (
      SCENE.shoreX + Math.sin(y * 0.065) * 3.2 + Math.sin(y * 0.17 + 1.7) * 1.6
    );
  }

  private drawWater(g: Graphics): void {
    const shore = SCENE.shoreX;
    const far = SCENE.farShoreX;

    g.rect(0, 0, VIEW.width, VIEW.height).fill(WINTER.waterFar);

    // A smooth one-pixel gradient instead of hard depth bands. It starts a
    // little left of the nominal shore so the wavy bank never shows a gap.
    for (let x = shore - 10; x < far; x += 1) {
      const t = clamp((x - shore) / (far - shore));
      g.rect(x, 0, 1, VIEW.height).fill(winterWaterAt(t));
    }

    // Cold sparkle and broken wave crests across the surface.
    this.drawWaterRipples(g);

    // Slush and drift ice near the left bank.
    this.drawIce(g, this.shoreEdgeAt(24) + 6, 24, 15, 3);
    this.drawIce(g, this.shoreEdgeAt(92) + 9, 92, 9, 2);
    this.drawIce(g, this.shoreEdgeAt(158) + 5, 158, 12, 2.5);
    this.drawIce(g, this.shoreEdgeAt(222) + 10, 222, 17, 3);
    this.drawIce(g, this.shoreEdgeAt(262) + 6, 262, 10, 2);

    // A few floes cling to the far bank as well.
    this.drawIce(g, far - 8, 38, 10, 2.2);
    this.drawIce(g, far - 13, 128, 13, 2.6);
    this.drawIce(g, far - 7, 214, 8, 1.8);
    for (let i = 0; i < 26; i += 1) {
      const y = 16 + ((i * 41) % (VIEW.height - 28));
      const x = this.shoreEdgeAt(y) + 2 + ((i * 17) % 18);
      g.rect(x, y, 1, 1).fill({
        color: i % 3 === 0 ? WINTER.snow : WINTER.ice,
        alpha: 0.35,
      });
    }

    this.drawFarBank(g, far);
  }

  private addWaterRipples(): void {
    for (let i = 0; i < 30; i += 1) {
      this.ripples.push({
        x: randRange(SCENE.shoreX + 12, SCENE.farShoreX - 14),
        y: randRange(24, VIEW.height - 10),
        length: randRange(4, 22),
        bend: randRange(-2.2, 2.2),
        slope: randRange(-0.7, 0.7),
        alpha: randRange(0.03, 0.11),
        width: Math.random() > 0.82 ? 1.5 : 1,
        color:
          i % 4 === 0
            ? WINTER.snow
            : i % 3 === 0
              ? WINTER.snowLight
              : WINTER.ice,
      });
    }

    for (let i = 0; i < 4; i += 1) {
      this.ripples.push({
        x: randRange(SCENE.shoreX + 30, SCENE.farShoreX - 30),
        y: randRange(36, VIEW.height - 24),
        length: randRange(5, 9),
        bend: randRange(0.4, 1.2),
        slope: randRange(-0.4, 0.4),
        alpha: randRange(0.04, 0.08),
        width: 1,
        color: WINTER.snow,
      });
    }
  }

  private drawWaterRipples(g: Graphics): void {
    for (const ripple of this.ripples) {
      g.moveTo(ripple.x, ripple.y);
      g.quadraticCurveTo(
        ripple.x + ripple.length * 0.5,
        ripple.y + ripple.bend,
        ripple.x + ripple.length,
        ripple.y + ripple.slope,
      );
      g.stroke({
        width: ripple.width,
        color: ripple.color,
        alpha: ripple.alpha,
      });
      if (ripple.length > 14 && ripple.alpha > 0.065) {
        g.rect(
          ripple.x + ripple.length - 1,
          ripple.y + ripple.slope - 1,
          1,
          1,
        ).fill({
          color: WINTER.snowLight,
          alpha: Math.min(0.9, ripple.alpha * 1.3),
        });
      }
    }
  }

  private drawIce(
    g: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    g.ellipse(x, y, width, height).fill({
      color: WINTER.iceDeep,
      alpha: 0.3,
    });
    g.ellipse(x, y - 0.8, width * 0.92, height * 0.72).fill({
      color: WINTER.ice,
      alpha: 0.6,
    });
    g.ellipse(x - width * 0.16, y - 1.2, width * 0.42, height * 0.36).fill({
      color: WINTER.snowLight,
      alpha: 0.7,
    });
    g.rect(x - width * 0.35, y + height * 0.15, width * 0.7, 1).fill({
      color: WINTER.iceDeep,
      alpha: 0.45,
    });
  }

  private drawFarBank(g: Graphics, far: number): void {
    g.rect(far, 0, VIEW.width - far, VIEW.height).fill(WINTER.farShore);

    // Snowy rim on the water side, with a broken edge.
    for (let y = 0; y < VIEW.height; y += 14) {
      const depth = 5 + ((y * 7) % 4);
      g.rect(far - 2, y, depth, 14).fill({
        color: WINTER.farShoreSnow,
        alpha: 0.92,
      });
      g.poly([far - 3, y + 2, far + 2, y + 7, far - 3, y + 12]).fill({
        color: WINTER.snowShade,
        alpha: 0.9,
      });
    }

    // Snowy pines along the bank: dark triangles with white tips.
    for (let y = -4; y < VIEW.height; y += 17) {
      const top = y + ((y * 5) % 5);
      g.poly([far + 5, top, far + 18, top + 7, far + 5, top + 14]).fill({
        color: WINTER.treeDark,
        alpha: 0.95,
      });
      g.poly([far + 10, top + 3, far + 22, top + 9, far + 10, top + 15]).fill({
        color: 0x1b3438,
        alpha: 0.9,
      });
      g.rect(far + 8, top + 3, 4, 1).fill({
        color: WINTER.farShoreSnow,
        alpha: 0.8,
      });
      g.rect(far + 14, top + 6, 3, 1).fill({
        color: WINTER.farShoreSnow,
        alpha: 0.65,
      });
    }

    for (let y = 10; y < VIEW.height; y += 31) {
      g.rect(far + 2, y, 1, 1).fill({
        color: WINTER.ice,
        alpha: 0.5,
      });
    }
  }

  private drawShore(g: Graphics): void {
    const height = VIEW.height;

    // Snow field follows a soft, irregular bank instead of a straight edge.
    const snowPoly: number[] = [0, 0];
    for (let y = 0; y <= height; y += 2) {
      snowPoly.push(this.shoreEdgeAt(y), y);
    }
    snowPoly.push(0, height);
    g.poly(snowPoly).fill(WINTER.snowShade);

    const innerPoly: number[] = [0, 0];
    for (let y = 0; y <= height; y += 2) {
      innerPoly.push(this.shoreEdgeAt(y) - 6, y);
    }
    innerPoly.push(0, height);
    g.poly(innerPoly).fill(WINTER.snow);

    for (let y = 0; y < height; y += 29) {
      const driftX = this.shoreEdgeAt(y) - 18 - ((y * 11) % 13);
      g.ellipse(driftX, y + 8, 11, 3.5).fill({
        color: WINTER.snowShade,
        alpha: 0.5,
      });
      g.ellipse(driftX + 2, y + 6, 9, 2.5).fill({
        color: WINTER.snowLight,
        alpha: 0.75,
      });
    }

    for (let y = 12; y < height; y += 41) {
      const tuftX = this.shoreEdgeAt(y) - 18 - ((y * 5) % 9);
      g.rect(tuftX, y + 4, 1, 4).fill({ color: 0x7d6a4f, alpha: 0.65 });
      g.rect(tuftX + 3, y + 5, 1, 3).fill({ color: 0x8f7a58, alpha: 0.5 });
    }

    // Icy shelf follows the same wavy water line.
    const traceEdge = (offset: number): void => {
      g.moveTo(this.shoreEdgeAt(0) + offset, 0);
      for (let y = 2; y <= height; y += 2) {
        g.lineTo(this.shoreEdgeAt(y) + offset, y);
      }
    };
    traceEdge(0);
    g.stroke({ width: 9, color: WINTER.ice });
    traceEdge(-2);
    g.stroke({ width: 2, color: WINTER.snowLight, alpha: 0.75 });
    traceEdge(1);
    g.stroke({ width: 2, color: WINTER.iceDeep, alpha: 0.9 });
    traceEdge(0);
    g.stroke({ width: 1, color: 0x1b4a5e, alpha: 0.55 });

    for (let y = 0; y < height; y += 23) {
      const crackY = y + ((y * 3) % 9);
      const edge = this.shoreEdgeAt(crackY);
      g.moveTo(edge - 8, crackY)
        .lineTo(edge - 4, crackY + 4)
        .lineTo(edge - 5, crackY + 8)
        .stroke({ width: 1, color: WINTER.snow, alpha: 0.55 });
    }

    // A handful of sparkles so the snow does not read as flat paper.
    for (let i = 0; i < 30; i += 1) {
      const sx = 4 + ((i * 23) % 40);
      const sy = 6 + ((i * 37) % (height - 12));
      if ((sx + sy) % 4 === 0) {
        g.rect(sx, sy, 1, 1).fill({
          color: WINTER.snowLight,
          alpha: 0.9,
        });
      }
    }
  }

  private drawDock(): void {
    const g = new Graphics();
    const x = SCENE.dockX;
    const y = SCENE.dockY;
    const width = SCENE.dockWidth;
    const height = SCENE.dockBottom - y;

    // Horizontal walkway: cold shadow, deck and darker side edges.
    g.rect(x + 5, y + 5, width, height).fill({
      color: 0x0a2030,
      alpha: 0.4,
    });
    g.rect(x, y, width, height).fill(C.brown);
    g.rect(x, y, width, 3).fill(C.brownLight);
    g.rect(x, y, 2, height).fill(C.brownDark);
    g.rect(x + width - 2, y, 2, height).fill(C.brownDark);
    g.rect(x + 2, y + height - 2, width - 4, 2).fill({
      color: C.brownDark,
      alpha: 0.75,
    });

    // Cross-planks run vertically along the length of the pier.
    for (let px = x + 7; px < x + width - 2; px += 9) {
      g.rect(px, y + 2, 1, height - 4).fill({
        color: C.brownDark,
        alpha: 0.7,
      });
      g.rect(px + 2, y + 6 + ((px * 7) % 14), 1, 2).fill({
        color: C.brownDark,
        alpha: 0.4,
      });
    }

    // Snow settled on the planks and posts.
    g.rect(x + 2, y + 2, width - 4, 2).fill({
      color: WINTER.snow,
      alpha: 0.6,
    });
    for (let px = x + 4; px < x + width - 6; px += 13) {
      const patch = 4 + ((px * 7) % 5);
      g.rect(px, y + 3, patch, 2).fill({
        color: WINTER.snowLight,
        alpha: 0.75,
      });
      g.rect(px, y + height - 4, patch - 1, 1).fill({
        color: WINTER.snow,
        alpha: 0.45,
      });
    }
    g.ellipse(x + width - 10, y + 5, 9, 3).fill({
      color: WINTER.snowLight,
      alpha: 0.85,
    });

    // Support posts on the water and shore sides, with snow caps.
    for (let px = x + 10; px < x + width - 6; px += 30) {
      g.rect(px, y - 3, 9, 4).fill(C.brownDark);
      g.rect(px, y + height - 1, 9, 4).fill(C.brownDark);
      g.rect(px, y - 3, 9, 2).fill(C.brownLight);
      g.rect(px, y + height - 1, 9, 2).fill(C.brownLight);
      g.rect(px, y - 4, 9, 2).fill({
        color: WINTER.snow,
        alpha: 0.9,
      });
      g.rect(px, y + height + 2, 9, 1).fill({
        color: WINTER.snowShade,
        alpha: 0.7,
      });
    }

    this.addChild(g);
  }

  private drawSnowMound(
    g: Graphics,
    x: number,
    y: number,
    scale: number,
  ): void {
    g.ellipse(x, y + 1, 12 * scale, 3 * scale).fill({
      color: WINTER.snowShade,
      alpha: 0.85,
    });
    g.ellipse(x, y, 9 * scale, 2 * scale).fill({
      color: WINTER.snowLight,
      alpha: 0.95,
    });
  }

  private addScenery(): void {
    const treeTextures = this.assets.trees;
    const bushTextures = this.assets.bushes;
    const rockTextures = this.assets.rocks;

    const addMound = (item: ScenerySpot, scale: number): void => {
      const mound = new Graphics();
      this.drawSnowMound(mound, item.x, item.y, scale);
      mound.zIndex = item.y - 0.2;
      this.props.addChild(mound);
    };

    const treeSpots: ScenerySpot[] = [
      { x: 29, y: 78, scale: 1.1, flip: false },
      { x: 26, y: 172, scale: 0.95, flip: true },
      { x: 32, y: 266, scale: 1.15, flip: false },
      { x: 46, y: 58, scale: 0.85, flip: true },
    ];
    treeSpots.forEach((item, index) => {
      addMound(item, item.scale);
      const texture = treeTextures[index % treeTextures.length];
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(item.x, item.y);
      sprite.scale.set(item.flip ? -item.scale : item.scale, item.scale);
      sprite.zIndex = item.y;
      this.props.addChild(sprite);
    });

    const bushSpots: ScenerySpot[] = [
      { x: 10, y: 108, scale: 1.1 },
      { x: 40, y: 116, scale: 0.8 },
      { x: 18, y: 214, scale: 1.1 },
      { x: 46, y: 230, scale: 0.9 },
    ];
    bushSpots.forEach((item, index) => {
      addMound(item, item.scale * 0.7);
      const texture = bushTextures[index % bushTextures.length];
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(item.x, item.y);
      sprite.scale.set(item.scale);
      sprite.zIndex = item.y;
      this.props.addChild(sprite);
    });

    const rockSpots: ScenerySpot[] = [
      { x: 36, y: 198, scale: 1 },
      { x: 24, y: 62, scale: 0.9 },
      { x: 48, y: 248, scale: 0.8 },
    ];
    rockSpots.forEach((item, index) => {
      addMound(item, item.scale * 0.6);
      const texture = rockTextures[index % rockTextures.length];
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(item.x, item.y);
      sprite.scale.set(item.scale);
      sprite.zIndex = item.y;
      this.props.addChild(sprite);
    });

    const shadow = new Graphics();
    this.drawAnglerShadow(shadow);
    shadow.zIndex = SCENE.anglerY - 0.2;
    this.props.addChild(shadow);

    this.lanternGlow.zIndex = this.lanternPos.y - 0.3;
    this.lanternGlow.blendMode = "add";
    this.props.addChild(this.lanternGlow);

    const lanternBody = new Graphics();
    this.drawLanternBody(lanternBody);
    lanternBody.zIndex = this.lanternPos.y;
    this.props.addChild(lanternBody);

    this.lanternFlame.zIndex = this.lanternPos.y + 0.1;
    this.lanternFlame.blendMode = "add";
    this.props.addChild(this.lanternFlame);

    this.angler.zIndex = SCENE.anglerY;
    this.props.addChild(this.angler);

    // A small water bucket sits at the angler's left on the dock.
    const bucketShadow = new Graphics();
    bucketShadow.ellipse(134, 147, 6, 2).fill({
      color: 0x0a1c2a,
      alpha: 0.3,
    });
    bucketShadow.zIndex = 147.6;
    this.props.addChild(bucketShadow);

    const bucket = new Sprite(this.assets.bucket);
    bucket.anchor.set(0.5, 1);
    bucket.position.set(134, 148);
    bucket.zIndex = 148;
    this.props.addChild(bucket);

    // Props sit above the water and dock, but below the line, float and HUD.
    this.addChildAt(this.props, this.getChildIndex(this.line));
    this.drawLantern();
  }

  private drawAnglerShadow(g: Graphics): void {
    // The 32×32 sheet has about 7 px of transparent padding under the boots;
    // the shadow belongs on that visible foot row, not on the sprite anchor.
    const x = SCENE.anglerX - 1;
    const y = SCENE.anglerY - 6;
    g.ellipse(x, y, 9, 3).fill({ color: 0x0a1c2a, alpha: 0.32 });
    g.ellipse(x, y, 5, 1.8).fill({ color: 0x0a1c2a, alpha: 0.35 });
  }

  private drawLanternBody(g: Graphics): void {
    const x = this.lanternPos.x;
    const y = this.lanternPos.y;
    g.ellipse(x - 2, y + 1, 6, 2.5).fill({
      color: WINTER.snowShade,
      alpha: 0.8,
    });
    g.rect(x - 1, y - 8, 2, 8).fill(C.brownDark);
    g.rect(x - 1, y - 8, 1, 8).fill(C.brownLight);
    g.rect(x - 4, y - 11, 8, 2).fill(C.ink);
    g.rect(x - 3, y - 12, 6, 1).fill(WINTER.snow);
    g.rect(x - 3, y - 9, 6, 5).fill({ color: C.ink, alpha: 0.92 });
    g.rect(x - 2, y - 8, 4, 3).fill({ color: 0x34321f, alpha: 0.95 });
    g.rect(x - 3, y - 4, 6, 1).fill(C.brownDark);
  }

  /** Warm light and flame; the unlit prop is drawn by `drawLanternBody`. */
  private drawLantern(): void {
    const glow = this.lanternGlow;
    const flame = this.lanternFlame;
    glow.clear();
    flame.clear();

    const level = this.lanternLevel;
    if (level <= 0.02) return;

    const flicker =
      0.9 +
      Math.sin(this.time * 9.3) * 0.06 +
      Math.sin(this.time * 23.1) * 0.04;
    const alpha = level * flicker;
    const x = this.lanternPos.x;
    const y = this.lanternPos.y - 7;

    glow.circle(x, y, 28).fill({ color: 0xffb347, alpha: 0.045 * alpha });
    glow.circle(x, y, 24).fill({ color: 0xffc06a, alpha: 0.05 * alpha });
    glow.circle(x, y, 20).fill({ color: 0xffc76b, alpha: 0.055 * alpha });
    glow.circle(x, y, 16).fill({ color: 0xffd07c, alpha: 0.065 * alpha });
    glow.circle(x, y, 12).fill({ color: 0xffdd9a, alpha: 0.08 * alpha });
    glow.circle(x, y, 8).fill({ color: 0xffe3a8, alpha: 0.1 * alpha });
    glow.ellipse(x + 3, this.lanternPos.y + 2, 10, 3).fill({
      color: 0xffb347,
      alpha: 0.09 * alpha,
    });

    flame.rect(x - 2, y + 1, 4, 3).fill({
      color: 0xffd166,
      alpha: 0.85 * alpha,
    });
    flame.rect(x - 1, y, 2, 2).fill({
      color: 0xffef9a,
      alpha: 1 * alpha,
    });
    flame.rect(x - 1, y + 2, 1, 1).fill({
      color: 0xffffff,
      alpha: 0.9 * alpha,
    });
  }

  /** 0 = off, 1 = night-bright; smooth so dusk and dawn look gradual. */
  setLantern(level: number): void {
    const t = clamp((level - 0.08) / 0.52);
    this.lanternLevel = t * t * (3 - 2 * t);
  }

  /** 0..1 escape pressure, shown by the sinking float and taut line. */
  setEscapeMeter(value: number): void {
    this.escapeMeter = clamp(value);
  }

  private addWaterMarks(): void {
    // Surface ripples are drawn procedurally: the old sprite-sheet tiles had
    // opaque blue backgrounds and read as square patches on the lake.
    for (let i = 0; i < 14; i += 1) {
      this.waterMarks.push({
        x: randRange(SCENE.shoreX + 24, SCENE.farShoreX - 24),
        y: randRange(30, VIEW.height - 14),
        radius: randRange(5, 13),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.45, 1.15),
        alpha: randRange(0.05, 0.12),
      });
    }

    for (let i = 0; i < 2; i += 1) {
      this.whirls.push({
        x: randRange(SCENE.shoreX + 36, SCENE.farShoreX - 36),
        y: randRange(60, 210),
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
      sprite.alpha = 0.08;
      sprite.tint = 0x0d4a66;
      sprite.scale.set(randRange(0.62, 0.95));
      const direction = Math.random() > 0.5 ? 1 : -1;
      sprite.scale.x = Math.abs(sprite.scale.x) * direction;
      sprite.position.set(
        randRange(SCENE.shoreX + 30, SCENE.farShoreX - 30),
        randRange(40, 230),
      );
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
    if (x <= this.shoreEdgeAt(y)) return false;
    if (x >= SCENE.farShoreX) return false;
    if (
      x >= SCENE.dockX &&
      x <= SCENE.dockX + SCENE.dockWidth &&
      y >= SCENE.dockY &&
      y <= SCENE.dockBottom
    ) {
      return false;
    }
    return true;
  }

  playCast(power: number): void {
    this.previewG.clear();
    this.pulling = false;
    this.castPower = clamp(power);
    const targetX = clamp(
      lerp(SCENE.bobberMinX, SCENE.bobberMaxX, this.castPower) +
        randRange(-6, 6),
      SCENE.shoreX + 40,
      SCENE.farShoreX - 20,
    );
    const spread = 18 + this.castPower * 22;
    const targetY = clamp(
      SCENE.anglerY + randRange(-spread, spread),
      44,
      VIEW.height - 28,
    );

    this.bobberBaseX = targetX;
    this.bobberBaseY = targetY;
    this.bobber.position.set(this.rodTip.x - 1, this.rodTip.y - 2);
    this.bobber.visible = true;
    this.bobberWash.visible = false;
    this.bobber.alpha = 1;
    this.biteMark.visible = false;
    this.phase = "flying";
    this.castT = 0;
    this.setAngler([12, 13, 14, 15], 11);
    this.spawnSplash(this.rodTip.x, this.rodTip.y, 6, 0.6);
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
    this.pulling = false;
    this.biteMark.visible = false;
    this.fightBobberX = this.bobberBaseX;
    this.fightBobberY = this.bobberBaseY;
    this.fightTargetX = this.bobberBaseX;
    this.fightTargetY = this.bobberBaseY;
    this.fightDirX = 0;
    this.fightDirY = 1;
    this.setAngler([13], 8);
    this.hookJerk = 0.22;
    this.spawnHookBurst();
  }

  /** Holding LMB: wind-up before a cast or a pull during the fight. */
  setPulling(pulling: boolean): void {
    if (this.pulling === pulling) return;
    this.pulling = pulling;

    if (pulling) {
      if (this.phase === "idle" || this.phase === "fight") {
        this.setAngler([14, 15], 9);
      }
      return;
    }

    if (this.phase === "idle") this.setAngler([12], 8);
    else if (this.phase === "fight") this.setAngler([13], 8);
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

  catchFish(texture: Texture, scale = 1.15): void {
    this.phase = "result";
    this.pulling = false;
    this.biteMark.visible = false;
    this.clearHeldFish();
    const fromX = this.bobber.x;
    const fromY = this.bobber.y;
    this.spawnSplash(fromX, fromY, 18, 1.1);

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.scale.set(scale);
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
      scale,
    });

    this.setAngler([15], 6);
    this.bobber.visible = false;
  }

  escapeFish(): void {
    this.phase = "result";
    this.pulling = false;
    this.biteMark.visible = false;
    this.spawnSplash(this.bobber.x, this.bobber.y, 10, 0.9);
    this.bobber.visible = false;
    this.setAngler([12], 8);
  }

  resetCast(): void {
    this.phase = "idle";
    this.pulling = false;
    this.previewG.clear();
    this.biteMark.visible = false;
    this.bobber.visible = false;
    this.line.clear();
    this.setAngler([12], 8);
    this.castT = 0;
    this.nibbleTime = 0;
    this.bobberRipple.clear();
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

  private setAngler(frames: number[], fps: number): void {
    this.anglerFrames = frames;
    this.anglerFps = fps;
    this.anglerTimer = 0;
    this.angler.texture =
      this.assets.angler[frames[0]] ?? this.assets.angler[12] ?? Texture.WHITE;
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
        color: Math.random() > 0.5 ? C.cyan : WINTER.ice,
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
    colors: [number, number] = [WINTER.snow, WINTER.ice],
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
    this.drawLantern();
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
        this.assets.angler[12] ??
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
        color: WINTER.ice,
        alpha: mark.alpha * (0.4 + pulse * 0.6),
      });
      if (pulse > 0.72) {
        g.rect(mark.x - 1, mark.y - radius * 0.38 - 2, 2, 1).fill({
          color: WINTER.snow,
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
          color: WINTER.snow,
          alpha: whirl.alpha,
        });
      }
    }
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
        this.setAngler([13], 8);
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
      this.bobberBody.y = 0;
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
      this.bobberBody.y = tension * 4 - jerk * 0.8;
      this.bobberBody.rotation = Math.sin(this.time * 6) * 0.16;
      if (Math.random() < dt * 2) {
        this.spawnSplash(this.fightBobberX, this.fightBobberY, 1, 0.35);
      }
    } else {
      this.bobberBody.y = 0;
    }

    // Line + bite marker. A high escape meter straightens and stiffens the
    // line; the float itself is being dragged under.
    this.line.clear();
    if (this.bobber.visible) {
      const rodX = this.rodTip.x;
      const rodY = this.rodTip.y;
      const bx = this.bobber.x;
      const by = this.bobber.y - 5;
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
      const bounce = Math.abs(Math.sin(this.time * 6)) * 5;
      this.biteMark.position.set(this.bobber.x + 2, this.bobber.y - 8 - bounce);
    }

    // Bobber ripple.
    this.bobberRipple.clear();
    this.bobberWash.visible =
      this.phase === "waiting" ||
      this.phase === "bite" ||
      this.phase === "fight";
    if (this.phase === "waiting" || this.phase === "bite") {
      const pulse = (Math.sin(this.time * 2.4) + 1) / 2;
      this.bobberRipple
        .ellipse(0, 0, 6 + pulse * 3, 2.2 + pulse * 1.2)
        .stroke({ width: 1, color: WINTER.ice, alpha: 0.3 + pulse * 0.2 });
    } else if (this.phase === "fight") {
      const pulse = (Math.sin(this.time * 6) + 1) / 2;
      const radius = 6 + tension * 6 + pulse * 1.5;
      this.bobberRipple.ellipse(0, 0, radius, radius * 0.35).stroke({
        width: 1,
        color: WINTER.ice,
        alpha: 0.18 + tension * 0.35,
      });
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
        .stroke({ width: 1, color: WINTER.snow, alpha: (1 - t) * 0.7 });
      return true;
    });
  }

  private updateJumps(dt: number): void {
    this.jumps = this.jumps.filter((jump) => {
      jump.t += dt / jump.duration;
      if (jump.t >= 1) {
        if (jump.hold) {
          jump.sprite.position.set(CAUGHT_FISH_X, CAUGHT_FISH_Y);
          jump.sprite.scale.set(jump.scale);
          jump.sprite.rotation = 0;
          jump.sprite.alpha = 1;
          this.heldFish = jump.sprite;
          this.heldFishTime = 0;
          this.spawnSplash(SCENE.anglerX, SCENE.anglerY - 30, 4, 0.35);
        } else {
          jump.sprite.destroy();
        }
        return false;
      }
      const t = jump.t;
      const arc = Math.sin(Math.PI * Math.min(1, t));
      jump.sprite.x = lerp(jump.fromX, CAUGHT_FISH_X, t);
      jump.sprite.y = lerp(jump.fromY, CAUGHT_FISH_Y, t) - arc * 46;
      jump.sprite.rotation = Math.sin(t * Math.PI * 3) * 0.25 + jump.spin * t;
      jump.sprite.alpha = jump.hold ? 1 : t > 0.85 ? (1 - t) / 0.15 : 1;
      return true;
    });
  }

  private updateHeldFish(dt: number): void {
    if (!this.heldFish) return;
    this.heldFishTime += dt;
    this.heldFish.x = CAUGHT_FISH_X + Math.sin(this.heldFishTime * 1.7) * 1.2;
    this.heldFish.y = CAUGHT_FISH_Y + Math.sin(this.heldFishTime * 3.4) * 2;
    this.heldFish.rotation = Math.sin(this.heldFishTime * 2.2) * 0.06;
  }
}
