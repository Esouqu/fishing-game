import { Container, Graphics } from "pixi.js";
import type { Game } from "../Game";
import { C, VIEW } from "../config";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import {
  drawLeaderboardTable,
  drawLeaderboardRow,
} from "../ui/LeaderboardTable";
import { makeText } from "../ui/theme";
import { clamp } from "../utils";
import type { LeaderboardEntry } from "../types";

const MARGIN = 20;
const PANEL_X = MARGIN;
const PANEL_Y = MARGIN;
const PANEL_W = 264;
const PANEL_H = 230;
const PAD = 16;

const BOARD_W = 160;
const BOARD_H = PANEL_H;
const BOARD_X = VIEW.width - MARGIN - BOARD_W;
const BOARD_Y = MARGIN;
const BOARD_TABLE_X = BOARD_X + 12;
const BOARD_TABLE_Y = BOARD_Y + 48;
const BOARD_TABLE_W = BOARD_W - 24;
const TABLE_ROW_H = 13;
const TABLE_FONT = 9;

/** Rounded panel used by both menu columns. */
function drawMenuPanel(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
): void {
  g.roundRect(x + 3, y + 4, width, height, 8).fill({
    color: C.ink,
    alpha: 0.32,
  });
  g.roundRect(x, y, width, height, 8).fill({ color: C.panel, alpha });
  g.roundRect(x + 0.5, y + 0.5, width - 1, height - 1, 8).stroke({
    width: 1,
    color: C.ink,
    alignment: 0,
  });
  g.roundRect(x + 1.5, y + 1.5, width - 3, height - 3, 7).stroke({
    width: 1,
    color: C.steel,
    alpha: 0.22,
    alignment: 0,
  });
  g.roundRect(x + 10, y + 1.5, width - 20, 1, 0.5).fill({
    color: C.cream,
    alpha: 0.14,
  });
}

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
  private leaderboardVisibleH = 0;
  private leaderboardThumb: Graphics | null = null;
  private thumbTrackY = 0;
  private thumbTrackH = 0;
  private pinnedRow: Container | null = null;
  private pinnedRowIndex = -1;

  constructor(game: Game) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

    this.buildActions();
    this.buildLeaderboard();
  }

  private buildActions(): void {
    const panel = new Graphics();
    drawMenuPanel(panel, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 0.86);
    this.addChild(panel);

    const left = PANEL_X + PAD;
    const width = PANEL_W - PAD * 2;

    const title = makeText("ТИХАЯ ЗАВОДЬ", {
      size: 36,
      weight: 800,
      color: C.cream,
      letterSpacing: 0.5,
    });
    title.position.set(left, PANEL_Y + 18);
    this.addChild(title);

    // One short gold stroke reads as a water ripple under the wordmark.
    const ripple = new Graphics();
    ripple.rect(left, PANEL_Y + 68, 64, 3).fill(C.gold);
    ripple.rect(left + 70, PANEL_Y + 69, 18, 1).fill({
      color: C.gold,
      alpha: 0.55,
    });
    ripple.rect(left + 94, PANEL_Y + 69, 7, 1).fill({
      color: C.gold,
      alpha: 0.3,
    });
    this.addChild(ripple);

    const gap = 9;
    const primaryH = 34;
    const secondaryH = 28;
    const stackH = primaryH + gap + secondaryH + gap + secondaryH;
    let y = PANEL_Y + PANEL_H - PAD - stackH;

    const play = new Button({
      label: "ИГРАТЬ",
      width,
      height: primaryH,
      variant: "primary",
      size: 14,
      onClick: () => this.game.startGame(),
    });
    play.position.set(left, y);
    this.addChild(play);
    this.buttons.push(play);
    y += primaryH + gap;

    const help = new Button({
      label: "КАК ИГРАТЬ",
      width,
      height: secondaryH,
      variant: "secondary",
      size: 12,
      onClick: () => this.game.showHelp(),
    });
    help.position.set(left, y);
    this.addChild(help);
    this.buttons.push(help);
    y += secondaryH + gap;

    const hasExit = this.game.options.onExit !== undefined;
    const smallW = hasExit ? Math.floor((width - 8) / 2) : width;

    this.muteButton = new Button({
      label: this.muteLabel(),
      width: smallW,
      height: secondaryH,
      size: hasExit ? 10 : 12,
      onClick: () => {
        this.game.toggleMute();
        this.muteButton.setLabel(this.muteLabel());
      },
    });
    this.muteButton.position.set(left, y);
    this.addChild(this.muteButton);
    this.buttons.push(this.muteButton);

    if (hasExit) {
      const exit = new Button({
        label: "ВЫХОД",
        width: smallW,
        height: secondaryH,
        size: 10,
        onClick: () => this.game.exit(),
      });
      exit.position.set(left + smallW + 8, y);
      this.addChild(exit);
      this.buttons.push(exit);
    }

    this.focus.setItems(this.buttons);
    this.focus.onMove = () => this.game.audio.hover();
  }

  private buildLeaderboard(): void {
    const personal = this.game.leaderboard.personalBest();
    const entries = this.game.leaderboard.top();
    const rows =
      personal && !entries.some((entry) => entry.id === personal.id)
        ? entries.length + 1
        : entries.length;

    const panel = new Graphics();
    drawMenuPanel(panel, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 0.9);
    this.addChild(panel);

    const title = makeText("ЛИДЕРБОРД", {
      size: 12,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 0.8,
    });
    title.position.set(BOARD_X + BOARD_W / 2, BOARD_Y + 12);
    this.addChild(title);

    // Column header stays put while the rows scroll beneath it.
    const headerH = TABLE_FONT + 4;
    drawLeaderboardTable(this, [], {
      x: BOARD_TABLE_X,
      y: BOARD_TABLE_Y,
      width: BOARD_TABLE_W,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
    });

    // Clip rows on a row boundary: a half-row would peek under the frame.
    const available = BOARD_H - (BOARD_TABLE_Y - BOARD_Y) - 8;
    const visibleH =
      Math.floor((available - headerH) / TABLE_ROW_H) * TABLE_ROW_H;
    this.leaderboardViewport.eventMode = "none";
    this.addChild(this.leaderboardViewport);

    this.leaderboardContent.eventMode = "none";
    this.leaderboardViewport.addChild(this.leaderboardContent);

    this.leaderboardMask.eventMode = "none";
    this.leaderboardMask
      .rect(BOARD_X, BOARD_TABLE_Y + headerH, BOARD_W, visibleH)
      .fill(0xffffff);
    this.leaderboardViewport.addChild(this.leaderboardMask);
    this.leaderboardContent.mask = this.leaderboardMask;

    const tableHeight = drawLeaderboardTable(this.leaderboardContent, entries, {
      x: BOARD_TABLE_X,
      y: BOARD_TABLE_Y + headerH,
      width: BOARD_TABLE_W,
      rows,
      highlightId: personal?.id,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
      showHeader: false,
    });
    this.leaderboardMaxScroll = Math.max(0, tableHeight - visibleH);
    this.leaderboardVisibleH = visibleH;
    this.thumbTrackY = BOARD_TABLE_Y + headerH;
    this.thumbTrackH = visibleH;

    if (personal) {
      const index = this.game.leaderboard
        .all()
        .findIndex((entry) => entry.id === personal.id);
      if (index >= 0) this.buildPinnedRow(personal, index, headerH, visibleH);
    }

    if (this.leaderboardMaxScroll > 0) {
      const track = new Graphics();
      track
        .rect(BOARD_X + BOARD_W - 6, this.thumbTrackY, 2, visibleH)
        .fill({ color: C.ink, alpha: 0.35 });
      this.addChild(track);

      this.leaderboardThumb = new Graphics();
      this.leaderboardThumb.eventMode = "none";
      this.addChild(this.leaderboardThumb);
    }
    this.applyLeaderboardScroll();
  }

  private buildPinnedRow(
    entry: LeaderboardEntry,
    index: number,
    headerH: number,
    visibleH: number,
  ): void {
    const y = BOARD_TABLE_Y + headerH + visibleH - TABLE_ROW_H;
    const pinned = new Container();
    pinned.eventMode = "none";

    const cover = new Graphics();
    cover
      .rect(BOARD_X + 2, y - 2, BOARD_W - 4, TABLE_ROW_H + 2)
      .fill({ color: C.panel, alpha: 0.98 });
    pinned.addChild(cover);

    drawLeaderboardRow(pinned, entry, {
      x: BOARD_TABLE_X,
      y,
      width: BOARD_TABLE_W,
      rank: index + 1,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
      highlighted: true,
    });

    const divider = new Graphics();
    divider
      .rect(BOARD_X + 8, y - 2, BOARD_W - 16, 1)
      .fill({ color: C.gold, alpha: 0.5 });
    pinned.addChild(divider);

    this.addChild(pinned);
    this.pinnedRow = pinned;
    this.pinnedRowIndex = index;
  }

  private updatePinnedRow(): void {
    if (!this.pinnedRow) return;
    const rowTop = this.pinnedRowIndex * TABLE_ROW_H;
    const rowBottom = rowTop + TABLE_ROW_H;
    const top = this.leaderboardScroll;
    const bottom = top + this.leaderboardVisibleH;
    this.pinnedRow.visible = !(rowBottom > top && rowTop < bottom);
  }

  private applyLeaderboardScroll(): void {
    this.leaderboardContent.position.y = -this.leaderboardScroll;
    this.updatePinnedRow();

    const thumb = this.leaderboardThumb;
    if (thumb === null) return;
    const total = this.thumbTrackH + this.leaderboardMaxScroll;
    const height = Math.max(18, (this.thumbTrackH * this.thumbTrackH) / total);
    const progress =
      this.leaderboardMaxScroll > 0
        ? this.leaderboardScroll / this.leaderboardMaxScroll
        : 0;
    thumb.clear();
    thumb
      .rect(
        BOARD_X + BOARD_W - 6,
        this.thumbTrackY + (this.thumbTrackH - height) * progress,
        2,
        height,
      )
      .fill({ color: C.steelPale, alpha: 0.5 });
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
    this.applyLeaderboardScroll();
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
