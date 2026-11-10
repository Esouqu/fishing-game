import { Graphics } from "pixi.js";
import type { Game } from "../Game";
import { C, VIEW } from "../config";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import {
  drawLeaderboardTable,
  leaderboardTableHeight,
} from "../ui/LeaderboardTable";
import { drawPanel, makeText } from "../ui/theme";

const PANEL_X = 228;
const PANEL_Y = 84;
const PANEL_W = 232;
const PANEL_H = 176;
const TABLE_X = PANEL_X + 12;
const TABLE_Y = 120;
const TABLE_W = PANEL_W - 24;
const TABLE_ROW_H = 12;
const TABLE_FONT = 9;

export class MenuScreen extends Screen {
  private readonly game: Game;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly buttons: Button[] = [];
  private muteButton!: Button;

  constructor(game: Game) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

    const glow = new Graphics();
    glow.rect(0, 0, VIEW.width, 96).fill({ color: C.ink, alpha: 0.32 });
    this.addChild(glow);

    const titleShadow = makeText("ТИХАЯ ЗАВОДЬ", {
      size: 34,
      weight: 800,
      color: C.ink,
      align: "center",
    });
    titleShadow.position.set(242, 20);
    this.addChild(titleShadow);

    const title = makeText("ТИХАЯ ЗАВОДЬ", {
      size: 34,
      weight: 800,
      color: C.cream,
      align: "center",
    });
    title.position.set(240, 18);
    this.addChild(title);

    const wave = new Graphics();
    wave.rect(150, 58, 180, 1).fill({ color: C.steel, alpha: 0.7 });
    wave.rect(170, 60, 140, 1).fill({ color: C.steel, alpha: 0.35 });
    this.addChild(wave);

    this.buildLeaderboard();
    this.buildActions();
  }

  private buildLeaderboard(): void {
    const personal = this.game.leaderboard.personalBest();
    const entries = this.game.leaderboard.top();
    const rows =
      personal && !entries.some((entry) => entry.id === personal.id)
        ? entries.length + 1
        : entries.length;
    const panelH = Math.max(
      PANEL_H,
      TABLE_Y -
        PANEL_Y +
        leaderboardTableHeight(rows, TABLE_ROW_H, TABLE_FONT) +
        10,
    );
    const panel = new Graphics();
    drawPanel(panel, PANEL_X, PANEL_Y, PANEL_W, panelH, {
      fill: C.panel,
      alpha: 0.92,
      shadow: true,
    });
    this.addChild(panel);

    const centerX = PANEL_X + PANEL_W / 2;
    const title = makeText("ЛИДЕРБОРД", {
      size: 13,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(centerX, PANEL_Y + 8);
    this.addChild(title);

    drawLeaderboardTable(this, entries, {
      x: TABLE_X,
      y: TABLE_Y,
      width: TABLE_W,
      rows,
      highlightId: personal?.id,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
    });

    // Sanity: keep the resized panel and table in sync.
    const needed =
      TABLE_Y - PANEL_Y + leaderboardTableHeight(rows, TABLE_ROW_H, TABLE_FONT);
    if (needed > panelH - 8) {
      console.warn("[fishing] menu leaderboard overflows its panel", needed);
    }
  }

  private buildActions(): void {
    const labels = ["ИГРАТЬ", "КАК ИГРАТЬ"];
    const actions: Array<() => void> = [
      () => this.game.startGame(),
      () => this.game.showHelp(),
    ];

    const gap = 8;
    const buttonHeight = 28;
    const x = 28;
    const width = 190;
    // Start the stack flush with the leaderboard panel top.
    let y = PANEL_Y;

    for (let i = 0; i < labels.length; i += 1) {
      const button = new Button({
        label: labels[i],
        width,
        height: buttonHeight,
        variant: i === 0 ? "primary" : "secondary",
        size: 12,
        onClick: actions[i],
      });
      button.position.set(x, y);
      this.addChild(button);
      this.buttons.push(button);
      y += buttonHeight + gap;
    }

    this.muteButton = new Button({
      label: this.muteLabel(),
      width,
      height: buttonHeight,
      size: 12,
      onClick: () => {
        this.game.toggleMute();
        this.muteButton.setLabel(this.muteLabel());
      },
    });
    this.muteButton.position.set(x, y);
    this.addChild(this.muteButton);
    this.buttons.push(this.muteButton);
    y += buttonHeight + gap;

    const hasExit = this.game.options.onExit !== undefined;
    if (hasExit) {
      const exit = new Button({
        label: "ВЫХОД",
        width,
        height: buttonHeight,
        size: 12,
        onClick: () => this.game.exit(),
      });
      exit.position.set(x, y);
      this.addChild(exit);
      this.buttons.push(exit);
    }

    this.focus.setItems(this.buttons);
    this.focus.onMove = () => this.game.audio.hover();
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
