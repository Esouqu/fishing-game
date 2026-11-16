import { Graphics, Sprite, Text } from "pixi.js";
import type { GameContext } from "../GameContext";
import { VIEW } from "../config";
import { AREAS, type AreaDef } from "../areas";
import { TEXT, WEATHER_LABEL } from "../texts";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { UI } from "../ui/palette";
import {
  PANEL_PAD,
  SCREEN_INSET,
  drawPanel,
  drawWeatherIcon,
  makeText,
} from "../ui/theme";

/**
 * The window fills the frame with the same inset on every side; the cards and
 * the footer live inside its content box, so the picker lines up with the
 * codex and the help instead of floating at its own margins.
 */
const PANEL = {
  x: SCREEN_INSET,
  y: SCREEN_INSET,
  width: VIEW.width - SCREEN_INSET * 2,
  height: VIEW.height - SCREEN_INSET * 2,
};
const CARD_W = 128;
const CARD_H = 118;
/** Gap that lets the three cards fill the content box evenly. */
const CARD_GAP = (PANEL.width - PANEL_PAD * 2 - CARD_W * 3) / 2;
const CARD_Y = 74;
const CARD_X = [0, 1, 2].map(
  (index) => PANEL.x + PANEL_PAD + index * (CARD_W + CARD_GAP),
);
/** Baseline of the weather strip inside a card. */
const STATUS_Y = 101;
/** Footer pair, inset from the panel's bottom edge like the cards are. */
const FOOTER_Y = PANEL.y + PANEL.height - PANEL_PAD - 20;
const FOOTER_W = 120;
/**
 * Footer edges: the pair is spread across the content box instead of centred as
 * one block, so «назад» lines up with the left card and «к рыбалке» with the
 * right one.
 */
const FOOTER_LEFT = PANEL.x + PANEL_PAD;
const FOOTER_RIGHT = PANEL.x + PANEL.width - PANEL_PAD - FOOTER_W;

/** Width of the 12×12 weather glyph, for centring the weather strip. */
const WEATHER_ICON = 12;
const WEATHER_GAP = 5;

/** Where the picker should return when the player backs out of it. */
export type AreaPickOrigin = "menu" | "game";

/**
 * Water-body picker.
 *
 * Clicking a card only *selects* it: the backdrop, the frame and the ambience
 * follow the choice, and the round starts from the explicit «К РЫБАЛКЕ» button.
 * A single stray click therefore no longer throws the player into another
 * lake, and the selection has a visible state to confirm what will start.
 */
export class AreaSelectScreen extends Screen {
  private readonly game: GameContext;
  private readonly pickOrigin: AreaPickOrigin;
  private backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly buttons: Button[] = [];
  private readonly cards: Button[] = [];
  private readonly selection = new Graphics();
  private readonly mark = new Graphics();
  private readonly markText: Text;
  private selectedIndex = 0;
  /** Card under the pointer, or -1: it gets the selection marks too. */
  private hoveredIndex = -1;
  /** Per-card caption and the two marks that bracket it. */
  private readonly nameMarks: Array<{ left: Text; right: Text }> = [];

