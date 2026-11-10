import { Graphics, Sprite } from "pixi.js";
import type { Game } from "../Game";
import { C } from "../config";
import type { LeaderboardStanding, SessionResult } from "../types";
import { formatMultiplier, formatScore } from "../utils";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { drawPanel, makeText } from "../ui/theme";

export class ResultsScreen extends Screen {
  private readonly game: Game;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly buttons: Button[] = [];

  constructor(
    game: Game,
    result: SessionResult,
    standing?: LeaderboardStanding,
  ) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

    const panel = new Graphics();
    drawPanel(panel, 40, 22, 400, 226, {
      fill: C.panel,
      alpha: 0.96,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText("УЛОВ ГОТОВ", {
      size: 18,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(240, 30);
    this.addChild(title);

    const rank = standing?.rank ?? game.leaderboard.previewRank(result.score);
    const qualifies = standing?.inTop ?? rank <= 10;
    const rankText = qualifies
      ? `ТЫ В ТОП-10 · МЕСТО ${rank}`
      : `МЕСТО ${rank} · ДО ТОП-10 НЕ ХВАТИЛО`;
    const rankLine = makeText(rankText, {
      size: 10,
      weight: 700,
      color: qualifies ? C.cyan : C.steelPale,
      align: "center",
      letterSpacing: 0.5,
    });
    rankLine.position.set(240, 52);
    this.addChild(rankLine);

    const scoreLabel = makeText("ОЧКИ", {
      size: 8,
      color: C.steelPale,
      align: "center",
      letterSpacing: 1,
    });
    scoreLabel.position.set(240, 70);
    this.addChild(scoreLabel);

    const score = makeText(formatScore(result.score), {
      size: 34,
      weight: 800,
      color: C.yellow,
      align: "center",
    });
    score.position.set(240, 78);
    this.addChild(score);

    if (result.bestFish) {
      const texture = game.assets.fish[result.bestFish.fishId];
      if (texture) {
        const icon = new Sprite(texture);
        icon.anchor.set(0.5);
        icon.scale.set(2);
        icon.position.set(346, 94);
        this.addChild(icon);
        const name = makeText(result.bestFish.name.toUpperCase(), {
          size: 8,
          color: C.steelPale,
          align: "center",
        });
        name.position.set(346, 110);
        this.addChild(name);
      }
    }

    const rule = new Graphics();
    rule.rect(64, 122, 352, 1).fill({ color: C.steel, alpha: 0.45 });
    this.addChild(rule);

    const stats: Array<[string, string, number, number]> = [
      ["ПОЙМАНО", `${result.caught}/${result.casts}`, 64, 134],
      ["ИДЕАЛЬНЫХ", `${result.perfect}`, 248, 134],
      [
        "ЛУЧШАЯ",
        result.bestFish
          ? `${result.bestFish.name} +${result.bestFish.points}`
          : "—",
        64,
        152,
      ],
      [
        "СЕРИЯ",
        `${result.bestStreak} · ${formatMultiplier(result.bestMultiplier)}`,
        248,
        152,
      ],
    ];
    for (const [label, value, x, y] of stats) {
      const key = makeText(label, {
        size: 9,
        color: C.steelPale,
        weight: 600,
      });
      key.position.set(x, y);
      this.addChild(key);

      const val = makeText(value, {
        size: 9.5,
        color: C.cream,
        weight: 600,
      });
      val.position.set(x + 82, y);
      this.addChild(val);
    }

    if (result.catches.length > 0) {
      const total = result.catches.length;
      const spacing = 18;
      const startX = 240 - ((total - 1) * spacing) / 2;
      result.catches.forEach((record, index) => {
        const texture = game.assets.fish[record.fishId];
        if (!texture) return;
        const icon = new Sprite(texture);
        icon.anchor.set(0.5);
        icon.position.set(startX + index * spacing, 174);
        icon.scale.set(record.perfect ? 1.2 : 1);
        if (record.perfect) icon.tint = C.yellow;
        this.addChild(icon);
      });
    } else {
      const empty = makeText("СЕГОДНЯ БЕЗ РЫБЫ", {
        size: 9,
        color: C.steelPale,
        align: "center",
      });
      empty.position.set(240, 170);
      this.addChild(empty);
    }

    const again = new Button({
      label: "ЕЩЁ РАЗ",
      width: 136,
      height: 24,
      variant: "primary",
      size: 11,
      onClick: () => game.startGame(),
    });
    again.position.set(98, 196);
    this.addChild(again);
    this.buttons.push(again);

    const menu = new Button({
      label: "В МЕНЮ",
      width: 136,
      height: 24,
      size: 11,
      onClick: () => game.showMenu(),
    });
    menu.position.set(246, 196);
    this.addChild(menu);
    this.buttons.push(menu);

    this.focus.setItems(this.buttons);
    this.focus.onMove = () => game.audio.hover();
  }

  override onEnter(): void {
    this.focus.focus(0);
  }

  override onExit(): void {
    this.focus.blur();
  }

  override update(dt: number): void {
    this.backdrop.update(dt);
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
