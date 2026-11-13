import {
  Container,
  Graphics,
  Rectangle,
  type FederatedPointerEvent,
} from "pixi.js";
import type { Game, LeaderboardViewOptions } from "../Game";
import { C } from "../config";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import {
  drawLeaderboardRow,
  drawLeaderboardTable,
} from "../ui/LeaderboardTable";
import { drawPanel, makeText } from "../ui/theme";
import { TEXT } from "../texts";
import { CURSORS } from "../cursors";
import { clamp } from "../utils";
import type { LeaderboardEntry } from "../types";

const PANEL_X = 100;
const PANEL_Y = 12;
const PANEL_W = 280;
const PANEL_H = 216;
const TABLE_X = PANEL_X + 12;
const TABLE_Y = 54;
const TABLE_W = PANEL_W - 24;
const TABLE_ROW_H = 13;
const TABLE_FONT = 10;

export class LeaderboardScreen extends Screen {
  private readonly game: Game;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly view: LeaderboardViewOptions;
  private readonly resetButton: Button;
  private readonly bottomButtons: Button[] = [];
  private resetArmed = false;
  private resetTimer = 0;

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
  private thumbHeight = 0;
  private scrollDragging = false;

  constructor(game: Game, view: LeaderboardViewOptions = {}) {
    super();
    this.game = game;
    this.view = view;
    this.backdrop = new Backdrop(game.assets, game.clock);
    this.addChild(this.backdrop);

    const panel = new Graphics();
    drawPanel(panel, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, {
      fill: C.panel,
      alpha: 0.95,
      shadow: true,
    });
    this.addChild(panel);

    const centerX = PANEL_X + PANEL_W / 2;
    const title = makeText(TEXT.leaderboard.title, {
      size: 16,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(centerX, PANEL_Y + 8);
    this.addChild(title);

    const entries = game.leaderboard.all();
    const personal = game.leaderboard.personalBest();
    const personalIndex = personal
      ? entries.findIndex((entry) => entry.id === personal.id)
      : -1;
    const hasPersonal = personal !== null && personalIndex >= 0;
    const subtitle = makeText(TEXT.leaderboard.subtitle(entries.length), {
      size: 8,
      color: C.steelPale,
      align: "center",
      letterSpacing: 0.5,
    });
    subtitle.position.set(centerX, PANEL_Y + 26);
    this.addChild(subtitle);

    const headerH = TABLE_FONT + 4;
    drawLeaderboardTable(this, [], {
      x: TABLE_X,
      y: TABLE_Y,
      width: TABLE_W,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
    });

    // One row is reserved for the pinned player row, so the scroll area can
    // reach every place without the pin covering the last one.
    const available = PANEL_Y + PANEL_H - 2 - TABLE_Y;
    const baseVisibleH =
      Math.floor((available - headerH) / TABLE_ROW_H) * TABLE_ROW_H;
    const visibleH = hasPersonal ? baseVisibleH - TABLE_ROW_H : baseVisibleH;
    this.leaderboardViewport.eventMode = "none";
    this.addChild(this.leaderboardViewport);

    this.leaderboardContent.eventMode = "none";
    this.leaderboardViewport.addChild(this.leaderboardContent);

    this.leaderboardMask.eventMode = "none";
    this.leaderboardMask
      .rect(PANEL_X, TABLE_Y + headerH, PANEL_W, visibleH)
      .fill(0xffffff);
    this.leaderboardViewport.addChild(this.leaderboardMask);
    this.leaderboardContent.mask = this.leaderboardMask;

    const tableHeight = drawLeaderboardTable(this.leaderboardContent, entries, {
      x: TABLE_X,
      y: TABLE_Y + headerH,
      width: TABLE_W,
      highlightId: view.highlightId ?? personal?.id,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
      showHeader: false,
    });
    this.leaderboardMaxScroll = Math.max(0, tableHeight - visibleH);
    this.leaderboardVisibleH = visibleH;
    this.thumbTrackY = TABLE_Y + headerH;
    this.thumbTrackH = visibleH;

    if (hasPersonal && personal) {
      this.buildPinnedRow(personal, personalIndex, headerH, visibleH);
    }

    if (this.leaderboardMaxScroll > 0) {
      const track = new Graphics();
      track
        .rect(PANEL_X + PANEL_W - 7, this.thumbTrackY, 2, visibleH)
        .fill({ color: C.ink, alpha: 0.3 });
      this.addChild(track);

      this.leaderboardThumb = new Graphics();
      this.leaderboardThumb.eventMode = "none";
      this.addChild(this.leaderboardThumb);

      this.buildScrollbar(visibleH);
    }
    this.applyLeaderboardScroll();

    this.resetButton = new Button({
      label: TEXT.common.reset,
      width: 46,
      height: 15,
      size: 8,
      onClick: () => this.handleReset(),
    });
    this.resetButton.position.set(PANEL_X + PANEL_W - 56, PANEL_Y + 8);
    this.addChild(this.resetButton);

    if (view.from === "result") {
      const again = new Button({
        label: TEXT.common.again,
        width: 112,
        height: 22,
        variant: "primary",
        size: 11,
        onClick: () => game.startGame(),
      });
      again.position.set(122, 238);
      this.addChild(again);
      this.bottomButtons.push(again);

      const menu = new Button({
        label: TEXT.common.menu,
        width: 112,
        height: 22,
        size: 11,
        onClick: () => game.showMenu(),
      });
      menu.position.set(246, 238);
      this.addChild(menu);
      this.bottomButtons.push(menu);
    } else {
      const back = new Button({
        label: TEXT.common.back,
        width: 128,
        height: 22,
        variant: "primary",
        size: 11,
        onClick: () => game.showMenu(),
      });
      back.position.set(176, 238);
      this.addChild(back);
      this.bottomButtons.push(back);
    }

    this.focus.setItems([...this.bottomButtons, this.resetButton]);
    this.focus.onMove = () => game.audio.hover();
  }

  private buildPinnedRow(
    entry: LeaderboardEntry,
    index: number,
    headerH: number,
    visibleH: number,
  ): void {
    const y = TABLE_Y + headerH + visibleH;
    const pinned = new Container();
    pinned.eventMode = "none";

    const cover = new Graphics();
    cover
      .rect(PANEL_X + 2, y - 2, PANEL_W - 4, TABLE_ROW_H + 2)
      .fill({ color: C.panel, alpha: 0.98 });
    pinned.addChild(cover);

    drawLeaderboardRow(pinned, entry, {
      x: TABLE_X,
      y,
      width: TABLE_W,
      rank: index + 1,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
      highlighted: true,
    });

    const divider = new Graphics();
    divider
      .rect(PANEL_X + 8, y - 2, PANEL_W - 16, 1)
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

  private buildScrollbar(visibleH: number): void {
    const hit = new Graphics();
    hit.eventMode = "static";
    hit.cursor = CURSORS.default;
    hit.hitArea = new Rectangle(
      PANEL_X + PANEL_W - 13,
      this.thumbTrackY,
      15,
      visibleH,
    );
    hit.on("pointerdown", (event: FederatedPointerEvent) => {
      this.scrollDragging = true;
      this.scrollToPointer(event);
    });
    hit.on("globalpointermove", (event: FederatedPointerEvent) => {
      if (this.scrollDragging) this.scrollToPointer(event);
    });
    const end = (): void => {
      this.scrollDragging = false;
    };
    hit.on("pointerup", end);
    hit.on("pointerupoutside", end);
    this.addChild(hit);
  }

  private scrollToPointer(event: FederatedPointerEvent): void {
    const travel = this.thumbTrackH - this.thumbHeight;
    if (travel <= 0) return;
    const local = event.getLocalPosition(this);
    const ratio = clamp(
      (local.y - this.thumbTrackY - this.thumbHeight / 2) / travel,
      0,
      1,
    );
    this.leaderboardScroll = ratio * this.leaderboardMaxScroll;
    this.applyLeaderboardScroll();
  }

  private applyLeaderboardScroll(): void {
    this.leaderboardContent.position.y = -this.leaderboardScroll;
    this.updatePinnedRow();

    const thumb = this.leaderboardThumb;
    if (thumb === null) return;
    const total = this.thumbTrackH + this.leaderboardMaxScroll;
    this.thumbHeight = Math.max(
      16,
      (this.thumbTrackH * this.thumbTrackH) / total,
    );
    const progress =
      this.leaderboardMaxScroll > 0
        ? this.leaderboardScroll / this.leaderboardMaxScroll
        : 0;
    thumb.clear();
    thumb
      .rect(
        PANEL_X + PANEL_W - 7,
        this.thumbTrackY + (this.thumbTrackH - this.thumbHeight) * progress,
        2,
        this.thumbHeight,
      )
      .fill({ color: C.steel, alpha: 0.65 });
  }

  override handleWheel(event: WheelEvent): boolean {
    if (this.leaderboardMaxScroll <= 0) return false;
    this.leaderboardScroll = clamp(
      this.leaderboardScroll + event.deltaY * 0.05,
      0,
      this.leaderboardMaxScroll,
    );
    this.applyLeaderboardScroll();
    return true;
  }

  private handleReset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.resetTimer = 2.2;
      this.resetButton.setLabel(TEXT.common.resetConfirm);
      return;
    }
    this.resetArmed = false;
    this.resetTimer = 0;
    this.game.leaderboard.reset();
    this.game.audio.back();
    this.game.showLeaderboard({ from: this.view.from });
  }

  override onEnter(): void {
    this.leaderboardScroll = 0;
    this.applyLeaderboardScroll();
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
        this.resetButton.setLabel(TEXT.common.reset);
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
