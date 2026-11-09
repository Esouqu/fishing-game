import { Graphics } from "pixi.js";
import type { Game, LeaderboardViewOptions } from "../Game";
import { C } from "../config";
import { formatScore } from "../utils";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { drawPanel, makeText } from "../ui/theme";

export class LeaderboardScreen extends Screen {
  private readonly game: Game;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly view: LeaderboardViewOptions;
  private readonly resetButton: Button;
  private readonly bottomButtons: Button[] = [];
  private resetArmed = false;
  private resetTimer = 0;

  constructor(game: Game, view: LeaderboardViewOptions = {}) {
    super();
    this.game = game;
    this.view = view;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

    const panel = new Graphics();
    drawPanel(panel, 24, 16, 432, 238, {
      fill: C.panel,
      alpha: 0.95,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText("ТАБЛИЦА ЛИДЕРОВ", {
      size: 17,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(240, 25);
    this.addChild(title);

    const subtitle = makeText("ТОП-10 · ЛОКАЛЬНЫЙ РЕЙТИНГ", {
      size: 8,
      color: C.steelPale,
      align: "center",
      letterSpacing: 0.5,
    });
    subtitle.position.set(240, 45);
    this.addChild(subtitle);

    const header = new Graphics();
    header.rect(36, 70, 408, 1).fill({ color: C.steel, alpha: 0.6 });
    this.addChild(header);

    this.addColumnLabel("#", 42, 58, "left");
    this.addColumnLabel("ИМЯ", 64, 58, "left");
    this.addColumnLabel("УЛОВ", 352, 58, "right");
    this.addColumnLabel("ОЧКИ", 440, 58, "right");

    const entries = game.leaderboard.top();
    const highlightId = view.highlightId;
    const rowHeight = 13;
    const startY = 78;

    entries.forEach((entry, index) => {
      const rowY = startY + index * rowHeight;
      const highlighted = entry.id === highlightId;

      if (highlighted) {
        const highlight = new Graphics();
        highlight
          .rect(34, rowY - 1, 412, rowHeight)
          .fill({ color: C.gold, alpha: 0.16 });
        highlight.rect(34, rowY - 1, 2, rowHeight).fill(C.gold);
        this.addChild(highlight);
      } else if (index % 2 === 0) {
        const stripe = new Graphics();
        stripe
          .rect(34, rowY - 1, 412, rowHeight)
          .fill({ color: C.steel, alpha: 0.07 });
        this.addChild(stripe);
      }

      const rankColor =
        index === 0
          ? C.gold
          : index === 1
            ? C.white
            : index === 2
              ? C.brownLight
              : C.steelPale;
      const color = highlighted ? C.gold : C.cream;

      const rank = makeText(`${index + 1}`, {
        size: 10,
        weight: 700,
        color: rankColor,
      });
      rank.position.set(42, rowY);
      this.addChild(rank);

      const name = makeText(entry.name.slice(0, 16), {
        size: 10,
        weight: highlighted ? 700 : 500,
        color,
      });
      name.position.set(64, rowY);
      this.addChild(name);

      if (entry.bot) {
        const bot = makeText("СОПЕРНИК", {
          size: 6,
          color: C.steelPale,
          letterSpacing: 0.5,
        });
        bot.position.set(190, rowY + 3);
        bot.alpha = 0.6;
        this.addChild(bot);
      }

      const caught = makeText(`${entry.caught}/10`, {
        size: 9,
        color: highlighted ? C.cream : C.steelPale,
        align: "right",
      });
      caught.position.set(352, rowY + 1);
      this.addChild(caught);

      const score = makeText(formatScore(entry.score), {
        size: 11,
        weight: 700,
        color: highlighted ? C.gold : C.yellow,
        align: "right",
      });
      score.position.set(440, rowY - 1);
      this.addChild(score);
    });

    if (entries.length === 0) {
      const empty = makeText("ПОКА НИКОГО НЕТ", {
        size: 12,
        color: C.steelPale,
        align: "center",
      });
      empty.position.set(240, 130);
      this.addChild(empty);
    }

    this.resetButton = new Button({
      label: "СБРОС",
      width: 58,
      height: 16,
      size: 8,
      onClick: () => this.handleReset(),
    });
    this.resetButton.position.set(382, 22);
    this.addChild(this.resetButton);

    if (view.from === "result") {
      const again = new Button({
        label: "ЕЩЁ РАЗ",
        width: 118,
        height: 21,
        variant: "primary",
        size: 11,
        onClick: () => game.startGame(),
      });
      again.position.set(112, 222);
      this.addChild(again);
      this.bottomButtons.push(again);

      const menu = new Button({
        label: "В МЕНЮ",
        width: 118,
        height: 21,
        size: 11,
        onClick: () => game.showMenu(),
      });
      menu.position.set(250, 222);
      this.addChild(menu);
      this.bottomButtons.push(menu);
    } else {
      const back = new Button({
        label: "НАЗАД",
        width: 128,
        height: 21,
        variant: "primary",
        size: 11,
        onClick: () => game.showMenu(),
      });
      back.position.set(176, 222);
      this.addChild(back);
      this.bottomButtons.push(back);
    }

    this.focus.setItems([...this.bottomButtons, this.resetButton]);
    this.focus.onMove = () => game.audio.hover();
  }

  private addColumnLabel(
    label: string,
    x: number,
    y: number,
    align: "left" | "right",
  ): void {
    const text = makeText(label, {
      size: 8,
      color: C.steelPale,
      weight: 600,
      align,
      letterSpacing: 1,
    });
    text.position.set(x, y);
    this.addChild(text);
  }

  private handleReset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.resetTimer = 2.2;
      this.resetButton.setLabel("ТОЧНО?");
      return;
    }
    this.resetArmed = false;
    this.resetTimer = 0;
    this.game.leaderboard.reset();
    this.game.audio.back();
    this.game.showLeaderboard({ from: this.view.from });
  }

  override onEnter(): void {
    this.focus.focus(0);
  }

  override onExit(): void {
    this.focus.blur();
  }

  override update(dt: number): void {
    this.backdrop.update(dt);
    if (this.resetArmed) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) {
        this.resetArmed = false;
        this.resetButton.setLabel("СБРОС");
      }
    }
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape" || event.code === "Backspace") {
      this.game.audio.back();
      this.game.showMenu();
      return true;
    }
    return this.focus.handleKey(event);
  }
}
