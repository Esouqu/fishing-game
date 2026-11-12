import { Container, Graphics, Rectangle, Text } from "pixi.js";
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
import { LakeScene } from "../game/Scene";
import { Atmosphere } from "../game/Atmosphere";
import { Minigame, type MinigameResult } from "../game/Minigame";
import { TutorialOverlay } from "./TutorialOverlay";

type Phase =
  "idle" | "charging" | "waiting" | "bite" | "fighting" | "resolve" | "done";
type Outcome = "caught" | "lost";

interface Floater {
  text: Text;
  life: number;
  maxLife: number;
  vy: number;
}

const CAST_LABEL = "УДЕРЖИВАЙ — СИЛА ЗАБРОСА";

/** Shared cast/streak block, centred in the top HUD. */
const HUD_INFO_WIDTH = 188;
const HUD_INFO_LEFT = VIEW.width / 2 - HUD_INFO_WIDTH / 2;
const HUD_INFO_RIGHT = VIEW.width / 2 + HUD_INFO_WIDTH / 2;
const HUD_ATTEMPT_SPAN = (CASTS_PER_SESSION - 1) * 10 + 6;
const HUD_ATTEMPT_START = Math.round((HUD_INFO_WIDTH - HUD_ATTEMPT_SPAN) / 2);
const WAIT_LABEL = "ЖДЁМ ПОКЛЁВКИ";

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

