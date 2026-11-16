import { Container, Graphics, Rectangle } from "pixi.js";
import type { GameContext } from "../GameContext";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import type { AreaId, WeatherId } from "../types";
import { UI } from "./palette";
import { drawPanel } from "./theme";
import { WeatherRail } from "./weatherRail";
import {
  RAIL_HEIGHT,
  RAIL_SLOTS,
  railPeriods,
  railWidth,
  type RailPeriod,
} from "./weatherRailLayout";

/**
 * Sky rail: the live weather period and the ones behind it, on one slim card at
 * the bottom of the round.
 *
 * It reads like a compact forecast strip: one panel holding a row of cards, each
 * one row tall with the weather glyph and its caption centred together (the live
 * one says В«РЎР•Р™Р§РђРЎВ», the rest carry the clock time they take over). The panel is
 * deliberately half the height of the corner travel cards: it is a readout, so it
 * must not compete with the pictures next to it. The row is always
 * {@link RAIL_SLOTS} slots wide, so the widget never reflows while the player is
 * reading it; consecutive fronts of the same sky fold into one card that spans
 * one slot per front with no divider between, so the rail never shows three
 * identical suns in a row and never gets narrower either.
 *
 * The row itself lives in {@link WeatherRail}: when a front expires it rolls one
 * place left instead of blinking вЂ” the card that becomes В«nowВ» crossfades its
 * clock time into the live caption, and the front that just entered the forecast
 * slides in from the right edge. A change that re-shapes the cards is a soft
 * fade instead, because a card cannot slide while it changes width.
 */
const HEIGHT = RAIL_HEIGHT;
/** Sits on the same bottom line as the travel cards in the corners. */
const MARGIN = 8;
/** Ink plate laid over the panel while the fight focus is up. */
const DIM = 0.42;

export class WeatherForecast extends Container {
  private readonly game: GameContext;
  private readonly areaId: AreaId;
  /** Panel frame. The cards and their clip live in `rail`. */
  private readonly band = new Graphics();
  private readonly rail = new WeatherRail();
  /** Dark wash laid over the panel while the fight focus is up. */
  private readonly dimmer = new Graphics();
  /** Panel width: fixed, the rail always shows the same number of slots. */
  private span = railWidth(RAIL_SLOTS);
  /** What the rail was last built from, so a still frame rebuilds nothing. */
  private painted = "";
  private dimmed = false;

  constructor(game: GameContext, areaId: AreaId) {
    super();
    this.game = game;
    this.areaId = areaId;
    this.position.set(
      Math.round((VIEW.width - this.span) / 2),
      VIEW.height - MARGIN - HEIGHT,
    );
    // The rail covers water: it swallows its own clicks like the HUD cards do,
    // otherwise a click on it would cast a line into the lake behind it.
    this.eventMode = "static";
    this.cursor = CURSORS.default;
    this.hitArea = new Rectangle(0, 0, this.span, HEIGHT);

    this.band.eventMode = "none";
    this.rail.eventMode = "none";
    this.dimmer.eventMode = "none";
    this.addChild(this.band, this.rail, this.dimmer);

    this.refresh(false);
    // The panel frame is painted here, not from a resize: the rail is a fixed
    // four slots wide now, and its only other painter is the fight dimmer — so
    // without this call the widget had cards but no plate until a fight began.
    this.paint();
  }

  /** Puts the panel back under the fight focus without making it translucent. */
  setDimmed(dimmed: boolean): void {
    if (this.dimmed === dimmed) return;
    this.dimmed = dimmed;
    this.paint();
  }

  /** True inside the rail, for the cast cursor and for click swallowing. */
  hitTest(x: number, y: number): boolean {
    return (
      this.visible &&
      x >= this.x - 2 &&
      x <= this.x + this.span + 2 &&
      y >= this.y - 2 &&
      y <= this.y + HEIGHT + 2
    );
  }

  update(dt: number): void {
    this.refresh(true);
    this.rail.update(dt);
  }

  /**
   * Rebuilds the strip when the promised fronts changed. `animate` is false for
   * the first build, which the player should simply see in place.
   */
  private refresh(animate: boolean): void {
    const clock = this.game.clock;
    // Enough raw fronts to fill all four slots after the repeats fold together:
    // a run of three clear fronts is one period across three slots, not three
    // cards, so the queue is asked for more than four steps.
    const periods = railPeriods(clock.forecastFor(this.areaId, RAIL_SLOTS + 4));
    if (periods.length === 0) return;

    // The slot count is part of the signature: the same skies can re-shape the
    // row when a run grows or splits, and that is a visible change.
    const signature = periods
      .map(
        (period) =>
          `${period.weather}:${period.slots}:${Math.round(period.length)}`,
      )
      .join(",");
    if (signature === this.painted) return;
    this.painted = signature;
    const minutes = clock.minutes;

    if (!animate || this.rail.weathers().length === 0) {
      this.rail.rebuild(periods, minutes, animate);
      return;
    }

    // Same skies in the same shape: a same-sky successor was folded into the
    // live period, or the queue was re-rolled under an identical row. Only the
    // captions can have moved, so refresh them in place without a blink.
    const old = this.rail.weathers();
    const oldSlots = this.rail.slots();
    if (
      old.length === periods.length &&
      periods.every(
        (period, index) =>
          period.weather === old[index] && period.slots === oldSlots[index],
      )
    ) {
      this.rail.retime(periods, minutes);
      return;
    }

    // One front expired and the row simply rolls left. Roll only when the new
    // row is the old row minus its head *and* the cards keep their widths: a
    // card cannot slide while it is changing shape.
    const removed = this.slideSize(old, oldSlots, periods);
    if (removed > 0) {
      this.rail.roll(periods, minutes, removed);
      return;
    }
    this.rail.rebuild(periods, minutes, true);
  }

  /**
   * How many cards left the head of the row, when the rest of it is the same
   * sequence with the same widths. Returns 0 when the new row cannot be reached
   * by a plain slide.
   */
  private slideSize(
    old: readonly WeatherId[],
    oldSlots: readonly number[],
    periods: readonly RailPeriod[],
  ): number {
    if (periods.length !== old.length) return 0;
    for (let removed = 1; removed < old.length; removed += 1) {
      let matches = true;
      for (let i = removed; i < old.length; i += 1) {
        if (old[i] !== periods[i - removed].weather) {
          matches = false;
          break;
        }
        if (oldSlots[i] !== periods[i - removed].slots) {
          matches = false;
          break;
        }
      }
      if (matches) return removed;
    }
    return 0;
  }

  /** Paints the panel and the focus plate from the current row. */
  private paint(): void {
    const g = this.band;
    g.clear();
    // Solid panel: the rail is a card on the frame, not a tinted window over the
    // water, so waves must never drift through it.
    drawPanel(g, 0, 0, this.span, HEIGHT, {
      fill: UI.panel,
      alpha: 1,
      shadow: true,
      // The cards cover the face, so the panel's bevel would only show in the
      // gaps between them вЂ” as a row of raised separator bars.
      inner: false,
    });

    // The focus plate covers panel and cards alike, so a fight dims the whole
    // widget rather than leaving a bright hole at the bottom of the frame.
    this.dimmer.clear();
    if (this.dimmed) {
      this.dimmer.rect(0, 0, this.span, HEIGHT).fill({
        color: UI.ink,
        alpha: DIM,
      });
    }
  }
}
