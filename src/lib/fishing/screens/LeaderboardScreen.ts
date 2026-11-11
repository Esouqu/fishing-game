import { Container, Graphics } from "pixi.js";
import type { Game, LeaderboardViewOptions } from "../Game";
import { C } from "../config";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { drawLeaderboardTable } from "../ui/LeaderboardTable";
import { drawPanel, makeText } from "../ui/theme";
import { clamp } from "../utils";

const PANEL_X = 100;
const PANEL_Y = 18;
const PANEL_W = 280;
const PANEL_H = 234;
const TABLE_X = PANEL_X + 12;
const TABLE_Y = 62;
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
  private leaderboardThumb: Graphics | null = null;
  private thumbTrackY = 0;
  private thumbTrackH = 0;

  constructor(game: Game, view: LeaderboardViewOptions = {}) {
    super();
    this.game = game;
    this.view = view;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

    const panel = new Graphics();
    drawPanel(panel, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, {
      fill: C.panel,
      alpha: 0.95,
      shadow: true,
    });
    this.addChild(panel);

    const centerX = PANEL_X + PANEL_W / 2;
    const title = makeText("ТАБЛИЦА ЛИДЕРОВ", {
      size: 16,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(centerX, PANEL_Y + 8);
    this.addChild(title);

    const entries = game.leaderboard.top();
    const personal = game.leaderboard.personalBest();
    const rows =
      personal && !entries.some((entry) => entry.id === personal.id)
        ? entries.length + 1
        : entries.length;
    const subtitle = makeText(`ТОП-${rows} · ЛОКАЛЬНЫЙ РЕЙТИНГ`, {
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

    const available = PANEL_Y + PANEL_H - 8 - TABLE_Y;
    const visibleH =
      Math.floor((available - headerH) / TABLE_ROW_H) * TABLE_ROW_H;
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
      rows,
      highlightId: view.highlightId ?? personal?.id,
      rowHeight: TABLE_ROW_H,
      fontSize: TABLE_FONT,
      showHeader: false,
    });
    this.leaderboardMaxScroll = Math.max(0, tableHeight - visibleH);
    this.thumbTrackY = TABLE_Y + headerH;
    this.thumbTrackH = visibleH;

    if (this.leaderboardMaxScroll > 0) {
      const track = new Graphics();
      track
        .rect(PANEL_X + PANEL_W - 7, this.thumbTrackY, 2, visibleH)
        .fill({ color: C.ink, alpha: 0.3 });
      this.addChild(track);

      this.leaderboardThumb = new Graphics();
      this.leaderboardThumb.eventMode = "none";
      this.addChild(this.leaderboardThumb);
    }
    this.applyLeaderboardScroll();

    this.resetButton = new Button({
      label: "СБРОС",
      width: 46,
      height: 15,
      size: 8,
      onClick: () => this.handleReset(),
    });
    this.resetButton.position.set(PANEL_X + PANEL_W - 56, PANEL_Y + 8);
    this.addChild(this.resetButton);

    if (view.from === "result") {
      const again = new Button({
        label: "ЕЩЁ РАЗ",
        width: 112,
        height: 22,
        variant: "primary",
        size: 11,
        onClick: () => game.startGame(),
      });
      again.position.set(122, 216);
      this.addChild(again);
      this.bottomButtons.push(again);

      const menu = new Button({
        label: "В МЕНЮ",
        width: 112,
        height: 22,
        size: 11,
        onClick: () => game.showMenu(),
      });
      menu.position.set(246, 216);
      this.addChild(menu);
      this.bottomButtons.push(menu);
    } else {
      const back = new Button({
        label: "НАЗАД",
        width: 128,
        height: 22,
        variant: "primary",
        size: 11,
        onClick: () => game.showMenu(),
      });
      back.position.set(176, 216);
      this.addChild(back);
      this.bottomButtons.push(back);
    }

    this.focus.setItems([...this.bottomButtons, this.resetButton]);
    this.focus.onMove = () => game.audio.hover();
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
        PANEL_X + PANEL_W - 7,
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
    this.leaderboardScroll = 0;
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
