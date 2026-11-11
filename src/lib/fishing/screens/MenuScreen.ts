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

const BLOCK_X = 12;
const BLOCK_Y = 12;
const BLOCK_W = 208;

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
  private leaderboardThumb: Graphics | null = null;
  private thumbTrackY = 0;
  private thumbTrackH = 0;

  constructor(game: Game) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

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

    const panel = new Graphics();
    drawPanel(panel, BOARD_X, BOARD_Y, BOARD_PANEL_W, BOARD_PANEL_H, {
      fill: C.panel,
      alpha: 0.92,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText("ЛИДЕРБОРД", {
      size: 13,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(BOARD_TITLE_X, BOARD_TITLE_Y);
    this.addChild(title);

    const visibleH = BOARD_PANEL_H - (BOARD_TABLE_Y - BOARD_Y) - 8;
    this.leaderboardViewport.eventMode = "none";
    this.addChild(this.leaderboardViewport);

    this.leaderboardContent.eventMode = "none";
    this.leaderboardViewport.addChild(this.leaderboardContent);

    this.leaderboardMask.eventMode = "none";
    this.leaderboardMask
      .rect(BOARD_X, BOARD_TABLE_Y, BOARD_PANEL_W, visibleH)
      .fill(0xff000000);
    this.leaderboardViewport.addChild(this.leaderboardMask);
    this.leaderboardContent.mask = this.leaderboardMask;

    const tableHeight = drawLeaderboardTable(this.leaderboardContent, entries, {
      x: BOARD_TABLE_X,
      y: BOARD_TABLE_Y,
      width: BOARD_TABLE_W,
      rows,
      highlightId: personal?.id,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
    });
    this.leaderboardMaxScroll = Math.max(0, tableHeight - visibleH);
    this.thumbTrackY = BOARD_TABLE_Y;
    this.thumbTrackH = visibleH;

    if (this.leaderboardMaxScroll > 0) {
      const track = new Graphics();
      track
        .rect(BOARD_X + BOARD_PANEL_W - 7, BOARD_TABLE_Y, 2, visibleH)
        .fill({ color: C.ink, alpha: 0.3 });
      this.addChild(track);

      this.leaderboardThumb = new Graphics();
      this.leaderboardThumb.eventMode = "none";
      this.addChild(this.leaderboardThumb);
    }
    this.applyLeaderboardScroll();
  }

  private buildActions(): void {
    const labels = ["ИГРАТЬ", "КАК ИГРАТЬ"];
    const actions: Array<() => void> = [
      () => this.game.startGame(),
      () => this.game.showHelp(),
    ];

    const pad = 12;
    const gap = 8;
    const buttonHeight = 28;
    const width = BLOCK_W - pad * 2;
    const x = BLOCK_X + pad;
    const hasExit = this.game.options.onExit !== undefined;
    const buttonCount = labels.length + 1 + (hasExit ? 1 : 0);
    const titleY = BLOCK_Y + pad + 11;
    const top = titleY + 20;

    // One block: title and buttons share a single framed panel.
    const block = new Graphics();
    drawPanel(
      block,
      BLOCK_X,
      BLOCK_Y,
      BLOCK_W,
      top -
        BLOCK_Y +
        buttonCount * buttonHeight +
        (buttonCount - 1) * gap +
        pad,
      { fill: C.panel, alpha: 0.9, shadow: true },
    );
    this.addChild(block);

    const title = makeText("ТИХАЯ ЗАВОДЬ", {
      size: 24,
      weight: 800,
      color: C.cream,
      align: "center",
      letterSpacing: 0.5,
    });
    title.position.set(BLOCK_X + BLOCK_W / 2, titleY);
    this.addChild(title);

    const divider = new Graphics();
    divider
      .rect(x, titleY + 13, width, 1)
      .fill({ color: C.steel, alpha: 0.25 });
    this.addChild(divider);

    let y = top;
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

    const thumb = this.leaderboardThumb;
    if (thumb === null) return;
    const total = this.thumbTrackH + this.leaderboardMaxScroll;
    const height = Math.max(16, (this.thumbTrackH * this.thumbTrackH) / total);
    const progress =
      this.leaderboardMaxScroll > 0
        ? this.leaderboardScroll / this.leaderboardMaxScroll
        : 0;
    thumb.clear();
    thumb
      .rect(
        BOARD_X + BOARD_PANEL_W - 7,
        this.thumbTrackY + (this.thumbTrackH - height) * progress,
        2,
        height,
      )
      .fill({ color: C.steel, alpha: 0.65 });
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
