import { Container, Graphics, Rectangle } from "pixi.js";
import type { GameContext } from "../GameContext";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import type { AreaId, WeatherId } from "../types";
import type { ForecastStep } from "../world";
import { UI } from "./palette";
import { drawPanel } from "./theme";
import { WeatherRail } from "./weatherRail";
import { mergeRuns, RAIL_HEIGHT, railWidth } from "./weatherRailLayout";

/**
 * Sky rail: the live weather period and the ones behind it, on one slim card at
 * the bottom of the round.
 *
 * It reads like a compact forecast strip: one panel holding a row of equal
 * cards, each card one row tall with the weather glyph and its caption centred
 * together (the live one says «СЕЙЧАС», the rest carry the clock time they take
 * over). The panel is deliberately half the height of the corner travel cards:
 * it is a readout, so it must not compete with the pictures next to it. Cards
 * are a fixed size, so the widget never reflows while the player is reading it.
 * Consecutive fronts of the same sky fold into one card, so the rail never shows
 * three identical suns in a row.
 *
 * The row itself lives in {@link WeatherRail}: when a front expires it rolls one
 * place left instead of blinking — the card that becomes «now» crossfades its
 * clock time into the live caption, and the front that just entered the forecast
 * slides in from the right edge. A different number of periods is still a soft
 * fade, because the panel itself has to change width.
 */
const HEIGHT = RAIL_HEIGHT;
/** Sits on the same bottom line as the travel cards in the corners. */
const MARGIN = 8;
/** Four fronts already cover the next five to ten minutes of the round. */
const STEPS = 4;
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
  /** Panel width for the current number of cards. */
  private span = railWidth(STEPS);
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
    // Enough raw fronts that four *periods* still fit after the repeats fold
    // together: a run of three clear fronts is one card, not three.
    const periods = mergeRuns(clock.forecastFor(this.areaId, STEPS + 3)).slice(
      0,
      STEPS,
    );
    if (periods.length === 0) return;

    const signature = periods
      .map((period) => `${period.weather}:${Math.round(period.length)}`)
      .join(",");
    if (signature === this.painted) return;
    this.painted = signature;
    const minutes = clock.minutes;

    if (!animate || this.rail.weathers().length === 0) {
      this.rail.rebuild(periods, minutes, animate);
      this.syncSpan();
      return;
    }

    // Same skies in the same order: a same-sky successor was folded into the
    // live period, or the queue was re-rolled under an identical row. Only the
    // captions can have moved, so refresh them in place without a blink.
    const old = this.rail.weathers();
    if (
      old.length === periods.length &&
      periods.every((period, index) => period.weather === old[index])
    ) {
      this.rail.retime(periods, minutes);
      return;
    }

    // One front expired and the row simply rolls left. Roll only when the new
    // row is the old row minus its head: any other change is a real re-layout.
    const removed = this.slideSize(old, periods);
    if (removed > 0) {
      this.rail.roll(periods, minutes, removed);
      return;
    }
    this.rail.rebuild(periods, minutes, true);
    this.syncSpan();
  }

  /**
   * How many cards left the head of the row, when the rest of it is the same
   * sequence. Returns 0 when the new row cannot be reached by a plain slide.
   */
  private slideSize(
    old: readonly WeatherId[],
    periods: readonly ForecastStep[],
  ): number {
    if (periods.length !== old.length) return 0;
    for (let removed = 1; removed < old.length; removed += 1) {
      let matches = true;
      for (let i = removed; i < old.length; i += 1) {
        if (old[i] !== periods[i - removed].weather) {
          matches = false;
          break;
        }
      }
      if (matches) return removed;
    }
    return 0;
  }

  /** Follows a row re-layout: recentre, resize the hit area, repaint. */
  private syncSpan(): void {
    this.span = this.rail.span;
    this.position.x = Math.round((VIEW.width - this.span) / 2);
    this.hitArea = new Rectangle(0, 0, this.span, HEIGHT);
    this.paint();
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
      // gaps between them — as a row of raised separator bars.
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