export class GameScreen extends Screen {
  private readonly game: Game;
  private readonly scene: LakeScene;
  private readonly atmosphere = new Atmosphere();
  private readonly hud = new Container();
  private readonly castInfo = new Container();
  private readonly fx = new Container();
  private readonly inputCatcher: Graphics;
  private readonly dots = new Graphics();
  private readonly perfectPips = new Graphics();
  private readonly powerBar = new Graphics();
  private readonly reactionBar = new Graphics();
  private readonly pullKeys = new Set<PullKey>();
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    this.finalPull();
  };

  private scoreValue!: Text;
  private castLabel!: Text;
  private comboText!: Text;
  private statusText!: Text;
  private biteText!: Text;
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
  private pressed = false;
  private paused = false;
  private finished = false;
  private time = 0;
  private chargeSoundTimer = 0;
  private reelTimer = 0;
  private nibblePlayed = false;
  private nibbleLead: number = TIMING.nibbleLeadMax;

  private fish: FishSpecies | null = null;
  private water: WaterProfile = waterProfile(0);
  private minigame: Minigame | null = null;
  private tutorial: TutorialOverlay | null = null;
  private tutorialOpen = false;
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
  private readonly outcomes: Array<Outcome | null> = new Array(
    CASTS_PER_SESSION,
  ).fill(null);
  private readonly catches: CatchRecord[] = [];
  private perfectCount = 0;

  constructor(game: Game) {
    super();
    this.game = game;

    this.scene = new LakeScene(game.assets);
    this.scene.onCastLanded = () => {
      this.game.audio.splash();
      if (this.luckZoneHit) this.scene.celebrateLuck();
    };
    this.addChild(this.scene);

    this.atmosphere.onThunder = () => this.game.audio.thunder();
    const palette = game.clock.palette;
    this.scene.tint = palette.tint;
    this.atmosphere.setWorld(palette, game.clock.weatherDef);
    this.addChild(this.atmosphere);

    this.inputCatcher = new Graphics();
    this.inputCatcher.eventMode = "static";
    this.inputCatcher.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.inputCatcher.on("pointerdown", (event) => {
      this.trackPointer(event);
      // Right click is the final pull; the browser menu is suppressed.
      if (event.button === 2) return;
      const icon =
        this.phase === "fighting" && !this.paused && !this.tutorialOpen
          ? this.minigame?.landingIcon
          : null;
      if (icon) {
        const dx = this.pointerX - icon.x;
        const dy = this.pointerY - icon.y;
        if (Math.hypot(dx, dy) <= 20) {
          this.tapLanding = true;
          this.tapIconX = icon.x;
          this.tapIconY = icon.y;
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

    this.buildHud();
    this.addChild(this.hud);
    this.addChild(this.fx);
    // Purely visual layers (minigame frame, floaters) must never intercept
    // pointer events meant for the input catcher.
    this.fx.eventMode = "none";
    this.buildPause();
    this.addChild(this.pauseOverlay);
    this.game.app.canvas.addEventListener(
      "contextmenu",
      this.handleContextMenu,
    );

    this.setStatus(CAST_LABEL);
    this.updateHud();
  }

  // -------------------------------------------------------------------- HUD

  private buildHud(): void {
    const bar = new Graphics();
    bar.rect(0, 0, VIEW.width, 24).fill({ color: C.ink, alpha: 0.82 });
    bar.rect(0, 23, VIEW.width, 1).fill({ color: C.steel, alpha: 0.45 });
    bar.eventMode = "none";
    this.hud.addChild(bar);

    const scoreLabel = makeText("ОЧКИ", { size: 7, color: C.steelPale });
    scoreLabel.position.set(8, 8);
    scoreLabel.eventMode = "none";
    this.hud.addChild(scoreLabel);

    this.scoreValue = makeText("0", {
      size: 16,
      weight: 800,
      color: C.cream,
    });
    this.scoreValue.position.set(36, 3);
    this.scoreValue.eventMode = "none";
    this.hud.addChild(this.scoreValue);

    this.castInfo.position.set(HUD_INFO_LEFT, 0);
    this.castInfo.eventMode = "none";
    this.hud.addChild(this.castInfo);

    this.castLabel = makeText("ЗАБРОС 0/10", {
      size: 7,
      color: C.steelPale,
      letterSpacing: 0.5,
    });
    this.castLabel.position.set(HUD_ATTEMPT_START, 2);
    this.castInfo.addChild(this.castLabel);

    this.castInfo.addChild(this.dots);

    this.comboText = makeText("СЕРИЯ 0", {
      size: 7,
      weight: 700,
      color: C.steelPale,
      align: "right",
      letterSpacing: 0.5,
    });
    this.comboText.position.set(HUD_ATTEMPT_START + HUD_ATTEMPT_SPAN, 2);
    this.castInfo.addChild(this.comboText);
    this.hud.addChild(this.perfectPips);
    this.perfectPips.eventMode = "none";

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

    this.statusText = makeText(CAST_LABEL, {
      size: 10,
      weight: 700,
      color: C.cream,
      align: "center",
    });
    this.statusText.anchor.set(0.5, 0);
    this.statusText.position.set(SCENE.anglerX, 126);
    this.statusText.style.stroke = { color: C.ink, width: 2.5 };
    this.statusText.eventMode = "none";
    this.hud.addChild(this.statusText);

    this.powerLabel = makeText("СИЛА", {
      size: 8,
      color: C.steelPale,
      align: "right",
      letterSpacing: 0.5,
    });
    this.powerLabel.style.stroke = { color: C.ink, width: 2.5 };
    this.powerLabel.position.set(166, 205);
    this.powerLabel.visible = false;
    this.powerLabel.eventMode = "none";
    this.hud.addChild(this.powerLabel);
    this.powerBar.eventMode = "none";
    this.hud.addChild(this.powerBar);

    this.biteText = makeText("КЛЮЁТ! ЖМИ!", {
      size: 19,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    this.biteText.position.set(240, 126);
    this.biteText.style.stroke = { color: C.ink, width: 4 };
    this.biteText.visible = false;
    this.biteText.eventMode = "none";
    this.hud.addChild(this.biteText);
    this.reactionBar.eventMode = "none";
    this.hud.addChild(this.reactionBar);
  }

  private updateHud(): void {
    if (this.displayScore === this.score) {
      setText(this.scoreValue, formatScore(this.displayScore));
    }
    if (this.combo > 0) {
      const next = comboMultiplier(this.combo);
      setText(this.comboText, `Серия ${this.combo} (x${next})`);
      this.comboText.style.fill = C.gold;
    } else {
      setText(this.comboText, "Серия 0");
      this.comboText.style.fill = C.steelPale;
    }
    setText(this.castLabel, `ЗАБРОС ${this.castsUsed}/${CASTS_PER_SESSION}`);
    this.drawDots();
  }

  private drawDots(): void {
    const g = this.dots;
    g.clear();
    // Centre the attempt dots inside the cast/combo block so the two-row
    // header group reads as one centred unit.
    const startX = HUD_ATTEMPT_START;
    for (let i = 0; i < CASTS_PER_SESSION; i += 1) {
      const x = startX + i * 10;
      const y = 12;
      const outcome = this.outcomes[i];
      g.rect(x, y, 6, 6).fill({ color: 0x232a44 });
      if (outcome === "caught") g.rect(x + 1, y + 1, 4, 4).fill(C.gold);
      else if (outcome === "lost") g.rect(x + 1, y + 1, 4, 4).fill(C.red);
      const current = i === this.castsUsed - 1 && outcome === null;
      g.rect(x, y, 6, 6).stroke({
        width: 1,
        color: current ? C.cream : C.steel,
        alpha: current ? 0.9 : 0.35,
        alignment: 0,
      });
    }
  }

  private updatePerfectPips(): void {
    const g = this.perfectPips;
    const active = this.phase === "fighting" && this.minigame !== null;
    g.visible = active;
    if (!active) {
      g.clear();
      return;
    }

    const left = this.minigame!.slipsLeft;
    const x = HUD_INFO_RIGHT + 8;
    const y = 8;
    g.clear();
    for (let i = 0; i < 2; i += 1) {
      const px = x + i * 9;
      g.rect(px, y, 7, 7).fill({ color: C.ink, alpha: 0.8 });
      if (i < left) {
        g.rect(px + 1, y + 1, 5, 5).fill(C.cyan);
        g.rect(px + 1, y + 1, 5, 1).fill({ color: C.cream, alpha: 0.8 });
      } else {
        g.rect(px + 1, y + 1, 5, 5).fill({ color: C.steel, alpha: 0.35 });
      }
    }
  }

  private setStatus(text: string, color: number = C.cream): void {
    setText(this.statusText, text);
    this.statusText.style.fill = color;
    this.statusText.visible = true;
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
    blocker.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.pauseOverlay.addChild(blocker);

    const panel = new Graphics();
    drawPanel(panel, 130, 56, 220, 180, {
      fill: C.panel,
      alpha: 0.98,
      shadow: true,
    });
    this.pauseOverlay.addChild(panel);

    const title = makeText("ПАУЗА", {
      size: 18,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 2,
    });
    title.position.set(240, 68);
    this.pauseOverlay.addChild(title);

    const resume = new Button({
      label: "ПРОДОЛЖИТЬ",
      width: 170,
      height: 24,
      variant: "primary",
      size: 11,
      onClick: () => this.closePause(),
    });
    resume.position.set(155, 98);
    this.pauseOverlay.addChild(resume);

    const restart = new Button({
      label: "ЗАНОВО",
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
      label: "В МЕНЮ",
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
    return this.game.muted ? "ЗВУК: ВЫКЛ" : "ЗВУК: ВКЛ";
  }

  private openPause(): void {
    if (this.paused || this.finished) return;
    this.paused = true;
    this.pressed = false;
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
    if (this.paused || this.finished || this.tutorialOpen) return;
    if (this.phase === "idle") {
      this.phase = "charging";
      this.charge = 0;
      this.chargeDir = 1;
      this.chargeSoundTimer = 0;
      this.luckZoneHit = false;
      this.luckBandCenter = randRange(LUCK_BAND.min, LUCK_BAND.max);
      this.setStatus("ОТПУСТИ — ЗАБРОС");
    } else if (this.phase === "waiting") {
      this.earlyHook();
    } else if (this.phase === "bite") {
      // The player just pressed on the bite prompt — hook immediately. The
      // fight starts with no strike held, so landing stays a deliberate press.
      this.pressed = true;
      this.hookFish();
    } else if (this.phase === "fighting") {
      this.pressed = true;
      this.minigame?.setHold(true);
    }
    // No skip during the resolve phase: the player must watch the caught
    // fish land — there is nothing to skip past once it is over.
  }

  private pressEnd(): void {
    this.pressed = false;
    if (this.phase === "charging") this.doCast();
    this.minigame?.setHold(false);
  }

  /** Final pull: RMB/F on desktop, the hook hit area on touch. */
  private finalPull(): void {
    if (
      this.phase !== "fighting" ||
      this.paused ||
      this.finished ||
      this.tutorialOpen
    ) {
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
    this.setStatus(WAIT_LABEL);
    this.updateHud();
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
    this.phase = "bite";
    this.biteWindow = Math.max(0.62, 0.95 - fish.speed * 0.25);
    this.biteTimer = this.biteWindow;
    this.scene.showBite();
    this.game.audio.bite();
    this.biteText.visible = true;
    this.biteText.scale.set(1);
    this.setStatus("КЛЮЁТ! ЖМИ!", C.gold);
    // The big prompt above the angler already carries this moment; hide the
    // bottom duplicate so the bite reads as a single focal beat.
    this.statusText.visible = false;
  }

  private hookFish(): void {
    if (!this.fish || this.phase !== "bite") return;
    this.phase = "fighting";
    this.biteText.visible = false;
    this.reactionBar.clear();
    this.scene.setFight();
    this.game.audio.hook();
    this.reelTimer = 0;
    this.statusText.visible = false;
    this.pullKeys.clear();

    const minigame = new Minigame(
      this.fish,
      this.game.assets.fish[this.fish.id],
      {
        anchor: this.scene.castPoint,
        wildness: this.water.wildness,
        onWarn: () => this.game.audio.warn(),
        onCounter: () => this.game.audio.counter(),
        onReady: () => this.game.audio.ready(),
        onResist: () => this.game.audio.resist(),
        onGripOut: () => this.game.audio.gripOut(),
      },
    );
    this.fx.addChild(minigame);
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
    this.updatePerfectPips();

    // The first fight pauses for a short illustrated tutorial.
    if (!this.game.settings.tutorialSeen) this.openTutorial();
  }

  private openTutorial(): void {
    if (this.tutorialOpen) return;
    this.tutorialOpen = true;
    this.pressed = false;
    this.minigame?.setHold(false);
    const tutorial = new TutorialOverlay();
    tutorial.onClose = () => {
      this.game.settings.tutorialSeen = true;
      this.tutorialOpen = false;
      this.tutorial = null;
      this.minigame?.setHold(this.pressed);
    };
    this.tutorial = tutorial;
    this.addChild(tutorial);
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
      "РАНО!",
      SCENE.anglerX,
      SCENE.anglerY - 94,
      C.red,
      12,
      1.2,
      -24,
    );
    this.setStatus("РАНО! РЫБА УШЛА", C.red);
    this.updateHud();
  }

  /** The fish inspected the bait and moved on; the cast is not wasted. */
  private passBy(): void {
    this.refundCast();
    this.phase = "resolve";
    this.resolveTimer = SPOOK_HOLD * 0.85;
    this.pressed = false;
    this.scene.escapeFish();
    this.game.audio.nibble();
    this.addFloater(
      "МИМО",
      SCENE.anglerX,
      SCENE.anglerY - 94,
      C.steelPale,
      11,
      1.1,
      -20,
    );
    this.setStatus("РЫБА ПРОШЛА МИМО", C.steelPale);
    this.updateHud();
  }

  private refundCast(): void {
    if (this.castsUsed <= 0) return;
    this.outcomes[this.castsUsed - 1] = null;
    this.castsUsed -= 1;
    this.castsLeft = CASTS_PER_SESSION - this.castsUsed;
  }

  private resolveFight(result: MinigameResult): void {
    if (this.phase !== "fighting" || !this.fish) return;
    const fish = this.fish;

    if (!result.won) {
      this.failCast("СОРВАЛАСЬ…");
      return;
    }

    const multiplier = comboMultiplier(this.combo);
    const perfect = result.perfect;
    const points = Math.round(
      fish.points * multiplier * (perfect ? PERFECT_MULTIPLIER : 1),
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
      multiplier,
    };
    this.catches.push(record);
    this.outcomes[this.castsUsed - 1] = "caught";

    this.phase = "resolve";
    this.resolveTimer = TIMING.resultHold;
    this.pressed = false;
    this.pullKeys.clear();
    this.biteText.visible = false;
    this.reactionBar.clear();
    this.powerBar.clear();
    this.powerLabel.visible = false;

    if (this.minigame) {
      this.minigame.visible = false;
      this.minigame.setHold(false);
    }
    this.updatePerfectPips();
    this.scene.catchFish(this.game.assets.fish[fish.id]);
    this.game.audio.catchFish(perfect);
    this.showCatchFeedback(record);
    this.setStatus(
      perfect ? "ИДЕАЛЬНЫЙ УЛОВ!" : "ХОРОШИЙ УЛОВ!",
      perfect ? C.yellow : C.green,
    );
    this.updateHud();
  }

  private failCast(reason: string): void {
    if (this.finished) return;
    const brokenStreak = this.combo;
    this.phase = "resolve";
    this.resolveTimer = TIMING.escapedHold;
    this.combo = 0;
    this.luck = 0;
    if (this.castsUsed > 0) this.outcomes[this.castsUsed - 1] = "lost";
    this.pressed = false;
    this.pullKeys.clear();
    this.reelTimer = 0;
    this.scene.escapeFish();
    this.game.audio.escape();
    if (brokenStreak >= 2) this.game.audio.comboBreak();
    if (this.minigame) this.minigame.visible = false;
    this.updatePerfectPips();
    this.biteText.visible = false;
    this.reactionBar.clear();
    this.powerBar.clear();
    this.powerLabel.visible = false;
    this.addFloater(
      reason.replace("…", ""),
      SCENE.anglerX,
      SCENE.anglerY - 94,
      C.red,
      12,
      1.3,
      -24,
    );
    this.setStatus(
      brokenStreak >= 2 ? `СЕРИЯ ${brokenStreak} ПРЕРВАНА` : reason,
      C.red,
    );
    this.updateHud();
  }

  private advanceCast(): void {
    if (this.finished) return;
    if (this.minigame) {
      this.fx.removeChild(this.minigame);
      this.minigame.destroy({ children: true });
      this.minigame = null;
    }
    this.updatePerfectPips();
    this.fish = null;
    this.biteText.visible = false;
    this.reactionBar.clear();
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
    this.setStatus(
      this.castsLeft === 1 ? "ПОСЛЕДНИЙ ЗАБРОС" : CAST_LABEL,
      this.castsLeft === 1 ? C.gold : C.cream,
    );
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
    const name = this.game.options.playerName || "Рыбак";
    this.game.clock.persist();
    const standing = this.game.submitScore(name, result);
    this.game.showResults(result, true, standing);
  }

  // ------------------------------------------------------------------- FX

  private showCatchFeedback(record: CatchRecord): void {
    const ax = SCENE.anglerX;
    const ay = SCENE.anglerY;
    const multiplier = record.multiplier > 1 ? ` ×${record.multiplier}` : "";
    const perfect = record.perfect ? " · ИДЕАЛЬНО" : "";

    this.addFloater(
      `${record.name.toUpperCase()}  +${record.points}${multiplier}${perfect}`,
      ax,
      ay - 94,
      record.perfect ? C.yellow : C.gold,
      13,
      1.6,
      -14,
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
  ): void {
    const text = makeText(value, {
      size,
      weight: 800,
      color,
      align: "center",
    });
    text.anchor.set(0.5, 1);
    text.position.set(x, y);
    text.style.stroke = { color: C.ink, width: 2 };
    this.fx.addChild(text);
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
        this.fx.removeChild(floater.text);
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
      return;
    }
    this.powerLabel.visible = true;

    const x = 172;
    const y = 204;
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

  private drawBiteBar(): void {
    const g = this.reactionBar;
    g.clear();
    if (this.phase !== "bite") return;
    const x = 196;
    const y = 148;
    const width = 88;
    const height = 4;
    const fraction = clamp(this.biteTimer / this.biteWindow);
    g.rect(x - 1, y - 1, width + 2, height + 2).fill(C.ink);
    g.rect(x, y, width, height).fill(0x232a44);
    g.rect(x, y, Math.round(width * fraction), height).fill(
      fraction > 0.4 ? C.gold : C.red,
    );
  }

  private updateWaitingStatus(): void {
    const dots = Math.floor(this.time * 2) % 4;
    setText(this.statusText, `${WAIT_LABEL}${".".repeat(dots)}`);
  }

  /** Cursor position in virtual screen units, not canvas pixels. */
  private trackPointer(event: FederatedPointerEvent): void {
    const point = event.getLocalPosition(this);
    this.pointerX = point.x;
    this.pointerY = point.y;
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
    this.atmosphere.setWorld(palette, clock.weatherDef);
    this.atmosphere.update(dt);

    this.scene.update(dt);
    this.updateFloaters(dt);
    this.updateScore(dt);
    this.updatePerfectPips();

    if (this.tutorialOpen) return;

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
      this.updateWaitingStatus();
      if (this.waitTimer <= this.nibbleLead && !this.nibblePlayed) {
        this.nibblePlayed = true;
        this.scene.showNibble();
        this.game.audio.nibble();
      }
      if (this.waitTimer <= 0) this.beginBite();
    } else if (this.phase === "bite") {
      this.biteTimer -= dt;
      this.drawBiteBar();
      this.biteText.scale.set(1 + Math.abs(Math.sin(this.time * 12)) * 0.05);
      if (this.biteTimer <= 0) {
        this.failCast("НЕ УСПЕЛ ПОДСЕЧЬ");
      }
    } else if (this.phase === "fighting") {
      const direction = this.readPullDirection();
      this.minigame?.setPointer(this.pointerX, this.pointerY);
      this.minigame?.setDirection(direction.x, direction.y);
      this.minigame?.setHold(this.pressed);
      this.minigame?.update(dt);
      if (this.minigame) {
        const point = this.minigame.fishPoint;
        const velocity = this.minigame.fishVelocity;
        this.scene.setFightFish(point.x, point.y, velocity.x, velocity.y);
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
      this.biteText.visible = false;
      if (this.resolveTimer <= 0) this.advanceCast();
    }

    this.drawDots();
  }

  // ------------------------------------------------------------------ input

  override handleKey(event: KeyboardEvent): boolean {
    if (this.tutorialOpen && this.tutorial) {
      return this.tutorial.handleKey(event);
    }
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
