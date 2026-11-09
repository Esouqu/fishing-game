import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import type { Game } from "../Game";
import {
  C,
  CASTS_PER_SESSION,
  CHEST_BONUS,
  CHEST_CHANCE,
  DEFAULT_WATER_ZONE,
  FISH,
  PERFECT_MULTIPLIER,
  TIMING,
  VIEW,
  WATER_ZONE_MARKERS,
  comboMultiplier,
  zoneForPower,
  type FishSpecies,
  type WaterZone,
} from "../config";
import type { CatchRecord, SessionResult } from "../types";
import {
  chance,
  clamp,
  formatMultiplier,
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
import { Minigame, type MinigameResult } from "../game/Minigame";

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
const WAIT_LABEL = "ЖДЁМ ПОКЛЁВКИ";
const FIGHT_LABEL = "УДЕРЖИВАЙ — ЗОНА ВВЕРХ";

export class GameScreen extends Screen {
  private readonly game: Game;
  private readonly scene: LakeScene;
  private readonly hud = new Container();
  private readonly fx = new Container();
  private readonly fightDim = new Graphics();
  private readonly inputCatcher: Graphics;
  private readonly dots = new Graphics();
  private readonly powerBar = new Graphics();
  private readonly reactionBar = new Graphics();

  private scoreValue!: Text;
  private castLabel!: Text;
  private comboText!: Text;
  private statusText!: Text;
  private biteText!: Text;
  private powerLabel!: Text;
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

  private fish: FishSpecies | null = null;
  private castZone: WaterZone = DEFAULT_WATER_ZONE;
  private minigame: Minigame | null = null;
  private catchCard: Container | null = null;
  private cardTimer = 0;
  private cardAge = 0;
  private chestSoundTimer = -1;
  private readonly floaters: Floater[] = [];

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
    this.scene.onCastLanded = () => this.game.audio.splash();
    this.addChild(this.scene);

    this.inputCatcher = new Graphics();
    this.inputCatcher.eventMode = "static";
    this.inputCatcher.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.inputCatcher.on("pointerdown", () => this.pressStart());
    this.inputCatcher.on("pointerup", () => this.pressEnd());
    this.inputCatcher.on("pointerupoutside", () => this.pressEnd());
    this.inputCatcher.on("pointercancel", () => this.pressEnd());
    this.addChild(this.inputCatcher);

    this.fightDim
      .rect(0, 0, VIEW.width, VIEW.height)
      .fill({ color: C.ink, alpha: 0.28 });
    this.fightDim.eventMode = "none";
    this.fightDim.visible = false;
    this.addChild(this.fightDim);

    this.buildHud();
    this.addChild(this.hud);
    this.addChild(this.fx);
    this.buildPause();
    this.addChild(this.pauseOverlay);

    this.setStatus(CAST_LABEL);
    this.updateHud();
  }

  // -------------------------------------------------------------------- HUD

  private buildHud(): void {
    const bar = new Graphics();
    bar.rect(0, 0, VIEW.width, 24).fill({ color: C.ink, alpha: 0.82 });
    bar.rect(0, 23, VIEW.width, 1).fill({ color: C.steel, alpha: 0.45 });
    this.hud.addChild(bar);

    const scoreLabel = makeText("ОЧКИ", { size: 7, color: C.steelPale });
    scoreLabel.position.set(8, 8);
    this.hud.addChild(scoreLabel);

    this.scoreValue = makeText("0", {
      size: 16,
      weight: 800,
      color: C.cream,
    });
    this.scoreValue.position.set(36, 3);
    this.hud.addChild(this.scoreValue);

    this.castLabel = makeText("ЗАБРОС 0/10", {
      size: 7,
      color: C.steelPale,
      letterSpacing: 0.5,
    });
    this.castLabel.position.set(120, 2);
    this.hud.addChild(this.castLabel);

    this.hud.addChild(this.dots);

    this.comboText = makeText("КОМБО —", {
      size: 10,
      weight: 700,
      color: C.steelPale,
      align: "center",
    });
    this.comboText.position.set(248, 6);
    this.hud.addChild(this.comboText);

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
    this.statusText.position.set(240, 238);
    this.statusText.style.stroke = { color: C.ink, width: 2.5 };
    this.hud.addChild(this.statusText);

    this.powerLabel = makeText("СИЛА", {
      size: 8,
      color: C.steelPale,
      align: "right",
      letterSpacing: 0.5,
    });
    this.powerLabel.style.stroke = { color: C.ink, width: 2.5 };
    this.powerLabel.position.set(166, 251);
    this.powerLabel.visible = false;
    this.hud.addChild(this.powerLabel);
    this.hud.addChild(this.powerBar);

    this.biteText = makeText("КЛЮЁТ! ЖМИ!", {
      size: 19,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    this.biteText.position.set(240, 38);
    this.biteText.style.stroke = { color: C.ink, width: 4 };
    this.biteText.visible = false;
    this.hud.addChild(this.biteText);
    this.hud.addChild(this.reactionBar);
  }

  private updateHud(): void {
    if (this.displayScore === this.score) {
      setText(this.scoreValue, formatScore(this.displayScore));
    }
    if (this.combo > 0) {
      const next = comboMultiplier(this.combo);
      setText(
        this.comboText,
        `СЕРИЯ ${this.combo} → ${formatMultiplier(next)}`,
      );
      this.comboText.style.fill = C.gold;
    } else {
      setText(this.comboText, "КОМБО —");
      this.comboText.style.fill = C.steelPale;
    }
    setText(this.castLabel, `ЗАБРОС ${this.castsUsed}/${CASTS_PER_SESSION}`);
    this.drawDots();
  }

  private drawDots(): void {
    const g = this.dots;
    g.clear();
    for (let i = 0; i < CASTS_PER_SESSION; i += 1) {
      const x = 128 + i * 10;
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

  private setStatus(text: string, color: number = C.cream): void {
    setText(this.statusText, text);
    this.statusText.style.fill = color;
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
      variant: "ghost",
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
      this.charge = 0;
      this.chargeDir = 1;
      this.chargeSoundTimer = 0;
      this.setStatus("ОТПУСТИ — ЗАБРОС");
    } else if (this.phase === "bite") {
      this.hookFish();
    } else if (this.phase === "fighting") {
      this.pressed = true;
      this.minigame?.setHold(true);
    } else if (this.phase === "resolve") {
      this.resolveTimer = Math.min(this.resolveTimer, 0.2);
    }
  }

  private pressEnd(): void {
    this.pressed = false;
    if (this.phase === "charging") this.doCast();
    this.minigame?.setHold(false);
  }

  private doCast(): void {
    if (this.phase !== "charging") return;
    this.phase = "waiting";
    this.castsUsed += 1;
    this.castsLeft -= 1;
    this.charge = clamp(this.charge);
    this.castZone = zoneForPower(this.charge);
    this.scene.setCastPreview(null);
    this.game.audio.cast();
    this.scene.playCast(this.charge);
    this.waitTimer = randRange(1.1, 3.1) - this.charge * 0.12;
    this.chargeSoundTimer = 0;
    this.reelTimer = 0;
    this.nibblePlayed = false;
    this.powerBar.clear();
    this.powerLabel.visible = false;
    this.setStatus(WAIT_LABEL);
    this.updateHud();
  }

  private pickFish(): FishSpecies {
    const progress = this.castsUsed / CASTS_PER_SESSION;
    return pickWeighted(FISH, (fish) => {
      const rarity = fish.points / 400;
      const zoneFactor = lerp(
        this.castZone.commonFactor,
        this.castZone.rareFactor,
        rarity,
      );
      return fish.weight * (1 + rarity * (0.5 + progress * 1.6)) * zoneFactor;
    });
  }

  private beginBite(): void {
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
  }

  private hookFish(): void {
    if (!this.fish || this.phase !== "bite") return;
    this.phase = "fighting";
    this.biteText.visible = false;
    this.reactionBar.clear();
    this.scene.setFight();
    this.game.audio.hook();
    this.fightDim.visible = true;
    this.reelTimer = 0;
    this.setStatus(FIGHT_LABEL, C.cream);

    const minigame = new Minigame(
      this.fish,
      this.game.assets.fish[this.fish.id],
    );
    minigame.position.set(352, 38);
    this.fx.addChild(minigame);
    minigame.onFinish = (result) => this.resolveFight(result);
    minigame.setHold(this.pressed);
    this.minigame = minigame;
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
    const chest = chance(CHEST_CHANCE);

    this.combo += 1;
    this.bestStreak = Math.max(this.bestStreak, this.combo);
    this.bestMultiplier = Math.max(this.bestMultiplier, multiplier);
    this.score += points;
    this.scorePunch = 0.22;
    if (perfect) this.perfectCount += 1;

    const record: CatchRecord = {
      fishId: fish.id,
      name: fish.name,
      latin: fish.latin,
      points,
      perfect,
      multiplier,
      chest,
    };
    this.catches.push(record);
    this.outcomes[this.castsUsed - 1] = "caught";

    if (chest) {
      this.score += CHEST_BONUS;
      this.scorePunch = 0.22;
      this.scene.showChest();
      this.chestSoundTimer = 0.4;
    }

    this.phase = "resolve";
    this.resolveTimer = TIMING.resultHold;
    this.pressed = false;
    this.fightDim.visible = false;
    this.biteText.visible = false;
    this.reactionBar.clear();
    this.powerBar.clear();
    this.powerLabel.visible = false;

    if (this.minigame) {
      this.minigame.visible = false;
      this.minigame.setHold(false);
    }
    this.scene.catchFish(this.game.assets.fish[fish.id]);
    this.game.audio.catchFish(perfect);

    const bobber = this.scene.bobberPosition;
    this.addFloater(`+${points}`, bobber.x, bobber.y - 14, C.gold, 16);
    this.showCatchCard(record);
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
    if (this.castsUsed > 0) this.outcomes[this.castsUsed - 1] = "lost";
    this.pressed = false;
    this.fightDim.visible = false;
    this.reelTimer = 0;
    this.scene.escapeFish();
    this.game.audio.escape();
    if (brokenStreak >= 2) this.game.audio.comboBreak();
    if (this.minigame) this.minigame.visible = false;
    this.biteText.visible = false;
    this.reactionBar.clear();
    this.powerBar.clear();
    this.powerLabel.visible = false;
    const bobber = this.scene.bobberPosition;
    this.addFloater(
      reason.replace("…", ""),
      bobber.x,
      bobber.y - 14,
      C.red,
      12,
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
    this.clearCatchCard();
    this.fish = null;
    this.biteText.visible = false;
    this.reactionBar.clear();
    this.scene.resetCast();
    this.fightDim.visible = false;
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
    this.game.showResults(result);
  }

  // ------------------------------------------------------------------- FX

  private showCatchCard(record: CatchRecord): void {
    this.clearCatchCard();

    const card = new Container();
    card.position.set(240, 96);

    const panel = new Graphics();
    drawPanel(panel, -100, -32, 200, 64, {
      fill: C.panel,
      alpha: 0.96,
      shadow: true,
    });
    card.addChild(panel);

    const texture = this.game.assets.fish[record.fishId];
    if (texture) {
      const icon = new Sprite(texture);
      icon.anchor.set(0.5);
      icon.scale.set(2);
      icon.position.set(-74, 2);
      card.addChild(icon);
    }

    const name = makeText(record.name.toUpperCase(), {
      size: 13,
      weight: 800,
      color: C.cream,
    });
    name.position.set(-48, -24);
    card.addChild(name);

    const points = makeText(`+${record.points}`, {
      size: 16,
      weight: 800,
      color: C.yellow,
      align: "right",
    });
    points.position.set(92, -24);
    card.addChild(points);

    const parts: string[] = [];
    if (record.multiplier > 1) parts.push(`КОМБО ×${record.multiplier}`);
    if (record.perfect) parts.push("ИДЕАЛЬНО ×1.5");
    if (record.chest) parts.push(`СУНДУК +${CHEST_BONUS}`);
    if (parts.length === 0) parts.push(record.latin.toUpperCase());

    const subtitle = makeText(parts.join(" · "), {
      size: 8,
      weight: 600,
      color: record.chest ? C.gold : record.perfect ? C.cyan : C.steelPale,
    });
    subtitle.position.set(-48, 0);
    card.addChild(subtitle);

    this.fx.addChild(card);
    this.catchCard = card;
    this.cardTimer = 1.8;
    this.cardAge = 0;
  }

  private clearCatchCard(): void {
    if (!this.catchCard) return;
    this.fx.removeChild(this.catchCard);
    this.catchCard.destroy({ children: true });
    this.catchCard = null;
  }

  private updateCard(dt: number): void {
    if (!this.catchCard) return;
    this.cardTimer -= dt;
    this.cardAge += dt;
    const grow = Math.min(1, this.cardAge / 0.14);
    this.catchCard.scale.set(0.94 + grow * 0.06);
    this.catchCard.alpha =
      this.cardTimer < 0.35 ? Math.max(0, this.cardTimer / 0.35) : 1;
    if (this.cardTimer <= 0) this.clearCatchCard();
  }

  private addFloater(
    value: string,
    x: number,
    y: number,
    color: number,
    size = 14,
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
    this.floaters.push({ text, life: 1.1, maxLife: 1.1, vy: -28 });
  }

  private updateFloaters(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i];
      floater.life -= dt;
      floater.text.y += floater.vy * dt;
      floater.text.alpha = Math.max(0, floater.life / floater.maxLife);
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
    const zone = zoneForPower(this.charge);
    setText(this.powerLabel, `СИЛА · ${zone.name}`);
    this.powerLabel.style.fill = zone.color;

    const x = 172;
    const y = 250;
    const width = 136;
    const height = 8;
    g.rect(x - 1, y - 1, width + 2, height + 2).fill(C.ink);
    g.rect(x, y, width, height).fill(0x232a44);
    const fill = Math.round(width * this.charge);
    g.rect(x, y, fill, height).fill(zone.color);
    g.rect(x, y, fill, 2).fill({ color: C.cream, alpha: 0.45 });
    for (const marker of WATER_ZONE_MARKERS) {
      g.rect(x + Math.round(width * marker), y, 1, height).fill({
        color: C.cream,
        alpha: 0.45,
      });
    }
  }

  private drawBiteBar(): void {
    const g = this.reactionBar;
    g.clear();
    if (this.phase !== "bite") return;
    const x = 196;
    const y = 56;
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

  // ----------------------------------------------------------------- update

  override update(dt: number): void {
    if (this.paused) return;
    this.time += dt;

    this.scene.update(dt);
    this.updateFloaters(dt);
    this.updateCard(dt);
    this.updateScore(dt);

    if (this.chestSoundTimer > 0) {
      this.chestSoundTimer -= dt;
      if (this.chestSoundTimer <= 0) {
        this.game.audio.chest();
        this.chestSoundTimer = -1;
      }
    }

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
      this.scene.setCastPreview(this.charge);
    } else if (this.phase === "waiting") {
      this.waitTimer -= dt;
      this.updateWaitingStatus();
      if (this.waitTimer <= 0.55 && !this.nibblePlayed) {
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
      this.minigame?.setHold(this.pressed);
      this.minigame?.update(dt);
      if (this.pressed) {
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

  override onMuteChanged(): void {
    this.soundButton.setIcon((g) => drawSoundIcon(g, this.game.muted));
    this.pauseSoundButton.setLabel(this.muteLabel());
  }
}
