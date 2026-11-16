import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { AssetBag } from "../../../assets";
import type { AreaDef, AreaPalette, SceneLayout } from "../../../areas";
import { C } from "../../../config";
import { TEXT } from "../../../texts";
import { makeText } from "../../../ui/theme";
import { CloudShadows } from "../cloudShadow";
import type { SceneRenderer } from "../types";
import {
  ANGLER_POSES,
  type AnglerPose,
  type Jump,
  type Particle,
  type Ring,
  type ScenePhase,
} from "./setup";

export abstract class FishingSceneCore extends Container {
  readonly area: AreaDef;
  readonly layout: SceneLayout;

  protected readonly assets: AssetBag;
  protected readonly renderer: SceneRenderer;
  protected readonly palette: AreaPalette;

  protected readonly angler = new Sprite();
  protected readonly previewG = new Graphics();
  protected readonly line = new Graphics();
  protected readonly bobber = new Container();
  protected readonly bobberBody = new Graphics();
  protected readonly bobberWash = new Graphics();
  protected readonly bobberRipple = new Graphics();
  protected readonly bobberClip = new Graphics();
  protected readonly staminaArc = new Graphics();
  protected readonly motionG = new Graphics();
  /** Cloud shade, above the props: a cloud is over the bank, the boat and the water. */
  protected readonly clouds = new Graphics();
  protected readonly cloudShadows: CloudShadows;
  protected readonly particlesG = new Graphics();
  protected readonly ringsG = new Graphics();
  protected readonly props = new Container();
  /** Trunks in the water; the area renderer rocks them in `animate`. */
  protected readonly floating = new Container();
  protected readonly lightGlow = new Graphics();
  protected readonly lightFlame = new Graphics();
  protected readonly biteMark: Text;

  protected readonly fishShadows: {
    sprite: Sprite;
    speed: number;
    baseY: number;
    phase: number;
  }[] = [];

  /** Rod tip of the lowered waiting pose, per view. */
  protected readonly rodTip: { x: number; y: number };
  protected readonly frames: AnglerPose;
  protected lanternLevel = 0;
  protected escapeMeter = 0;

  protected particles: Particle[] = [];
  protected rings: Ring[] = [];
  protected jumps: Jump[] = [];
  protected heldFish: Sprite | null = null;
  protected heldFishTime = 0;
  /** Where the landed fish is held; `top` is its upper edge. */
  protected catchSpot = { x: 0, y: 0, top: 0 };
  protected time = 0;
  /** Target overcast level, 0..1, set from the area's weather front. */
  protected cloudTarget = 0;
  /** Smoothed overcast level: cloud shadows crawl in with the front. */
  protected cloudiness = 0;

  protected phase: ScenePhase = "idle";
  protected castT = 0;
  protected castPower = 0;
  protected bobberBaseX: number;
  protected bobberBaseY: number;
  protected anglerTimer = 0;
  protected anglerFrames: readonly number[] = [12];
  protected anglerFps = 10;
  protected pulling = false;

  protected nibbleTime = 0;
  /** Where the float body is heading behind the waterline mask, in pixels. */
  protected sinkTarget = 0;

  protected fightBobberX: number;
  protected fightBobberY: number;
  protected fightTargetX: number;
  protected fightTargetY: number;
  protected fightDirX = 1;
  protected fightDirY = 0;
  protected hookJerk = 0;

  /** Called when a cast bobber hits the water. */
  onCastLanded?: () => void;

  constructor(assets: AssetBag, area: AreaDef, renderer: SceneRenderer) {
    super();
    this.assets = assets;
    this.area = area;
    this.renderer = renderer;
    this.layout = area.layout;
    this.palette = area.palette;
    this.cloudShadows = new CloudShadows(this.palette);

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
    // Above the scenery and the angler: cloud shade falls on everything on the
    // land and the water, so it must not be cut by the props' silhouettes.
    this.addChild(this.clouds);

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
    this.staminaArc.visible = false;
    this.bobber.addChild(this.staminaArc);

    this.bobber.visible = false;
    // Float first, line second: the line is the thing tying the rod to the
    // float, so it has to reach the top of the float instead of vanishing under
    // its body at the waterline.
    this.addChild(this.bobber, this.line);

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

  protected abstract addAnglerShadow(): void;
  protected abstract addLightLayers(): void;
  protected abstract addAmbientFish(): void;
  protected abstract setAngler(frames: readonly number[], fps: number): void;
  protected abstract placeBiteMark(bounce: number): void;
}
