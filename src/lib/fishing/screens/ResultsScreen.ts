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
import { TEXT } from "../texts";
import { formatWeight } from "../fishWeight";

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
    this.backdrop = new Backdrop(game.assets, game.clock);
    this.addChild(this.backdrop);

    const panel = new Graphics();
    drawPanel(panel, 32, 17, 416, 236, {
      fill: C.panel,
      alpha: 0.96,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText(TEXT.results.title, {
      size: 20,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(240, 26);
    this.addChild(title);

    const rank = standing?.rank ?? game.leaderboard.previewRank(result.score);
    const qualifies = standing?.inTop ?? rank <= 10;
    const rankText = qualifies
      ? TEXT.results.top10(rank)
      : TEXT.results.outsideTop10(rank);
    const rankLine = makeText(rankText, {
      size: 9,
      weight: 700,
      color: qualifies ? C.cyan : C.steelPale,
      align: "center",
      letterSpacing: 0.5,
    });
    rankLine.position.set(240, 50);
    this.addChild(rankLine);

    const divider = new Graphics();
    divider.rect(56, 66, 368, 1).fill({
      color: C.brownDark,
      alpha: 0.6,
    });
    divider.rect(56, 66, 64, 1).fill({ color: C.gold, alpha: 0.65 });
    this.addChild(divider);

    // Score is the headline number, aligned to the left content column.
    const scoreLabel = makeText(TEXT.common.score, {
      size: 8,
      color: C.steelPale,
      letterSpacing: 1,
    });
    scoreLabel.position.set(64, 80);
    this.addChild(scoreLabel);

    const score = makeText(formatScore(result.score), {
      size: 30,
      weight: 800,
      color: C.yellow,
    });
    score.position.set(64, 87);
    this.addChild(score);

    const underline = new Graphics();
    underline.rect(64, 122, 140, 1).fill({
      color: C.gold,
      alpha: 0.55,
    });
    this.addChild(underline);

    const stats: Array<{
      label: string;
      value: string;
      x: number;
      size?: number;
    }> = [
      {
        label: TEXT.results.caught,
        value: TEXT.results.caughtValue(result.caught, result.casts),
        x: 64,
      },
      {
        label: TEXT.results.perfectLabel,
        value: `${result.perfect}`,
        x: 140,
      },
      {
        label: TEXT.results.streak,
        value: TEXT.results.streakValue(
          result.bestStreak,
          formatMultiplier(result.bestMultiplier),
        ),
        x: 216,
        size: 9,
      },
    ];
    for (const stat of stats) {
      const label = makeText(stat.label, {
        size: 7,
        color: C.steelPale,
        letterSpacing: 0.4,
      });
      label.position.set(stat.x, 134);
      this.addChild(label);

      const value = makeText(stat.value, {
        size: stat.size ?? 10,
        color: C.cream,
        weight: 700,
      });
      value.position.set(stat.x, 145);
      this.addChild(value);
    }

    // Best-catch card lives in its own framed column, so long fish names
    // cannot collide with the session stats.
    const bestCard = new Graphics();
    drawPanel(bestCard, 270, 78, 162, 86, {
      fill: C.ink,
      alpha: 0.36,
      shadow: false,
    });
    this.addChild(bestCard);

    const bestLabel = makeText(TEXT.results.bestCatch, {
      size: 7,
      color: C.gold,
      align: "center",
      letterSpacing: 0.6,
    });
    bestLabel.position.set(351, 86);
    this.addChild(bestLabel);

    if (result.bestFish) {
      const texture = game.assets.fish[result.bestFish.fishId];
      if (texture) {
        const icon = new Sprite(texture);
        icon.anchor.set(0.5);
        icon.scale.set(1.8);
        icon.position.set(351, 112);
        this.addChild(icon);
      }

      const name = makeText(result.bestFish.name.toUpperCase(), {
        size: 8,
        color: C.cream,
        align: "center",
      });
      name.position.set(351, 132);
      this.addChild(name);

      const weight = makeText(
        `${TEXT.results.weight} ${formatWeight(result.bestFish.weightKg)} ${TEXT.common.kg}`,
        {
          size: 7,
          color: C.cyan,
          align: "center",
        },
      );
      weight.position.set(351, 143);
      this.addChild(weight);

      const points = makeText(`+${formatScore(result.bestFish.points)}`, {
        size: 9,
        color: C.gold,
        weight: 700,
        align: "center",
      });
      points.position.set(351, 154);
      this.addChild(points);
    } else {
      const empty = makeText(TEXT.common.dash, {
        size: 12,
        color: C.steelPale,
        align: "center",
      });
      empty.position.set(351, 118);
      this.addChild(empty);
    }

    const catchRule = new Graphics();
    catchRule.rect(56, 176, 368, 1).fill({
      color: C.brownDark,
      alpha: 0.55,
    });
    catchRule.rect(56, 176, 44, 1).fill({ color: C.gold, alpha: 0.5 });
    this.addChild(catchRule);

    const catchLabel = makeText(TEXT.results.catchStrip, {
      size: 7,
      color: C.steelPale,
      letterSpacing: 0.8,
    });
    catchLabel.position.set(64, 184);
    this.addChild(catchLabel);

    if (result.catches.length > 0) {
      const total = result.catches.length;
      const spacing = 18;
      const startX = 240 - ((total - 1) * spacing) / 2;
      result.catches.forEach((record, index) => {
        const texture = game.assets.fish[record.fishId];
        if (!texture) return;
        const icon = new Sprite(texture);
        icon.anchor.set(0.5);
        icon.position.set(startX + index * spacing, 196);
        icon.scale.set(record.perfect ? 1.2 : 1);
        if (record.perfect) icon.tint = C.yellow;
        this.addChild(icon);
      });
    } else {
      const empty = makeText(TEXT.results.empty, {
        size: 8,
        color: C.steelPale,
        align: "center",
      });
      empty.position.set(240, 195);
      this.addChild(empty);
    }

    const again = new Button({
      label: TEXT.common.again,
      width: 168,
      height: 24,
      variant: "primary",
      size: 11,
      onClick: () => game.startGame(),
    });
    again.position.set(64, 214);
    this.addChild(again);
    this.buttons.push(again);

    const menu = new Button({
      label: TEXT.common.menu,
      width: 168,
      height: 24,
      size: 11,
      onClick: () => game.showMenu(),
    });
    menu.position.set(248, 214);
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
