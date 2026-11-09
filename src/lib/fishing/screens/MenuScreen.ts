import { Graphics } from "pixi.js";
import type { Game } from "../Game";
import { C, VIEW } from "../config";
import { formatScore } from "../utils";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { makeText } from "../ui/theme";

export class MenuScreen extends Screen {
  private readonly game: Game;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly buttons: Button[] = [];
  private readonly muteButton: Button;

  constructor(game: Game) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

    const glow = new Graphics();
    glow.rect(0, 0, VIEW.width, 104).fill({ color: C.ink, alpha: 0.35 });
    this.addChild(glow);

    const titleShadow = makeText("ТИХАЯ ЗАВОДЬ", {
      size: 40,
      weight: 800,
      color: C.ink,
      align: "center",
    });
    titleShadow.position.set(242, 30);
    this.addChild(titleShadow);

    const title = makeText("ТИХАЯ ЗАВОДЬ", {
      size: 40,
      weight: 800,
      color: C.cream,
      align: "center",
    });
    title.position.set(240, 28);
    this.addChild(title);

    const wave = new Graphics();
    wave.rect(150, 76, 180, 1).fill({ color: C.steel, alpha: 0.7 });
    wave.rect(170, 78, 140, 1).fill({ color: C.steel, alpha: 0.35 });
    this.addChild(wave);

    const personal = game.leaderboard.personalBest();
    const bestLine = personal
      ? `ЛУЧШИЙ УЛОВ: ${formatScore(personal.score)} · ${personal.name.toUpperCase()}`
      : "ЛУЧШИЙ УЛОВ: ПОКА ПУСТО";
    const best = makeText(bestLine, {
      size: 9,
      color: C.steelPale,
      align: "center",
    });
    best.position.set(240, 84);
    this.addChild(best);

    const hasExit = game.options.onExit !== undefined;
    const labels = ["ИГРАТЬ", "КАК ИГРАТЬ", "ЛИДЕРЫ"];
    const actions: Array<() => void> = [
      () => game.startGame(),
      () => game.showHelp(),
      () => game.showLeaderboard(),
    ];

    const gap = 5;
    const buttonHeight = 23;
    let y = 102;

    for (let i = 0; i < labels.length; i += 1) {
      const button = new Button({
        label: labels[i],
        width: 196,
        height: buttonHeight,
        variant: i === 0 ? "primary" : "secondary",
        size: 12,
        onClick: actions[i],
      });
      button.position.set(142, y);
      this.addChild(button);
      this.buttons.push(button);
      y += buttonHeight + gap;
    }

    this.muteButton = new Button({
      label: this.muteLabel(),
      width: 196,
      height: buttonHeight,
      size: 12,
      onClick: () => {
        game.toggleMute();
        this.muteButton.setLabel(this.muteLabel());
      },
    });
    this.muteButton.position.set(142, y);
    this.addChild(this.muteButton);
    this.buttons.push(this.muteButton);
    y += buttonHeight + gap;

    if (hasExit) {
      const exit = new Button({
        label: "ВЫХОД",
        width: 196,
        height: buttonHeight,
        variant: "ghost",
        size: 12,
        onClick: () => game.exit(),
      });
      exit.position.set(142, y);
      this.addChild(exit);
      this.buttons.push(exit);
    }

    this.focus.setItems(this.buttons);
    this.focus.onMove = () => game.audio.hover();
  }

  private muteLabel(): string {
    return this.game.muted ? "ЗВУК: ВЫКЛ" : "ЗВУК: ВКЛ";
  }

  override onEnter(): void {
    this.focus.focus(0);
  }

  override onExit(): void {
    this.focus.blur();
  }

  override onMuteChanged(): void {
    this.muteButton.setLabel(this.muteLabel());
  }

  override update(dt: number): void {
    this.backdrop.update(dt);
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape") return true;
    return this.focus.handleKey(event);
  }
}
