import { Container, Graphics } from "pixi.js";
import type { Game } from "../Game";
import { C, VIEW } from "../config";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { drawLeaderboardTable } from "../ui/LeaderboardTable";
import { drawPanel, makeText } from "../ui/theme";
import { clamp } from "../utils";

const BOARD_PANEL_W = 160;
const BOARD_PANEL_H = 176;
const BOARD_X = VIEW.width - BOARD_PANEL_W - 10;
const BOARD_Y = VIEW.height - BOARD_PANEL_H - 10;
const BOARD_TITLE_X = BOARD_X + BOARD_PANEL_W / 2;
const BOARD_TITLE_Y = BOARD_Y + 8;
const BOARD_TABLE_X = BOARD_X + 12;
const BOARD_TABLE_W = BOARD_PANEL_W - 24;
const BOARD_TABLE_Y = BOARD_Y + 36;
const TABLE_ROW_H = 12;
const TABLE_FONT = 9;

export class MenuScreen extends Screen {
  private readonly game: Game;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly buttons: Button[] = [];
  private muteButton!: Button;

  private readonly leaderboardViewport = new Container();
  private readonly leaderboardContent = new Container();
  private readonly leaderboardMask = new Graphics();
  private leaderboardScroll = 0;
  private leaderboardMaxScroll = 0;

  constructor(game: Game) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

    const glow = new Graphics();
    glow.rect(0, 0, VIEW.width, 96).fill({ color: C.ink, alpha: 0.32 });
    this.addChild(glow);

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

    this.leaderboardViewport.eventMode = "none";
    this.addChild(this.leaderboardViewport);

    const panel = new Graphics();
    drawPanel(panel, BOARD_X, BOARD_Y, BOARD_PANEL_W, BOARD_PANEL_H, {
      fill: C.panel,
      alpha: 0.92,
      shadow: true,
    });
    this.leaderboardViewport.addChild(panel);

    this.leaderboardContent.eventMode = "none";
    this.leaderboardViewport.addChild(this.leaderboardContent);
    this.leaderboardContent.mask = this.leaderboardMask;
    this.leaderboardMask.eventMode = "none";
    this.leaderboardMask
      .rect(BOARD_X, BOARD_Y, BOARD_PANEL_W, BOARD_PANEL_H)
      .fill(0xff000000);

    const title = makeText("ЛИДЕРБОРД", {
      size: 13,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(BOARD_TITLE_X, BOARD_TITLE_Y);
    this.leaderboardContent.addChild(title);

    const tableHeight = drawLeaderboardTable(this.leaderboardContent, entries, {
      x: BOARD_TABLE_X,
      y: BOARD_TABLE_Y,
      width: BOARD_TABLE_W,
      rows,
      highlightId: personal?.id,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
    });
    this.leaderboardMaxScroll = Math.max(0, tableHeight - BOARD_PANEL_H);
    this.applyLeaderboardScroll();
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

    const title = makeText("ТИХАЯ ЗАВОДЬ", {
      size: 34,
      weight: 800,
      color: C.cream,
      align: "center",
    });
    title.position.set(123, 100);
    this.addChild(title);

    let y = 149;
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

  private applyLeaderboardScroll(): void {
    this.leaderboardContent.position.y = -this.leaderboardScroll;
  }

  override handleWheel(event: WheelEvent): void {
    if (this.leaderboardMaxScroll <= 0) return;
    this.leaderboardScroll = clamp(
      this.leaderboardScroll + event.deltaY * 0.05,
      0,
      this.leaderboardMaxScroll,
    );
    this.applyLeaderboardScroll();
  }

  private muteLabel(): string {
    return this.game.muted ? "ЗВУК: ВЫКЛ" : "ЗВУК: ВКЛ";
  }

  override onEnter(): void {
    this.leaderboardScroll = 0;
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
