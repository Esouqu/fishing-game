import type { Container } from "pixi.js";
import type { Game } from "../Game";
import type { AreaDef } from "../areas";
import {
  LUCK_BAND,
  LUCK_RELEASE_BUFFER,
  PASS_BY_CHANCE,
  SPOOK_HOLD,
  TIMING,
  VIEW,
  type FishSpecies,
} from "../config";
import { TEXT } from "../texts";
import { chance, clamp, randRange } from "../utils";
import { formatWeight, rollFishWeight, weightScale } from "../fishWeight";
import { UI } from "../ui/palette";
import { pickCastFish } from "./castPick";
import type { FishingScene } from "./scenes/FishingScene";
import type { JuiceFx } from "./JuiceFx";
import type { MinigameResult } from "./fightModel";
import { FightStage } from "./FightStage";
import type { FightFocus } from "./FightFocus";
import type { FloaterLayer } from "../ui/FloaterLayer";

export type CastPhase =
  "idle" | "charging" | "waiting" | "bite" | "fighting" | "resolve";

const PULL_KEYS = {
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
} as const;

type PullKey = keyof typeof PULL_KEYS;

const PRIMARY_KEYS = new Set(["Space", "Enter", "NumpadEnter", "ArrowUp"]);

/** Gap between the top edge of the landed fish and its name tag. */
const CATCH_LABEL_GAP = 3;

/**
 * Camera knock of the hook strike, by rarity.
 *
 * The take of the bait is the reference knock (1). The strike that sets the
 * hook is the moment the weight on the other end answers, so it scales with
 * what was hooked: a common fish barely moves the frame, a legendary one
 * rattles it, and the player can feel what they are fighting before the fight
 * screen has drawn anything.
 */
const HOOK_SHAKE: Record<FishSpecies["tier"], number> = {
  common: 0.7,
  rare: 1.15,
  legendary: 1.8,
};

export interface CastFlowDeps {
  game: Game;
  area: AreaDef;
  scene: FishingScene;
  juice: JuiceFx;
  floaters: FloaterLayer;
  /** Layer that hosts the fight minigame. */
  fightLayer: Container;
  /** Layer that lifts the float above the fight. */
  bobberLayer: Container;
  /** Layer for the stamina bars, above the weather. */
  barsLayer: Container;
  focus: FightFocus;
}

/**
 * One fishing round, from pressing the cast button to the next idle frame.
 *
 * The flow owns every rule and timer of the round — charge, bite window,
 * fight, catch rewards and the resolve pause — and drives the scene, audio,
 * juice, floaters and minigame through them. The screen only turns raw
 * pointer and keyboard input into `press`, `release` and `finalPull`, and
 * renders the pieces the flow exposes.
 */
export class CastFlow {
  private readonly game: Game;
  private readonly area: AreaDef;
  private readonly scene: FishingScene;
  private readonly juice: JuiceFx;
  private readonly floaters: FloaterLayer;
  private readonly focus: FightFocus;
  private readonly fight: FightStage;

  private phaseValue: CastPhase = "idle";
  private chargeValue = 0;
  private chargeDir = 1;
  private waitTimer = 0;
  private biteTimer = 0;
  private biteWindow = 1;
  private resolveTimer = 0;
  private catchShown = false;
  private pressed = false;
  private paused = false;
  private chargeSoundTimer = 0;
  private nibblePlayed = false;
  private nibbleLead: number = TIMING.nibbleLeadMax;

  private fish: FishSpecies | null = null;
  private fishWeightKg = 0;
  private pointerX = VIEW.width / 2;
  private pointerY = VIEW.height / 2;
  /** Re-rolled every cast; landing inside it boosts rare fish. */
  private luckBandCenterValue = 0.75;
  private luckZoneHit = false;
  /** Time spent charging; used for the late-release buffer. */
  private chargeTime = 0;
  /** Last moment the charge was inside the zone, in `chargeTime` units. */
  private lastZoneInside = -Infinity;
  /** Whether the previous charging frame was inside the zone, for the tick. */
  private wasInsideZone = false;

