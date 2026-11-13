import { Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { Game } from "../Game";
import {
  C,
  CASTS_PER_SESSION,
  FISH,
  LUCK_BAND,
  LUCK_MAX,
  LUCK_RARE_STEP,
  LUCK_ZONE_MULT,
  PASS_BY_CHANCE,
  PERFECT_MULTIPLIER,
  SCENE,
  SPOOK_HOLD,
  TIMING,
  VIEW,
  comboMultiplier,
  isRareFish,
  waterProfile,
  type FishSpecies,
  type WaterProfile,
} from "../config";
import type { CatchRecord, SessionResult } from "../types";
import {
  chance,
  clamp,
  formatScore,
  lerp,
  pickWeighted,
  randRange,
} from "../utils";
import { Screen } from "../ui/Screen";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import {
  drawPanel,
  drawPauseIcon,
  drawSoundIcon,
  makeText,
  setText,
} from "../ui/theme";
import { TEXT } from "../texts";
import {
  formatWeight,
  rollFishWeight,
  weightFactor,
  weightScale,
} from "../fishWeight";
import { LakeScene } from "../game/Scene";
import { Atmosphere } from "../game/Atmosphere";
import { JuiceFx } from "../game/JuiceFx";
import { Minigame, type MinigameResult } from "../game/Minigame";
import { FIGHT_RADIUS } from "../game/fightModel";
import { CastHint, CAST_HINT_BOUNDS } from "../ui/CastHint";
import { CURSORS } from "../cursors";

type Phase =
  "idle" | "charging" | "waiting" | "bite" | "fighting" | "resolve" | "done";

interface Floater {
  text: Text;
  life: number;
  maxLife: number;
  vy: number;
}

/** Feedback floaters live beside the angler, never in the middle of the water. */
const FLOATER_X = SCENE.anglerX + 12;
const FLOATER_Y = SCENE.anglerY - 58;

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

const FIGHT_VIGNETTE_RADIUS = 560;

/** One radial texture: clear in the fight zone, progressively darker outside. */
function createFightVignette(): Sprite {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[fishing] 2D canvas is unavailable");

  const center = size / 2;
  const inner = (center * (FIGHT_RADIUS + 14)) / FIGHT_VIGNETTE_RADIUS;
  const gradient = ctx.createRadialGradient(
    center,
    center,
    inner,
    center,
    center,
    center,
  );
  gradient.addColorStop(0, "rgba(5, 11, 28, 0)");
  gradient.addColorStop(0.3, "rgba(5, 11, 28, 0.12)");
  gradient.addColorStop(1, "rgba(5, 11, 28, 0.52)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = Texture.from(canvas);
  texture.source.scaleMode = "linear";
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.width = FIGHT_VIGNETTE_RADIUS * 2;
  sprite.height = FIGHT_VIGNETTE_RADIUS * 2;
  sprite.eventMode = "none";
  sprite.visible = false;
  return sprite;
}

export class GameScreen extends Screen {
  private readonly game: Game;
  private readonly scene: LakeScene;
  private readonly atmosphere = new Atmosphere();
  private readonly playfield = new Container();
  private readonly hud = new Container();
  private readonly castHint = new CastHint();
  private readonly fx = new Container();
  private readonly floatersLayer = new Container();
  private readonly bobberLayer = new Container();
  private readonly juice = new JuiceFx();
  private readonly fightVignette = createFightVignette();
  private fightVignetteAlpha = 0;
  private readonly inputCatcher: Graphics;
  private readonly powerPlate = new Graphics();
  private readonly powerBar = new Graphics();
  private readonly pullKeys = new Set<PullKey>();
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.finalPull();
  };

  private scoreValue!: Text;
  private attemptsText!: Text;
  private powerLabel!: Text;
  private tapLanding = false;
  private tapIconX = 0;
  private tapIconY = 0;
  private soundButton!: Button;
  private pauseOverlay!: Container;
  private pauseSoundButton!: Button;
  private readonly pauseFocus = new FocusGroup();

  private phase: Phase = "idle";
  private charge = 0;
  private chargeDir = 1;
  private waitTimer = 0;
  private biteTimer = 0;
  private biteWindow = 1;
  private resolveTimer = 0;
  private catchShown = false;
  private pressed = false;
  private paused = false;
  private finished = false;
  private time = 0;
  private chargeSoundTimer = 0;
  private reelTimer = 0;
  private nibblePlayed = false;
  private nibbleLead: number = TIMING.nibbleLeadMax;

  private fish: FishSpecies | null = null;
  private fishWeightKg = 0;
  private water: WaterProfile = waterProfile(0);
  private minigame: Minigame | null = null;
  private readonly floaters: Floater[] = [];
  private pointerX = VIEW.width / 2;
  private pointerY = VIEW.height / 2;
  /** Re-rolled every cast; landing inside it boosts rare fish. */
  private luckBandCenter = 0.75;
  private luckZoneHit = false;
  /** Hidden streak of perfect catches; resets when a fish escapes. */
  private luck = 0;

  private score = 0;
  private displayScore = 0;
  private scorePunch = 0;
  private combo = 0;
  private bestStreak = 0;
  private bestMultiplier = 1;
  private castsUsed = 0;
  private castsLeft = CASTS_PER_SESSION;
  private readonly catches: CatchRecord[] = [];
  private perfectCount = 0;

  constructor(game: Game) {
    super();
    this.game = game;

    this.scene = new LakeScene(game.assets);
    this.scene.onCastLanded = () => {
      this.game.audio.plop();
      if (this.luckZoneHit) this.scene.celebrateLuck();
      const point = this.scene.castPoint;
      this.juice.trigger("cast", point.x, point.y);
    };
    this.addChild(this.playfield);
    this.playfield.addChild(this.scene);

    this.atmosphere.onThunder = () => this.game.audio.thunder();
    const palette = game.clock.palette;
    this.scene.tint = palette.tint;
    this.scene.setLantern(palette.lantern);
    this.atmosphere.setWorld(palette, game.clock.weatherDef);
    this.playfield.addChild(this.atmosphere);

    this.inputCatcher = new Graphics();
    this.inputCatcher.eventMode = "static";
    this.inputCatcher.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.inputCatcher.on("pointerdown", (event) => {
      this.trackPointer(event);
      // Right click is the final pull; the browser menu is suppressed.
      if (event.button === 2) return;
      const target =
        this.phase === "fighting" && !this.paused
          ? this.minigame?.landingTarget
          : null;
      if (target) {
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
    });
    this.inputCatcher.on("pointermove", (event) => this.trackPointer(event));
    this.inputCatcher.on("globalpointermove", (event) =>
      this.trackPointer(event),
    );
    this.inputCatcher.on("pointerup", () => {
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
    });
    this.inputCatcher.on("pointerupoutside", () => {
      this.tapLanding = false;
      this.pressEnd();
    });
    this.inputCatcher.on("pointercancel", () => {
      this.tapLanding = false;
      this.pressEnd();
    });
    this.addChild(this.inputCatcher);
    this.inputCatcher.cursor = CURSORS.default;

    this.buildHud();
    this.addChild(this.hud);
    this.hud.addChild(this.castHint);
    this.addChild(this.floatersLayer);
    this.floatersLayer.eventMode = "none";
    // Purely visual layers (minigame frame) must never intercept pointer events
    // meant for the input catcher. The playfield is the only filtered layer;
    // HUD and floaters stay crisp above it.
    this.playfield.addChild(this.fightVignette);
    this.fightVignette.eventMode = "none";
    this.fightVignette.visible = false;
    this.playfield.addChild(this.fx);
    this.fx.eventMode = "none";
    // The float is lifted above the minigame while the fight is active, so it
    // stays on top of the fish that carries it.
    this.playfield.addChild(this.bobberLayer);
    this.bobberLayer.eventMode = "none";
    this.juice.attachTo(this.playfield);
    this.buildPause();
    this.addChild(this.pauseOverlay);
    this.game.app.canvas.addEventListener(
      "contextmenu",
      this.handleContextMenu,
    );

    this.updateHud();
  }

  // -------------------------------------------------------------------- HUD

  private buildHud(): void {
    const bar = new Graphics();
    bar.rect(0, 0, VIEW.width, 24).fill({ color: C.ink, alpha: 0.82 });
    bar.rect(0, 23, VIEW.width, 1).fill({ color: C.brownDark, alpha: 0.65 });
    bar.rect(3, 4, 2, 16).fill({ color: C.brownLight, alpha: 0.85 });
    bar.eventMode = "none";
    this.hud.addChild(bar);

    const scoreLabel = makeText(TEXT.common.score, {
      size: 7,
      color: C.steelPale,
    });
    scoreLabel.anchor.set(0, 0.5);
    scoreLabel.position.set(8, 12);
    scoreLabel.eventMode = "none";
    this.hud.addChild(scoreLabel);

    this.scoreValue = makeText(TEXT.hud.scoreZero, {
      size: 16,
      weight: 800,
      color: C.cream,
    });
    this.scoreValue.anchor.set(0, 0.5);
    this.scoreValue.position.set(36, 12);
    this.scoreValue.eventMode = "none";
    this.hud.addChild(this.scoreValue);

    this.attemptsText = makeText(TEXT.hud.remaining(CASTS_PER_SESSION), {
      size: 8,
      weight: 700,
      color: C.steelPale,
      align: "center",
      letterSpacing: 0.5,
    });
    this.attemptsText.anchor.set(0.5, 0.5);
    this.attemptsText.position.set(VIEW.width / 2, 12);
    this.attemptsText.eventMode = "none";
    this.hud.addChild(this.attemptsText);

    this.soundButton = new Button({
      width: 18,
      height: 18,
      variant: "ghost",
      icon: (g) => drawSoundIcon(g, this.game.muted),
      onClick: () => this.game.toggleMute(),
    });
    this.soundButton.position.set(430, 3);
    this.hud.addChild(this.soundButton);

    const pauseButton = new Button({
      width: 18,
      height: 18,
      variant: "ghost",
      icon: (g) => drawPauseIcon(g),
      onClick: () => this.openPause(),
    });
    pauseButton.position.set(452, 3);
    this.hud.addChild(pauseButton);

    this.powerLabel = makeText(TEXT.hud.power, {
      size: 8,
      color: C.steelPale,
      align: "left",
      letterSpacing: 0.5,
    });
    this.powerLabel.style.stroke = { color: C.ink, width: 2.5 };
    this.powerLabel.position.set(172, 154);
    this.powerLabel.visible = false;
    this.powerLabel.eventMode = "none";

    drawPanel(this.powerPlate, 166, 151, 148, 26, {
      fill: C.ink,
      alpha: 0.84,
      shadow: false,
    });
    this.powerPlate.visible = false;
    this.powerPlate.eventMode = "none";

    this.hud.addChild(this.powerPlate);
    this.hud.addChild(this.powerLabel);
    this.powerBar.eventMode = "none";
    this.hud.addChild(this.powerBar);
  }

  private updateHud(): void {
    if (this.displayScore === this.score) {
      setText(this.scoreValue, formatScore(this.displayScore));
    }
    setText(this.attemptsText, TEXT.hud.remaining(this.castsLeft));
    this.attemptsText.style.fill = this.castsLeft <= 2 ? C.gold : C.steelPale;
  }

  private updatePerfectPips(): void {
    // Kept as the single hook for result-only perfect tracking.
  }

  // ------------------------------------------------------------------ pause

  private buildPause(): void {
    this.pauseOverlay = new Container();
    this.pauseOverlay.visible = false;

    const blocker = new Graphics();
    blocker
      .rect(0, 0, VIEW.width, VIEW.height)
      .fill({ color: C.ink, alpha: 0.74 });
    blocker.eventMode = "static";
    blocker.cursor = CURSORS.default;
    blocker.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.pauseOverlay.addChild(blocker);

    const panel = new Graphics();
    drawPanel(panel, 130, 56, 220, 180, {
      fill: C.panel,
      alpha: 0.98,
      shadow: true,
    });
    this.pauseOverlay.addChild(panel);

    const title = makeText(TEXT.common.pause, {
      size: 18,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 2,
    });
    title.position.set(240, 68);
    this.pauseOverlay.addChild(title);

    const resume = new Button({
      label: TEXT.common.resume,
      width: 170,
      height: 24,
      variant: "primary",
      size: 11,
      onClick: () => this.closePause(),
    });
    resume.position.set(155, 98);
    this.pauseOverlay.addChild(resume);

    const restart = new Button({
      label: TEXT.common.restart,
      width: 170,
      height: 24,
      size: 11,
      onClick: () => this.game.startGame(),
    });
    restart.position.set(155, 128);
    this.pauseOverlay.addChild(restart);

    this.pauseSoundButton = new Button({
      label: this.muteLabel(),
      width: 170,
      height: 24,
      size: 11,
      onClick: () => this.game.toggleMute(),
    });
    this.pauseSoundButton.position.set(155, 158);
    this.pauseOverlay.addChild(this.pauseSoundButton);

    const menu = new Button({
      label: TEXT.common.menu,
      width: 170,
      height: 24,
      size: 11,
      onClick: () => this.game.showMenu(),
    });
    menu.position.set(155, 188);
    this.pauseOverlay.addChild(menu);

    this.pauseFocus.setItems([resume, restart, this.pauseSoundButton, menu]);
    this.pauseFocus.onMove = () => this.game.audio.hover();
  }

  private muteLabel(): string {
    return this.game.muted ? TEXT.common.soundOff : TEXT.common.soundOn;
  }

  private openPause(): void {
    if (this.paused || this.finished) return;
    this.paused = true;
    this.pressed = false;
    this.scene.setPulling(false);
    this.castHint.visible = false;
    this.inputCatcher.cursor = CURSORS.default;
    this.pullKeys.clear();
    this.minigame?.setHold(false);
    this.pauseOverlay.visible = true;
    this.pauseFocus.focus(0);
    this.game.audio.click();
  }

  private closePause(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pauseOverlay.visible = false;
    this.pauseFocus.blur();
    this.game.audio.back();
  }

  // ------------------------------------------------------------- cast flow

  private pressStart(): void {
    if (this.paused || this.finished) return;
    if (this.phase === "idle") {
      this.phase = "charging";
      this.scene.setPulling(true);
      this.charge = 0;
      this.chargeDir = 1;
      this.chargeSoundTimer = 0;
      this.luckZoneHit = false;
      this.luckBandCenter = randRange(LUCK_BAND.min, LUCK_BAND.max);
    } else if (this.phase === "waiting") {
      this.earlyHook();
    } else if (this.phase === "bite") {
      // The player just pressed on the bite prompt — hook immediately. The
      // fight starts with no strike held, so landing stays a deliberate press.
      this.pressed = true;
      this.hookFish();
    } else if (this.phase === "fighting") {
      this.pressed = true;
      this.scene.setPulling(true);
      this.minigame?.setHold(true);
    }
    // No skip during the resolve phase: the player must watch the caught
    // fish land — there is nothing to skip past once it is over.
  }

  private pressEnd(): void {
    this.pressed = false;
    this.scene.setPulling(false);
    if (this.phase === "charging") this.doCast();
    this.minigame?.setHold(false);
  }

  /** Final pull: RMB/F on desktop, a tap on the tired fish on touch. */
  private finalPull(): void {
    if (this.phase !== "fighting" || this.paused || this.finished) {
      return;
    }
    this.minigame?.finalPull();
  }

  private doCast(): void {
    if (this.phase !== "charging") return;
    this.phase = "waiting";
    this.castsUsed += 1;
    this.castsLeft -= 1;
    this.charge = clamp(this.charge);
    this.water = waterProfile(this.charge);
    this.luckZoneHit =
      Math.abs(this.charge - this.luckBandCenter) <= LUCK_BAND.width / 2;
    if (this.luckZoneHit) this.game.audio.luck();
    this.game.audio.cast();
    this.scene.playCast(this.charge);
    this.game.clock.persist();
    this.waitTimer = randRange(TIMING.waitMin, TIMING.waitMax);
    this.nibbleLead = randRange(TIMING.nibbleLeadMin, TIMING.nibbleLeadMax);
    this.chargeSoundTimer = 0;
    this.reelTimer = 0;
    this.nibblePlayed = false;
    this.powerBar.clear();
    this.powerLabel.visible = false;
    this.powerPlate.visible = false;
    this.updateHud();
  }

  private updateFightVignette(dt: number): void {
    const target =
      this.phase === "fighting" && !this.paused && !this.finished ? 1 : 0;
    const timeConstant = target > this.fightVignetteAlpha ? 0.2 : 0.4;
    this.fightVignetteAlpha +=
      (target - this.fightVignetteAlpha) * (1 - Math.exp(-dt / timeConstant));

    const sprite = this.fightVignette;
    if (this.fightVignetteAlpha < 0.005) {
      sprite.visible = false;
      return;
    }
    sprite.visible = true;
    sprite.alpha = this.fightVignetteAlpha;
  }

  private pickFish(): FishSpecies {
    const clock = this.game.clock;
    const phase = clock.phase;
    const weather = clock.weather;
    const weatherDef = clock.weatherDef;
    const pool = FISH.filter(
      (fish) =>
        (!fish.time || fish.time.includes(phase)) &&
        (!fish.weather || fish.weather.includes(weather)),
    );
    const source = pool.length > 0 ? pool : FISH;
    const progress = this.castsUsed / CASTS_PER_SESSION;

    return pickWeighted(source, (fish) => {
      const rarity = fish.points / 400;
      const distanceFactor = lerp(
        this.water.commonFactor,
        this.water.rareFactor,
        rarity,
      );
      let weight =
        fish.weight * (1 + rarity * (0.5 + progress * 1.6)) * distanceFactor;

      if (isRareFish(fish)) {
        weight *= weatherDef.rare;
        weight *= 1 + this.luck * LUCK_RARE_STEP;
        if (this.luckZoneHit) weight *= LUCK_ZONE_MULT;
      } else {
        weight *= weatherDef.common;
      }
      return weight;
    });
  }

  private beginBite(): void {
    if (chance(PASS_BY_CHANCE)) {
      this.passBy();
      return;
    }
    const fish = this.pickFish();
    this.fish = fish;
    this.fishWeightKg = rollFishWeight(fish);
    this.phase = "bite";
    this.biteWindow = Math.max(0.62, 0.95 - fish.speed * 0.25);
    this.biteTimer = this.biteWindow;
    this.scene.showBite();
    this.game.audio.bite();
  }

  private hookFish(): void {
    if (!this.fish || this.phase !== "bite") return;
    this.phase = "fighting";
    this.scene.setFight();
    this.juice.trigger("hook", this.scene.castPoint.x, this.scene.castPoint.y);
    this.game.audio.hook();
    this.reelTimer = 0;
    this.pullKeys.clear();

    const minigame = new Minigame(
      this.fish,
      this.game.assets.fish[this.fish.id],
      {
        anchor: this.scene.castPoint,
        wildness: this.water.wildness,
        onWarn: () => this.game.audio.warn(),
        onCounter: () => {
          this.game.audio.counter();
          const point = this.scene.bobberPosition;
          this.juice.trigger("counter", point.x, point.y);
        },
        onReady: () => {
          this.game.audio.ready();
          const point = this.scene.bobberPosition;
          this.juice.trigger("ready", point.x, point.y);
        },
        onResist: () => this.game.audio.resist(),
        onGripOut: () => this.game.audio.gripOut(),
      },
    );
    this.fx.addChild(minigame);
    this.bobberLayer.addChild(this.scene.bobberView);
    const focus = minigame.ringCenter;
    this.fightVignette.position.set(focus.x, focus.y);
    minigame.onFinish = (result) => this.resolveFight(result);
    this.minigame = minigame;
    minigame.setHold(this.pressed);
    minigame.setPointer(this.pointerX, this.pointerY);
    this.scene.setFightFish(
      minigame.fishPoint.x,
      minigame.fishPoint.y,
      minigame.fishVelocity.x,
      minigame.fishVelocity.y,
    );
    this.scene.setEscapeMeter(0);
    this.updatePerfectPips();
  }

  /** A too-early hook: the fish bolts and the cast is returned. */
  private earlyHook(): void {
    if (this.phase !== "waiting") return;
    this.refundCast();
    this.phase = "resolve";
    this.resolveTimer = SPOOK_HOLD;
    this.pressed = false;
    this.scene.escapeFish();
    this.game.audio.escape();
    this.addFloater(
      TEXT.game.earlyHook,
      FLOATER_X,
      FLOATER_Y,
      C.red,
      12,
      1.2,
      -24,
    );
    this.updateHud();
  }

  /** The fish inspected the bait and moved on; keep the bobber and wait. */
  private passBy(): void {
    this.fishWeightKg = 0;
    this.phase = "waiting";
    this.pressed = false;
    this.waitTimer = randRange(TIMING.waitMin * 0.65, TIMING.waitMax * 0.85);
    this.nibbleLead = randRange(TIMING.nibbleLeadMin, TIMING.nibbleLeadMax);
    this.nibblePlayed = false;
    this.game.audio.nibble();
    this.updateHud();
  }

  private refundCast(): void {
    if (this.castsUsed <= 0) return;
    this.castsUsed -= 1;
    this.castsLeft = CASTS_PER_SESSION - this.castsUsed;
  }

  private resolveFight(result: MinigameResult): void {
    if (this.phase !== "fighting" || !this.fish) return;
    this.scene.restoreBobber();
    const fish = this.fish;

    if (!result.won) {
      this.failCast(TEXT.game.lostFish);
      return;
    }

    const multiplier = comboMultiplier(this.combo);
    const perfect = result.perfect;
    const factor = weightFactor(fish, this.fishWeightKg);
    const points = Math.round(
      fish.points * factor * multiplier * (perfect ? PERFECT_MULTIPLIER : 1),
    );

    this.combo += 1;
    this.bestStreak = Math.max(this.bestStreak, this.combo);
    this.bestMultiplier = Math.max(this.bestMultiplier, multiplier);
    this.score += points;
    this.scorePunch = 0.22;
    if (perfect) {
      this.perfectCount += 1;
      this.luck = Math.min(LUCK_MAX, this.luck + 1);
    }

    const record: CatchRecord = {
      fishId: fish.id,
      name: fish.name,
      latin: fish.latin,
      points,
      perfect,
      weightKg: this.fishWeightKg,
      multiplier,
    };
    this.catches.push(record);

    this.phase = "resolve";
    this.resolveTimer = TIMING.resultHold;
    this.catchShown = true;
    this.pressed = false;
    this.pullKeys.clear();
    this.powerBar.clear();
    this.powerLabel.visible = false;
    this.powerPlate.visible = false;

    if (this.minigame) {
      this.minigame.visible = false;
      this.minigame.setHold(false);
    }
    this.updatePerfectPips();
    this.scene.catchFish(
      this.game.assets.fish[fish.id],
      1.15 * weightScale(fish, this.fishWeightKg),
    );
    const splash = this.scene.bobberPosition;
    this.juice.trigger("catch", splash.x, splash.y);
    this.game.audio.catchFish(perfect);
    this.showCatchFeedback(record);
    this.updateHud();
  }

  private failCast(reason: string): void {
    if (this.finished) return;
    this.catchShown = false;
    this.scene.restoreBobber();
    const brokenStreak = this.combo;
    this.phase = "resolve";
    this.resolveTimer = TIMING.escapedHold;
    this.combo = 0;
    this.luck = 0;
    this.pressed = false;
    this.pullKeys.clear();
    this.reelTimer = 0;
    this.scene.escapeFish();
    const splash = this.scene.bobberPosition;
    this.juice.trigger("escape", splash.x, splash.y);
    this.game.audio.escape();
    if (brokenStreak >= 2) this.game.audio.comboBreak();
    if (this.minigame) this.minigame.visible = false;
    this.updatePerfectPips();
    this.powerBar.clear();
    this.powerLabel.visible = false;
    this.powerPlate.visible = false;
    this.addFloater(
      brokenStreak >= 2
        ? TEXT.game.streakBroken(brokenStreak)
        : reason.replace(TEXT.common.ellipsis, ""),
      FLOATER_X,
      FLOATER_Y,
      C.red,
      12,
      1.3,
      -24,
    );
    this.updateHud();
  }

  private advanceCast(): void {
    if (this.finished) return;
    this.catchShown = false;
    this.scene.restoreBobber();
    if (this.minigame) {
      this.fx.removeChild(this.minigame);
      this.minigame.destroy({ children: true });
      this.minigame = null;
    }
    this.updatePerfectPips();
    this.fish = null;
    this.fishWeightKg = 0;
    this.scene.resetCast();
    this.pullKeys.clear();
    this.charge = 0;
    this.chargeSoundTimer = 0;
    this.reelTimer = 0;
    this.nibblePlayed = false;

    if (this.castsLeft <= 0) {
      this.finishSession();
      return;
    }
    this.phase = "idle";
  }

  private finishSession(): void {
    if (this.finished) return;
    this.finished = true;
    this.phase = "done";
    const bestFish =
      this.catches.length > 0
        ? this.catches.reduce((best, record) =>
            record.points > best.points ? record : best,
          )
        : null;
    const result: SessionResult = {
      score: this.score,
      casts: CASTS_PER_SESSION,
      caught: this.catches.length,
      perfect: this.perfectCount,
      bestFish,
      catches: [...this.catches],
      bestStreak: this.bestStreak,
      bestMultiplier: this.bestMultiplier,
      date: Date.now(),
    };
    const name = this.game.options.playerName || TEXT.common.playerFallback;
    this.game.clock.persist();
    const standing = this.game.submitScore(name, result);
    this.game.showResults(result, true, standing);
  }

  // ------------------------------------------------------------------- FX

  private showCatchFeedback(record: CatchRecord): void {
    this.addFloater(
      TEXT.game.catchFeedback(
        record.name,
        record.points,
        record.multiplier,
        formatWeight(record.weightKg),
        record.perfect,
      ),
      SCENE.anglerX,
      SCENE.anglerY + 24,
      record.perfect ? C.yellow : C.gold,
      13,
      TIMING.resultHold,
      0,
    );
  }

  private addFloater(
    value: string,
    x: number,
    y: number,
    color: number,
    size = 14,
    life = 1.1,
    vy = -28,
    anchorX = 0.5,
  ): void {
    const text = makeText(value, {
      size,
      weight: 800,
      color,
      align: anchorX === 0 ? "left" : "center",
      lineHeight: size + 1,
    });
    text.anchor.set(anchorX, 1);
    text.position.set(x, y);
    text.style.stroke = { color: C.ink, width: 2 };
    this.floatersLayer.addChild(text);
    this.floaters.push({ text, life, maxLife: life, vy });
  }

  private updateFloaters(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i];
      floater.life -= dt;
      floater.text.y += floater.vy * dt;
      const fadeTime = Math.min(0.4, floater.maxLife * 0.45);
      floater.text.alpha =
        floater.life < fadeTime ? Math.max(0, floater.life / fadeTime) : 1;
      if (floater.life <= 0) {
        this.floatersLayer.removeChild(floater.text);
        floater.text.destroy();
        this.floaters.splice(i, 1);
      }
    }
  }

  private updateScore(dt: number): void {
    if (this.displayScore !== this.score) {
      const diff = this.score - this.displayScore;
      const step = Math.max(1, Math.abs(diff) * Math.min(1, dt * 9));
      this.displayScore =
        diff > 0
          ? Math.min(this.score, this.displayScore + step)
          : Math.max(this.score, this.displayScore - step);
      setText(this.scoreValue, formatScore(this.displayScore));
    }

    if (this.scorePunch > 0) {
      this.scorePunch = Math.max(0, this.scorePunch - dt);
      const pulse = 1 + (this.scorePunch / 0.22) * 0.22;
      this.scoreValue.scale.set(pulse);
    } else if (this.scoreValue.scale.x !== 1) {
      this.scoreValue.scale.set(1);
    }
  }

  private drawPowerBar(): void {
    const g = this.powerBar;
    g.clear();
    if (this.phase !== "charging") {
      this.powerLabel.visible = false;
      this.powerPlate.visible = false;
      return;
    }
    this.powerLabel.visible = true;
    this.powerPlate.visible = true;

    const x = 172;
    const y = 166;
    const width = 136;
    const height = 8;
    g.rect(x - 1, y - 1, width + 2, height + 2).fill(C.ink);
    g.rect(x, y, width, height).fill(0x232a44);
    const fill = Math.round(width * this.charge);
    g.rect(x, y, fill, height).fill(C.gold);
    g.rect(x, y, fill, 2).fill({ color: C.cream, alpha: 0.55 });
    g.rect(x + fill - 1, y - 1, 1, height + 2).fill(C.cream);

    // Luck zone: re-rolled every cast, so it has to be read live.
    const bandW = Math.max(4, width * LUCK_BAND.width);
    const bandX = x + width * this.luckBandCenter - bandW / 2;
    const pulse = 0.55 + Math.abs(Math.sin(this.time * 3)) * 0.45;
    const inside =
      Math.abs(this.charge - this.luckBandCenter) <= LUCK_BAND.width / 2;
    g.rect(bandX - 2, y - 3, bandW + 4, height + 6).fill({
      color: C.cyan,
      alpha: (inside ? 0.3 : 0.12) * pulse,
    });
    g.rect(bandX, y, bandW, height).fill({
      color: C.cyan,
      alpha: inside ? 0.85 : 0.62,
    });
    g.rect(bandX, y, 1, height).fill({ color: C.cream, alpha: 0.95 });
    g.rect(bandX + bandW - 1, y, 1, height).fill({
      color: C.cream,
      alpha: 0.95,
    });
  }

  /** Cursor position in virtual screen units, not canvas pixels. */
  private trackPointer(event: FederatedPointerEvent): void {
    const point = event.getLocalPosition(this);
    this.pointerX = point.x;
    this.pointerY = point.y;

    const overWater =
      !this.paused &&
      !this.finished &&
      !this.isOverHud(point.x, point.y) &&
      this.scene.isWaterAt(point.x, point.y);

    // Button/scrollbar targets own their own cursor. Only repaint the cursor
    // while the catcher itself is hovered, otherwise globalpointermove would
    // overwrite the custom pointer over UI controls.
    if (event.target !== this.inputCatcher) return;

    if (this.paused || this.finished) {
      this.inputCatcher.cursor = CURSORS.default;
      return;
    }

    this.inputCatcher.cursor = overWater ? CURSORS.crosshair : CURSORS.default;
  }

  private isOverHud(x: number, y: number): boolean {
    if (y < 24) return true;
    if (
      this.phase === "charging" &&
      x >= 166 &&
      x <= 314 &&
      y >= 151 &&
      y <= 177
    ) {
      return true;
    }
    if (
      x >= CAST_HINT_BOUNDS.x &&
      x <= CAST_HINT_BOUNDS.x + CAST_HINT_BOUNDS.width &&
      y >= CAST_HINT_BOUNDS.y &&
      y <= CAST_HINT_BOUNDS.y + CAST_HINT_BOUNDS.height
    ) {
      return true;
    }
    return false;
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

  // ----------------------------------------------------------------- update

  override update(dt: number): void {
    if (this.paused) return;
    this.time += dt;

    const clock = this.game.clock;
    if (!this.finished) {
      const changed = clock.update(dt);
      if (changed) clock.persist();
    }
    const palette = clock.palette;
    this.scene.tint = palette.tint;
    this.scene.setLantern(palette.lantern);
    this.atmosphere.setWorld(palette, clock.weatherDef);
    this.atmosphere.update(dt);

    this.scene.update(dt);
    this.juice.update(dt);
    this.updateFightVignette(dt);

    let hintVisible = this.phase === "idle" && !this.paused && !this.finished;
    let hintAlpha = 1;

    // At the tail of a successful catch, the fish dissolves while the next
    // "ЗАБРОС" prompt fades in at the same spot.
    if (
      this.phase === "resolve" &&
      this.catchShown &&
      !this.finished &&
      this.castsLeft > 0
    ) {
      const fade = clamp(1 - this.resolveTimer / TIMING.catchCrossfade, 0, 1);
      if (fade > 0) {
        hintVisible = true;
        hintAlpha = fade;
        this.scene.setHeldFishAlpha(1 - fade);
      }
    }

    this.castHint.visible = hintVisible;
    this.castHint.alpha = hintVisible ? hintAlpha : 0;
    if (hintVisible) this.castHint.tick(dt);
    this.updateFloaters(dt);
    this.updateScore(dt);
    this.updatePerfectPips();

    if (this.finished) return;

    if (this.phase === "charging") {
      this.charge += (this.chargeDir * dt) / TIMING.chargeCycle;
      if (this.charge >= 1) {
        this.charge = 1;
        this.chargeDir = -1;
      } else if (this.charge <= 0) {
        this.charge = 0;
        this.chargeDir = 1;
      }
      this.chargeSoundTimer -= dt;
      if (this.chargeSoundTimer <= 0) {
        this.game.audio.chargeTick(this.charge);
        this.chargeSoundTimer = 0.1;
      }
      this.drawPowerBar();
    } else if (this.phase === "waiting") {
      this.waitTimer -= dt;
      if (this.waitTimer <= this.nibbleLead && !this.nibblePlayed) {
        this.nibblePlayed = true;
        this.scene.showNibble();
        this.game.audio.nibble();
      }
      if (this.waitTimer <= 0) this.beginBite();
    } else if (this.phase === "bite") {
      this.biteTimer -= dt;
      if (this.biteTimer <= 0) {
        this.failCast(TEXT.game.missedHook);
      }
    } else if (this.phase === "fighting") {
      const direction = this.readPullDirection();
      this.scene.setPulling(this.pressed);
      this.minigame?.setPointer(this.pointerX, this.pointerY);
      this.minigame?.setDirection(direction.x, direction.y);
      this.minigame?.setHold(this.pressed);
      this.minigame?.update(dt);
      if (this.minigame) {
        const point = this.minigame.fishPoint;
        const velocity = this.minigame.fishVelocity;
        this.scene.setFightFish(
          point.x,
          point.y,
          velocity.x,
          velocity.y,
          this.minigame.isSteering,
        );
        this.scene.setEscapeMeter(this.minigame.escapeMeter);
      }
      if (this.minigame?.isSteering) {
        this.reelTimer -= dt;
        if (this.reelTimer <= 0) {
          this.game.audio.reel();
          this.reelTimer = 0.12;
        }
      } else {
        this.reelTimer = 0;
      }
    } else if (this.phase === "resolve") {
      this.resolveTimer -= dt;
      if (this.resolveTimer <= 0) this.advanceCast();
    }
  }

  // ------------------------------------------------------------------ input

  override handleKey(event: KeyboardEvent): boolean {
    if (this.finished) return true;
    if (this.paused) {
      if (event.code === "Escape") {
        this.closePause();
        return true;
      }
      return this.pauseFocus.handleKey(event);
    }
    if (event.code === "Escape") {
      this.openPause();
      return true;
    }
    if (this.phase === "fighting" && event.code === "KeyF") {
      if (!event.repeat) this.finalPull();
      return true;
    }
    if (this.phase === "fighting" && event.code in PULL_KEYS) {
      this.pullKeys.add(event.code as PullKey);
      return true;
    }
    if (
      event.code === "Space" ||
      event.code === "Enter" ||
      event.code === "NumpadEnter" ||
      event.code === "ArrowUp"
    ) {
      if (!event.repeat) this.pressStart();
      return true;
    }
    return false;
  }

  override handleKeyUp(event: KeyboardEvent): void {
    if (this.pullKeys.delete(event.code as PullKey)) return;
    if (
      event.code === "Space" ||
      event.code === "Enter" ||
      event.code === "NumpadEnter" ||
      event.code === "ArrowUp"
    ) {
      this.pressEnd();
    }
  }

  override onHostPause(paused: boolean): void {
    if (paused) this.openPause();
    else this.closePause();
  }

  override onExit(): void {
    this.game.clock.persist();
    this.inputCatcher.cursor = CURSORS.default;
    this.game.app.canvas.removeEventListener(
      "contextmenu",
      this.handleContextMenu,
    );
  }

  override onMuteChanged(): void {
    this.soundButton.setIcon((g) => drawSoundIcon(g, this.game.muted));
    this.pauseSoundButton.setLabel(this.muteLabel());
  }
}
