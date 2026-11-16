import { TIMING, VIEW } from "../../config";
import { clamp } from "../../utils";
import { FightStage } from "../FightStage";
import type { FightFocus } from "../FightFocus";
import type { FloaterLayer } from "../../ui/FloaterLayer";
import type { FishingScene } from "../scenes/FishingScene";
import type { JuiceFx } from "../JuiceFx";
import type { GameContext } from "../../GameContext";
import type { AreaDef } from "../../areas";
import type { FishSpecies } from "../../config";
import type { MinigameResult } from "../fight";
import { type CastFlowDeps, type CastPhase, type PullKey } from "./setup";

export abstract class CastFlowCore {
  protected abstract resolveFight(result: MinigameResult): void;
  protected abstract earlyHook(): void;
  protected abstract hookFish(): void;
  protected abstract doCast(): void;

  protected readonly game: GameContext;
  protected readonly area: AreaDef;
  protected readonly scene: FishingScene;
  protected readonly juice: JuiceFx;
  protected readonly floaters: FloaterLayer;
  protected readonly focus: FightFocus;
  protected readonly fight: FightStage;

  protected phaseValue: CastPhase = "idle";
  protected chargeValue = 0;
  protected chargeDir = 1;
  protected waitTimer = 0;
  protected biteTimer = 0;
  protected biteWindow = 1;
  protected resolveTimer = 0;
  protected catchShown = false;
  protected pressed = false;
  protected paused = false;
  protected chargeSoundTimer = 0;
  protected nibblePlayed = false;
  protected nibbleLead: number = TIMING.nibbleLeadMax;

  protected fish: FishSpecies | null = null;
  protected fishWeightKg = 0;
  protected pointerX = VIEW.width / 2;
  protected pointerY = VIEW.height / 2;
  /** Re-rolled every cast; landing inside it boosts rare fish. */
  protected luckBandCenterValue = 0.75;
  protected luckZoneHit = false;
  /** Time spent charging; used for the late-release buffer. */
  protected chargeTime = 0;
  /** Last moment the charge was inside the zone, in `chargeTime` units. */
  protected lastZoneInside = -Infinity;
  /** Whether the previous charging frame was inside the zone, for the tick. */
  protected wasInsideZone = false;

  protected tapLanding = false;
  protected tapIconX = 0;
  protected tapIconY = 0;
  protected readonly pullKeys = new Set<PullKey>();

  constructor(deps: CastFlowDeps) {
    this.game = deps.game;
    this.area = deps.area;
    this.scene = deps.scene;
    this.juice = deps.juice;
    this.floaters = deps.floaters;
    this.focus = deps.focus;
    this.fight = new FightStage({
      game: deps.game,
      scene: deps.scene,
      juice: deps.juice,
      fightLayer: deps.fightLayer,
      bobberLayer: deps.bobberLayer,
      barsLayer: deps.barsLayer,
      floaters: deps.floaters,
      focus: deps.focus,
    });
    this.fight.onFinish = (result) => this.resolveFight(result);

    this.scene.onCastLanded = () => {
      this.game.audio.plop();
      if (this.luckZoneHit) this.scene.celebrateLuck();
      const point = this.scene.castPoint;
      this.juice.trigger("cast", point.x, point.y);
    };
  }

  // -------------------------------------------------------------- public API

  get phase(): CastPhase {
    return this.phaseValue;
  }

  /** 0..1 cast power while charging. */
  get charge(): number {
    return this.chargeValue;
  }

  /** Centre of the luck zone on the power bar, 0..1. */
  get luckBandCenter(): number {
    return this.luckBandCenterValue;
  }

  /**
   * Alpha of the "ready to cast" prompt. It sits at 1 while idle, fades in
   * over the dissolving catch at the tail of a successful round, and is 0
   * otherwise.
   */
  get castPromptAlpha(): number {
    if (this.paused) return 0;
    if (this.phaseValue === "idle") return 1;
    if (this.phaseValue !== "resolve" || !this.catchShown) return 0;
    return clamp(1 - this.resolveTimer / TIMING.catchCrossfade, 0, 1);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) return;
    this.game.audio.stopReel();
    this.game.audio.stopCharge();
    this.pressed = false;
    this.scene.setPulling(false);
    this.pullKeys.clear();
    this.fight.setHold(false);
    // The charge and the cast are reaction windows, so freezing them under a
    // pause menu let the player line up the luck zone and the bite for free.
    // Only the fight is allowed to stay paused; it is continuous, not a
    // one-frame cue.
    if (
      this.phaseValue === "charging" ||
      this.phaseValue === "waiting" ||
      this.phaseValue === "bite"
    ) {
      this.cancelCastOnPause();
    }
  }

  /** Drops the in-flight charge/cast and returns the round to idle. */
  protected cancelCastOnPause(): void {
    this.phaseValue = "idle";
    this.chargeValue = 0;
    this.chargeDir = 1;
    this.chargeSoundTimer = 0;
    this.chargeTime = 0;
    this.lastZoneInside = -Infinity;
    this.wasInsideZone = false;
    this.luckZoneHit = false;
    this.nibblePlayed = false;
    this.waitTimer = 0;
    this.biteTimer = 0;
    this.pressed = false;
    this.tapLanding = false;
    this.catchShown = false;
    this.fish = null;
    this.fishWeightKg = 0;
    this.pullKeys.clear();
    this.scene.setPulling(false);
    this.scene.resetCast();
  }
}