  private tapLanding = false;
  private tapIconX = 0;
  private tapIconY = 0;
  private readonly pullKeys = new Set<PullKey>();

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
  private cancelCastOnPause(): void {
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

  /** Cursor position in virtual screen units, not canvas pixels. */
  setPointer(x: number, y: number): void {
    this.pointerX = x;
    this.pointerY = y;
  }

  pointerDown(button: number, pointerType = "mouse"): void {
    // Right click is the final pull; the browser menu is suppressed.
    if (button === 2) return;
    const target =
      this.phaseValue === "fighting" && !this.paused
        ? this.fight.landingTarget
        : null;
    // A tap on the tired fish lands it, but only on a touch screen. With a
    // mouse, the left button *is* the reel: pressing it with the cursor over
    // the fish used to land the catch on the release, so the same button both
    // pulled the line and loosed the strike. Desktop players keep RMB / F for
    // the final pull.
    const tap = pointerType === "touch" || pointerType === "pen";
    if (target && tap) {
      const dx = this.pointerX - target.x;
      const dy = this.pointerY - target.y;
      if (Math.hypot(dx, dy) <= 20) {
        this.tapLanding = true;
        this.tapIconX = target.x;
        this.tapIconY = target.y;
        return;
      }
    }
    this.tapLanding = false;
    this.pressStart();
  }

  pointerUp(): void {
    if (this.tapLanding) {
      const moved = Math.hypot(
        this.pointerX - this.tapIconX,
        this.pointerY - this.tapIconY,
      );
      this.tapLanding = false;
      if (moved <= 22) {
        this.finalPull();
        return;
      }
    }
    this.pressEnd();
  }

  pointerCancel(): void {
    this.tapLanding = false;
    this.pressEnd();
  }

  /** Gameplay keys; the screen handles pause and codex first. */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.phaseValue === "fighting" && event.code === "KeyF") {
      if (!event.repeat) this.finalPull();
      return true;
    }
    if (this.phaseValue === "fighting" && event.code in PULL_KEYS) {
      this.pullKeys.add(event.code as PullKey);
      return true;
    }
    if (PRIMARY_KEYS.has(event.code)) {
      if (!event.repeat) this.pressStart();
      return true;
    }
    return false;
  }

  handleKeyUp(event: KeyboardEvent): void {
    if (this.pullKeys.delete(event.code as PullKey)) return;
    if (PRIMARY_KEYS.has(event.code)) this.pressEnd();
  }

  update(dt: number): void {
    if (this.paused) return;

    this.focus.update(dt, this.phaseValue === "fighting");
    this.updateCatchCrossfade();

    if (this.phaseValue === "charging") {
      this.chargeValue += (this.chargeDir * dt) / TIMING.chargeCycle;
      if (this.chargeValue >= 1) {
        this.chargeValue = 1;
        this.chargeDir = -1;
      } else if (this.chargeValue <= 0) {
        this.chargeValue = 0;
        this.chargeDir = 1;
      }
      this.chargeTime += dt;
      const inside =
        Math.abs(this.chargeValue - this.luckBandCenterValue) <=
        LUCK_BAND.width / 2;
      if (inside) {
        this.lastZoneInside = this.chargeTime;
        if (!this.wasInsideZone) {
          this.game.audio.zoneTick();
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate(8);
          }
        }
      }
      this.wasInsideZone = inside;
      this.chargeSoundTimer -= dt;
      if (this.chargeSoundTimer <= 0) {
        this.game.audio.startCharge();
        this.game.audio.setCharge(this.chargeValue);
        this.chargeSoundTimer = 0.1;
      }
    } else if (this.phaseValue === "waiting") {
      this.waitTimer -= dt;
      if (this.waitTimer <= this.nibbleLead && !this.nibblePlayed) {
        this.nibblePlayed = true;
        this.scene.showNibble();
        this.game.audio.nibble();
      }
      if (this.waitTimer <= 0) this.beginBite();
    } else if (this.phaseValue === "bite") {
      this.biteTimer -= dt;
      if (this.biteTimer <= 0) {
        this.failCast(TEXT.game.missedHook, this.aboveFloat());
      }
    } else if (this.phaseValue === "fighting") {
      const direction = this.readPullDirection();
      this.fight.update(dt, {
        pointerX: this.pointerX,
        pointerY: this.pointerY,
        directionX: direction.x,
        directionY: direction.y,
        held: this.pressed,
      });
    } else if (this.phaseValue === "resolve") {
      this.resolveTimer -= dt;
      if (this.resolveTimer <= 0) this.advanceCast();
    }
  }

  // ------------------------------------------------------------- cast flow

  private pressStart(): void {
    if (this.paused) return;
    if (this.phaseValue === "idle") {
      this.phaseValue = "charging";
      this.scene.setPulling(true);
      this.chargeValue = 0;
      this.chargeDir = 1;
      this.chargeSoundTimer = 0;
      this.chargeTime = 0;
      this.lastZoneInside = -Infinity;
      this.wasInsideZone = false;
      this.luckZoneHit = false;
      this.luckBandCenterValue = randRange(LUCK_BAND.min, LUCK_BAND.max);
    } else if (this.phaseValue === "waiting") {
      this.earlyHook();
    } else if (this.phaseValue === "bite") {
      // The player just pressed on the bite prompt — hook immediately. The
      // fight starts with no strike held, so landing stays a deliberate press.
      this.pressed = true;
      this.hookFish();
    } else if (this.phaseValue === "fighting") {
      this.pressed = true;
      this.scene.setPulling(true);
      this.fight.setHold(true);
    }
  }

  private pressEnd(): void {
    this.pressed = false;
    this.scene.setPulling(false);
    if (this.phaseValue === "charging") this.doCast();
    this.fight.setHold(false);
  }

  /** Final pull: RMB/F on desktop, a tap on the tired fish on touch. */
  finalPull(): void {
    if (this.phaseValue !== "fighting" || this.paused) return;
    this.fight.finalPull();
  }

  private doCast(): void {
    if (this.phaseValue !== "charging") return;
    this.phaseValue = "waiting";
    this.chargeValue = clamp(this.chargeValue);
    const insideNow =
      Math.abs(this.chargeValue - this.luckBandCenterValue) <=
      LUCK_BAND.width / 2;
    this.luckZoneHit =
      insideNow || this.chargeTime - this.lastZoneInside <= LUCK_RELEASE_BUFFER;
    if (this.luckZoneHit) this.game.audio.luck();
    // The cue releases the wind-up itself: stopping it here would cut the loop
    // off before the whoosh had a chance to take it over.
    this.game.audio.cast();
    this.scene.playCast(this.chargeValue);
    this.game.clock.persist();
    this.waitTimer = randRange(TIMING.waitMin, TIMING.waitMax);
    this.nibbleLead = randRange(TIMING.nibbleLeadMin, TIMING.nibbleLeadMax);
    this.chargeSoundTimer = 0;
    this.nibblePlayed = false;
  }

  private beginBite(): void {
    if (chance(PASS_BY_CHANCE)) {
      this.passBy();
      return;
    }
    const clock = this.game.clock;
    const fish = pickCastFish({
      areaId: this.area.id,
      minutes: clock.minutes,
      weather: clock.weatherFor(this.area.id),
      weatherDef: clock.weatherDefFor(this.area.id),
      luckZoneHit: this.luckZoneHit,
    });
    this.fish = fish;
    this.fishWeightKg = rollFishWeight(fish);
    this.phaseValue = "bite";
    this.biteWindow = Math.max(0.62, 0.95 - fish.speed * 0.25);
    this.biteTimer = this.biteWindow;
    this.scene.showBite();
    this.game.audio.bite();
    // The catch itself: the float goes under and the camera takes the knock.
    // The player's strike a moment later is a deliberate move and stays still.
    const bobber = this.scene.bobberPosition;
    this.juice.trigger("bite", bobber.x, bobber.y);
  }

  private hookFish(): void {
    if (!this.fish || this.phaseValue !== "bite") return;
    this.phaseValue = "fighting";
    this.pullKeys.clear();
    // The strike is felt before the fight starts: the frame takes a knock in
    // proportion to what is on the hook.
    const bobber = this.scene.bobberPosition;
    this.juice.trigger("hook", bobber.x, bobber.y, HOOK_SHAKE[this.fish.tier]);
    this.fight.start(
      this.fish,
      this.fishWeightKg,
      this.pointerX,
      this.pointerY,
      this.pressed,
    );
  }

  /** A too-early hook: the fish bolts and the cast is returned. */
  private earlyHook(): void {
    if (this.phaseValue !== "waiting") return;
    this.phaseValue = "resolve";
    this.resolveTimer = SPOOK_HOLD;
    this.pressed = false;
    this.scene.escapeFish();
    this.game.audio.escape();
    this.addFloater(
      TEXT.game.earlyHook,
      UI.rose,
      12,
      1.2,
      -24,
      this.aboveFloat(),
    );
  }

  /** The fish inspected the bait and moved on; keep the bobber and wait. */
  private passBy(): void {
    this.fishWeightKg = 0;
    this.phaseValue = "waiting";
    this.pressed = false;
    this.waitTimer = randRange(TIMING.waitMin * 0.65, TIMING.waitMax * 0.85);
    this.nibbleLead = randRange(TIMING.nibbleLeadMin, TIMING.nibbleLeadMax);
    this.nibblePlayed = false;
    this.game.audio.nibble();
  }

  private resolveFight(result: MinigameResult): void {
    if (this.phaseValue !== "fighting" || !this.fish) return;
    // Captured before the fight view is hidden: the lost-fish caption has to
    // sit over the ring the fish just escaped from, which only exists while
    // the minigame does.
    const ring = this.fight.ringCentre;
    this.scene.restoreBobber();
    const fish = this.fish;

    if (!result.won) {
      this.failCast(TEXT.game.lostFish, ring ?? this.aboveFloat());
      return;
    }

    const perfect = result.perfect;

    const firstCatch = this.game.progress.recordCatch(
      fish.id,
      this.fishWeightKg,
    );

    this.phaseValue = "resolve";
    this.resolveTimer = TIMING.resultHold;
    this.catchShown = true;
    this.pressed = false;
    this.pullKeys.clear();

    this.fight.settle();
    const catchTop = this.scene.catchFish(
      this.game.assets.fish[fish.id],
      1.15 * weightScale(fish, this.fishWeightKg),
    );
    const splash = this.scene.bobberPosition;
    this.juice.trigger("catch", splash.x, splash.y);
    this.game.audio.catchFish(perfect);
    if (fish.tier === "legendary") this.game.audio.ready();
    this.showCatchFeedback(fish, firstCatch, catchTop);

    this.game.handleCatch({
      fishId: fish.id,
      areaId: this.area.id,
      weightKg: this.fishWeightKg,
      firstCatch,
      at: Date.now(),
    });
  }

  /**
   * Ends the round with a red caption.
   *
   * Every failure used to be printed over the angler's head, which put "не
   * успел подсeчь" a hand's width away from the float that actually got away
   * and made the caption read as something the fisherman said. The caption now
   * goes where the event happened: over the float for a missed bite, over the
   * fight ring for a fish that tore off.
   */
  private failCast(reason: string, at: { x: number; y: number }): void {
    this.catchShown = false;
    this.scene.restoreBobber();
    this.phaseValue = "resolve";
    this.resolveTimer = TIMING.escapedHold;
    this.pressed = false;
    this.pullKeys.clear();
    this.scene.escapeFish();
    const splash = this.scene.bobberPosition;
    this.juice.trigger("escape", splash.x, splash.y);
    this.game.audio.escape();
    this.fight.settle();
    this.addFloater(
      reason.replace(TEXT.common.ellipsis, ""),
      UI.rose,
      12,
      1.3,
      -24,
      at,
    );
  }

  /**
   * Caption spot just above the float, clear of the bite mark that sits on the
   * same point and about as tall as two lines of this text.
   */
  private aboveFloat(): { x: number; y: number } {
    const bobber = this.scene.bobberPosition;
    return { x: bobber.x, y: bobber.y - 16 };
  }

  private advanceCast(): void {
    this.catchShown = false;
    this.scene.restoreBobber();
    this.fight.dispose();
    this.fish = null;
    this.fishWeightKg = 0;
    this.scene.resetCast();
    this.pullKeys.clear();
    this.chargeValue = 0;
    this.chargeSoundTimer = 0;
    this.nibblePlayed = false;
    this.phaseValue = "idle";
  }

  // ------------------------------------------------------------------- FX

  /** Fade the held fish while the idle cast prompt comes back in. */
  private updateCatchCrossfade(): void {
    if (this.phaseValue !== "resolve" || !this.catchShown) return;
    const fade = clamp(1 - this.resolveTimer / TIMING.catchCrossfade, 0, 1);
    if (fade > 0) this.scene.setHeldFishAlpha(1 - fade);
  }

  /**
   * Name tag for the landed fish. It is anchored to the fish itself (not to a
   * per-area point), so it always hugs the top of the catch and stays centred
   * over the angler.
   */
  private showCatchFeedback(
    fish: FishSpecies,
    firstCatch: boolean,
    catchTop: number,
  ): void {
    const text = TEXT.game.catchFeedback(
      fish.name,
      formatWeight(this.fishWeightKg),
    );
    this.addFloater(
      firstCatch ? `${text}\n${TEXT.game.newSpecies}` : text,
      // Same ice-white as the "ЗАБРОС / ЛКМ" prompt: the catch label belongs to
      // the same interface voice, not to the semantic colour set.
      UI.text,
      13,
      // It ends when the round does, so the last visible frame of the catch is
      // the fish with its tag over it, not a lonely caption over empty water.
      TIMING.resultHold - TIMING.catchJump,
      0,
      {
        x: this.area.layout.angler.x,
        y: catchTop - CATCH_LABEL_GAP,
      },
      // The tag waits until the fish has finished its arc into the angler's
      // hands: during the jump the name would hang over open water.
      TIMING.catchJump,
    );
  }

  private addFloater(
    value: string,
    color: number,
    size: number,
    life: number,
    vy: number,
    at: { x: number; y: number },
    delay = 0,
  ): void {
    this.floaters.add(value, at.x, at.y, color, size, life, vy, 0.5, delay);
  }

  private readPullDirection(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const key of this.pullKeys) {
      const [dx, dy] = PULL_KEYS[key];
      x += dx;
      y += dy;
    }
    const length = Math.hypot(x, y);
    return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }
}