  constructor(game: GameContext, origin: AreaPickOrigin = "menu") {
    super();
    this.game = game;
    this.pickOrigin = origin;

    const startIndex = Math.max(
      0,
      AREAS.findIndex((area) => area.id === game.areaId),
    );
    this.selectedIndex = startIndex;
    const startArea = AREAS[startIndex];

    this.backdrop = this.makeBackdrop(startArea);
    this.addChild(this.backdrop);
    game.audio.setAmbience(startArea.id);

    const panel = new Graphics();
    drawPanel(panel, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
      fill: UI.panel,
      alpha: 0.92,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText(TEXT.areas.title, {
      size: 16,
      weight: 800,
      color: UI.text,
      align: "center",
      letterSpacing: 0.8,
    });
    title.position.set(VIEW.width / 2, PANEL.y + 12);
    this.addChild(title);

    AREAS.forEach((area, index) => {
      const card = new Button({
        width: CARD_W,
        height: CARD_H,
        variant: "card",
        onClick: () => this.select(index),
      });
      card.position.set(CARD_X[index], CARD_Y);
      this.addChild(card);
      this.buttons.push(card);
      this.cards.push(card);

      const preview = new Sprite(this.game.previewFor(area.id));
      preview.width = CARD_W - 16;
      preview.height = 63;
      preview.position.set(8, 8);
      preview.eventMode = "none";
      card.addChild(preview);

      const frame = new Graphics();
      frame.rect(7, 7, CARD_W - 14, 65).stroke({
        width: 1,
        color: UI.ink,
        alpha: 0.8,
      });
      frame.rect(8, 8, CARD_W - 16, 1).fill({
        color: UI.periwinklePale,
        alpha: 0.25,
      });
      frame.eventMode = "none";
      card.addChild(frame);

      const name = makeText(area.name, {
        size: 11,
        weight: 800,
        color: UI.text,
        align: "center",
        letterSpacing: 0.3,
      });
      name.position.set(CARD_W / 2, 77);
      name.eventMode = "none";
      card.addChild(name);

      // The marks are centred on the caption's box, not on its top edge: the
      // caption is anchored by its top (y = 77), so anchoring the marks by their
      // own middle at the same y put them half a line too high.
      const markStyle = {
        size: 11,
        weight: 800,
        color: UI.text,
      };
      const markY = 77 + name.height / 2;
      const left = makeText(">", markStyle);
      left.anchor.set(1, 0.5);
      left.position.set(CARD_W / 2 - Math.ceil(name.width / 2) - 1, markY);
      left.visible = false;
      left.eventMode = "none";
      const right = makeText("<", markStyle);
      right.anchor.set(0, 0.5);
      right.position.set(CARD_W / 2 + Math.ceil(name.width / 2) + 1, markY);
      right.visible = false;
      right.eventMode = "none";
      card.addChild(left, right);
      this.nameMarks.push({ left, right });

      card.on("pointerover", () => {
        this.hoveredIndex = index;
        this.refreshNameMarks();
      });
      card.on("pointerout", () => {
        if (this.hoveredIndex === index) this.hoveredIndex = -1;
        this.refreshNameMarks();
      });

      // Each water body has its own front, so the card reports the sky the
      // player will actually fish under. The clock is shared by all areas.
      const weather = this.game.clock.weatherFor(area.id);
      const icon = new Graphics();
      drawWeatherIcon(icon, weather);
      const weatherLabel = makeText(WEATHER_LABEL[weather], {
        size: 8,
        weight: 800,
        color: UI.text,
        letterSpacing: 0.3,
      });
      weatherLabel.anchor.set(0, 0.5);
      // The icon and the label are one centred group: left-aligning them at a
      // fixed x made each card's weather row start at a different place under
      // the centred name.
      const weatherWidth =
        WEATHER_ICON + WEATHER_GAP + Math.ceil(weatherLabel.width);
      const weatherX = (CARD_W - weatherWidth) / 2;
      icon.position.set(weatherX, STATUS_Y - WEATHER_ICON / 2);
      weatherLabel.position.set(
        weatherX + WEATHER_ICON + WEATHER_GAP,
        STATUS_Y,
      );
      weatherLabel.eventMode = "none";
      icon.eventMode = "none";
      card.addChild(icon, weatherLabel);
    });

    // Selection frame sits above the cards: an ice-white outline, corner ticks
    // and a small «ВЫБРАН» tag, so the choice reads without hovering anything.
    this.selection.eventMode = "none";
    this.addChild(this.selection);
    this.mark.eventMode = "none";
    this.addChild(this.mark);
    this.markText = makeText(TEXT.areas.selected, {
      size: 7,
      weight: 800,
      color: UI.textOnBright,
      align: "center",
    });
    this.markText.anchor.set(0.5, 0.5);
    this.markText.eventMode = "none";
    this.addChild(this.markText);

    // Back sits on the left, the ice-white «к рыбалке» on the right, so the
    // primary action lands under the thumb on the right where the eye ends the
    // row.
    const back = new Button({
      label: TEXT.areas.back,
      width: FOOTER_W,
      height: 20,
      variant: "secondary",
      size: 9,
      onClick: () => this.leave(),
    });
    back.position.set(FOOTER_LEFT, FOOTER_Y);
    this.addChild(back);
    this.buttons.push(back);

    const go = new Button({
      label: TEXT.areas.fish,
      width: FOOTER_W,
      height: 20,
      variant: "primary",
      size: 10,
      onClick: () => this.startSelected(),
    });
    go.position.set(FOOTER_RIGHT, FOOTER_Y);
    this.addChild(go);
    this.buttons.push(go);

    this.focus.setItems(this.buttons, 3);
    this.focus.onMove = () => {
      const index = this.focus.currentIndex;
      if (index >= 0 && index < AREAS.length) this.select(index);
      this.game.audio.hover();
    };
    this.select(startIndex);
  }

  private get selectedArea(): AreaDef {
    return AREAS[this.selectedIndex] ?? AREAS[0];
  }

  private makeBackdrop(area: AreaDef): Backdrop {
    return new Backdrop(this.game.previewFor(area.id), this.game.clock, area);
  }

  /** Highlights one card and re-dresses the backdrop for that water body. */
  private select(index: number): void {
    const next = Math.max(0, Math.min(AREAS.length - 1, index));
    const changed = next !== this.selectedIndex;
    this.selectedIndex = next;
    const area = this.selectedArea;

    if (changed) {
      // The menu backdrop and the ambience follow the selection, so the picker
      // previews the water body (sound and sky) before the round starts.
      this.removeChild(this.backdrop);
      this.backdrop.destroy({ children: true });
      this.backdrop = this.makeBackdrop(area);
      this.addChildAt(this.backdrop, 0);
      this.game.audio.setAmbience(area.id);
    }

    this.cards.forEach((card, cardIndex) => {
      card.alpha = cardIndex === next ? 1 : 0.82;
    });
    // The keyboard ring follows the selection, but a pointer click must not
    // raise it: a lit ring on a card the player only clicked reads as a
    // second, competing selection. It stays off until an arrow key asks for it.
    if (this.focus.keyboardActive) this.focus.focus(next);

    const x = CARD_X[next];
    const y = CARD_Y;
    const g = this.selection;
    g.clear();
    g.rect(x - 3, y - 3, CARD_W + 6, CARD_H + 6).stroke({
      width: 2,
      color: UI.primary,
    });
    g.rect(x - 1, y - 1, CARD_W + 2, CARD_H + 2).stroke({
      width: 1,
      color: UI.ink,
      alpha: 0.45,
    });
    // Corner ticks keep the selection readable over bright previews.
    for (const [cx, cy, sx, sy] of [
      [x - 4, y - 4, 1, 1],
      [x + CARD_W + 3, y - 4, -1, 1],
      [x - 4, y + CARD_H + 3, 1, -1],
      [x + CARD_W + 3, y + CARD_H + 3, -1, -1],
    ] as const) {
      g.rect(cx, cy, 6 * sx, 1).fill(UI.primary);
      g.rect(cx, cy, 1 * sx, 6 * sy).fill(UI.primary);
    }

    // «ВЫБРАН» tag on the corner of the preview: the card's footer strip is
    // already used by the weather icon and the clock.
    const label = TEXT.areas.selected;
    const tagWidth = label.length * 4 + 6;
    const tagX = x + CARD_W - tagWidth - 10;
    const tagY = y + 10;
    this.mark.clear();
    this.mark.rect(tagX, tagY, tagWidth, 10).fill(UI.primary);
    this.mark
      .rect(tagX, tagY, tagWidth, 10)
      .stroke({ width: 1, color: UI.ink });
    this.mark.rect(tagX + 1, tagY + 1, tagWidth - 2, 1).fill({
      color: UI.primaryHover,
      alpha: 0.85,
    });
    this.markText.position.set(tagX + tagWidth / 2, tagY + 5);
    this.refreshNameMarks();
  }

  /**
   * Brackets the chosen and the hovered caption, the way a button label is
   * bracketed. The marks are glyphs beside the word, so the caption itself
   * never moves when they appear.
   */
  private refreshNameMarks(): void {
    this.nameMarks.forEach((marks, index) => {
      const shown = index === this.selectedIndex || index === this.hoveredIndex;
      marks.left.visible = shown;
      marks.right.visible = shown;
    });
  }

  private startSelected(): void {
    this.game.startGame(this.selectedArea.id);
  }

  /** Back to the menu, or back into the round the picker was opened from. */
  private leave(): void {
    if (this.pickOrigin === "game") this.game.startGame();
    else this.game.showMenu();
  }

  override onEnter(): void {
    // The picker points at the current water body, but leaves it unlit: the
    // light selection frame already says what is chosen, and the keyboard ring
    // only appears once an arrow key is pressed.
    this.focus.select(this.selectedIndex);
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
      this.leave();
      return true;
    }
    return this.focus.handleKey(event);
  }
}
