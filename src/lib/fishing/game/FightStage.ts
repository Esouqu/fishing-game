import type { Container } from "pixi.js";
import type { Game } from "../Game";
import type { FishSpecies } from "../config";
import type { FishingScene } from "./scenes/FishingScene";
import type { JuiceFx } from "./JuiceFx";
import { Minigame, type MinigameResult } from "./Minigame";
import type { FightFocus } from "./FightFocus";

export interface FightStageDeps {
  game: Game;
  scene: FishingScene;
  juice: JuiceFx;
  /** Layer that hosts the minigame view. */
  fightLayer: Container;
  /** Layer that lifts the float above the fight. */
  bobberLayer: Container;
  /**
   * Layer that hosts the stamina bars. It sits above the weather, so the bars
   * stay readable in fog while the ring and the fish are dimmed with the water.
   */
  barsLayer: Container;
  focus: FightFocus;
}

/** One frame of fight input, already normalized by the round flow. */
export interface FightInput {
  pointerX: number;
  pointerY: number;
  /** Normalized keyboard pull direction; zero when no key is held. */
  directionX: number;
  directionY: number;
  held: boolean;
}

/** Repeat period of the quiet "still landable" reminder, in seconds. */
const LAND_TICK = 1.15;

/**
 * The live fight: owns the {@link Minigame} view for one hooked fish and keeps
 * the scene, float, vignette and reel sound in sync with it. The round flow
 * decides when a fight starts, receives its result and disposes of it.
 */
export class FightStage {
  private readonly game: Game;
  private readonly scene: FishingScene;
  private readonly juice: JuiceFx;
  private readonly fightLayer: Container;
  private readonly bobberLayer: Container;
  private readonly barsLayer: Container;
  private readonly focus: FightFocus;

  private minigame: Minigame | null = null;
  private landTickTimer = LAND_TICK;

  onFinish?: (result: MinigameResult) => void;

  constructor(deps: FightStageDeps) {
    this.game = deps.game;
    this.scene = deps.scene;
    this.juice = deps.juice;
    this.fightLayer = deps.fightLayer;
    this.bobberLayer = deps.bobberLayer;
    this.barsLayer = deps.barsLayer;
    this.focus = deps.focus;
  }

  /** Touch landing target while the fish is tired. */
  get landingTarget(): { x: number; y: number } | null {
    return this.minigame?.landingTarget ?? null;
  }

  /**
   * Centre of the fight zone in scene coordinates, or `null` when no fight is
   * live. The round flow anchors its "escaped" caption here: the loss happened
   * in the ring, so the caption belongs to the ring, not to the angler.
   */
  get ringCentre(): { x: number; y: number } | null {
    return this.minigame?.ringCenter ?? null;
  }

  start(
    fish: FishSpecies,
    weightKg: number,
    pointerX: number,
    pointerY: number,
    held: boolean,
  ): void {
    this.scene.setFight();
    const castPoint = this.scene.castPoint;
    this.juice.trigger("hook", castPoint.x, castPoint.y);
    this.game.audio.hook();
    // A fight can start while the previous reel loop is still fading out.
    this.game.audio.stopReel();

    const minigame = new Minigame(fish, this.game.assets.fish[fish.id], {
      anchor: castPoint,
      // The weight rolled for this catch drives how hard it pulls back.
      weightKg,
      onWarn: () => this.game.audio.warn(),
      onCounter: () => {
        this.game.audio.counter();
        const point = this.scene.bobberPosition;
        this.juice.trigger("counter", point.x, point.y);
      },
      onReady: () => {
        this.game.audio.landReady();
        const point = this.scene.bobberPosition;
        this.juice.trigger("ready", point.x, point.y);
      },
      onResist: () => this.game.audio.resist(),
      onGripOut: () => this.game.audio.gripOut(),
    });

    this.fightLayer.addChild(minigame);
    // The stamina stack lives above the weather, not inside the fight layer.
    this.barsLayer.addChild(minigame.bars);
    this.bobberLayer.addChild(this.scene.bobberView);
    const ring = minigame.ringCenter;
    this.focus.focusAt(ring.x, ring.y);
    minigame.onFinish = (result) => this.onFinish?.(result);
    minigame.setHold(held);
    minigame.setPointer(pointerX, pointerY);
    this.scene.setFightFish(
      minigame.fishPoint.x,
      minigame.fishPoint.y,
      minigame.fishVelocity.x,
      minigame.fishVelocity.y,
    );
    this.scene.setEscapeMeter(0);
    this.minigame = minigame;
    this.landTickTimer = LAND_TICK;
  }

  update(dt: number, input: FightInput): void {
    const minigame = this.minigame;
    if (!minigame) return;

    this.scene.setPulling(input.held);
    minigame.setPointer(input.pointerX, input.pointerY);
    minigame.setDirection(input.directionX, input.directionY);
    minigame.setHold(input.held);
    minigame.update(dt);

    const point = minigame.fishPoint;
    const velocity = minigame.fishVelocity;
    this.scene.setFightFish(
      point.x,
      point.y,
      velocity.x,
      velocity.y,
      minigame.isSteering,
    );
    this.scene.setEscapeMeter(minigame.escapeMeter);

    // The reel is a sustain: it loops for as long as the player holds the
    // line, and fades out the moment they let go.
    if (minigame.isSteering) this.game.audio.startReel();
    else this.game.audio.stopReel();

    // While the fish stays landable the cue gets a quiet tick, so a player who
    // missed the opening chime still hears that RMB/F keeps working.
    if (minigame.canLand) {
      this.landTickTimer -= dt;
      if (this.landTickTimer <= 0) {
        this.landTickTimer = LAND_TICK;
        this.game.audio.landTick();
      }
    } else {
      this.landTickTimer = LAND_TICK;
    }
  }

  /** Final pull: RMB/F, or a tap on the fish on touch. */
  finalPull(): void {
    this.minigame?.finalPull();
  }

  /** Hold to pull; release to rest. */
  setHold(held: boolean): void {
    this.minigame?.setHold(held);
  }

  /** The round is decided: hide the fight view but keep it until the reset. */
  settle(): void {
    if (!this.minigame) return;
    this.game.audio.stopReel();
    this.minigame.visible = false;
    this.minigame.bars.visible = false;
    this.minigame.setHold(false);
  }

  /** Drop the fight view entirely; the next cast builds a fresh one. */
  dispose(): void {
    this.game.audio.stopReel();
    if (!this.minigame) return;
    this.fightLayer.removeChild(this.minigame);
    // The bars are parented outside the minigame, so they are torn down here
    // rather than by the minigame's own `destroy`.
    this.barsLayer.removeChild(this.minigame.bars);
    this.minigame.bars.destroy({ children: true });
    this.minigame.destroy({ children: true });
    this.minigame = null;
  }
}
