import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { GameContext } from "../GameContext";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import { TEXT } from "../texts";
import type { AreaId, WeatherId } from "../types";
import { formatClock } from "../utils";
import type { ForecastStep } from "../world";
import { UI } from "./palette";
import { drawPanel, drawWeatherIcon, makeText, setText } from "./theme";

/**
 * Sky rail: the live weather period and the ones behind it, on one line at the
 * bottom of the round.
 *
 * The old forecast was a `-> ОБЛАЧНО` tail on the HUD's weather card in the
 * top-left: one word, no timing, and it competed with the clock for the same
 * corner. This rail sits between the two travel cards instead — where the eye
 * already goes between rounds — and answers the question the weather actually
 * raises for a fisherman: *when does the sky turn*.
 *
 * It is drawn, not composed: one panel frame, up to four columns, a pixel
 * weather glyph in a medallion per column and the clock time each period takes
 * over. Consecutive fronts of the same sky fold into one column, so the rail
 * never shows three identical suns in a row; a column's width is its share of
 * the window, which is what makes the rail read as a timeline.
 */
const WIDTH = 216;
const HEIGHT = 30;
/** Sits on the same bottom line as the travel cards in the corners. */
const MARGIN = 8;
const PAD_X = 7;
/** Four fronts already cover the next five to ten minutes of the round. */
const STEPS = 4;
/** Narrowest a column may get, so a badge and a time still fit. */
const MIN_COLUMN = 20;
/** Row of clock labels; the band starts right below it. */
const LABEL_Y = 6;
const BAND_Y = 12;
const BAND_H = 12;
/** Footprint of the glyph `drawWeatherIcon` paints. */
const ICON = 12;
/**
 * The glyphs sit in round badges, like the medallions on the reference strip.
 *
 * The reference drew them straight onto the tinted band because its icons are
 * dark line art; these are painted for a dark panel, so an ice cloud on an ice
 * band disappears. A badge gives every glyph the panel behind it again and the
 * weather colour reads as the badge's ring instead of its background.
 */
const BADGE_R = 8.5;
const BADGE_INNER = 7;

/**
 * Wash behind each column. Kept at a low alpha on purpose: the glyph on top
 * already carries the front, and a saturated band would make the amber sun
 * disappear on a clear column.
 */
const BAND_COLOR: Record<WeatherId, number> = {
  clear: UI.amber,
  // Overcast is a grey lid, so its band is the only neutral one on the rail.
  overcast: UI.textMuted,
  snow: UI.ice,
  blizzard: UI.ice,
  fog: UI.periwinkle,
};

/**
 * Folds consecutive fronts of the same sky into one period.
 *
 * The clock rolls a new front every minute or two even when nothing changes,
 * and a rail that printed `ЯСНО | ЯСНО | ЯСНО` was four identical medallions
 * pretending to be news. Two identical neighbours are one period, and its
 * length is what the player actually cares about: how long until the sky turns.
 */
function mergeRuns(steps: readonly ForecastStep[]): ForecastStep[] {
  const periods: ForecastStep[] = [];
  for (const step of steps) {
    const last = periods[periods.length - 1];
    if (last && last.weather === step.weather) {
      last.endsIn = step.endsIn;
      last.length += step.length;
      continue;
    }
    periods.push({ ...step });
  }
  return periods;
}

/**
 * Splits the rail into columns proportionally to how long each period runs.
 *
 * Every column keeps a minimum share, then the rest is handed out by duration:
 * a short period still fits its glyph and time, a long one visibly owns more of
 * the rail. The edges are rounded cumulatively so the columns stay
 * edge-to-edge and no column drifts a pixel away from its neighbour.
 */
function allocate(lengths: readonly number[], total: number): number[] {
  const count = lengths.length;
  if (count === 0) return [];
  const free = Math.max(0, total - MIN_COLUMN * count);
  const sum = lengths.reduce((acc, value) => acc + value, 0);
  let edge = 0;
  let previous = 0;
  return lengths.map((length) => {
    const share = sum > 0 ? length / sum : 1 / count;
    edge += MIN_COLUMN + free * share;
    const rounded = Math.round(edge);
    const px = rounded - previous;
    previous = rounded;
    return px;
  });
}

export class WeatherForecast extends Container {
  private readonly game: GameContext;
  private readonly areaId: AreaId;
  /** Band, separators, the now marker and the live column's progress fill. */
  private readonly band = new Graphics();
  private readonly icons: Graphics[] = [];
  private readonly labels: Text[] = [];
  /** Column widths of the current layout; recalculated when the set changes. */
  private widths: number[] = [];
  /** Fronts on the rail right now, to detect a new set. */
  private fronts: WeatherId[] = [];
  /** What the band was last painted from, so a still frame repaints nothing. */
  private painted = "";

  constructor(game: GameContext, areaId: AreaId) {
    super();
    this.game = game;
    this.areaId = areaId;
    this.position.set(
      Math.round((VIEW.width - WIDTH) / 2),
      VIEW.height - MARGIN - HEIGHT,
    );
    // The rail covers water: it swallows its own clicks like the HUD cards do,
    // otherwise a click on it would cast a line into the lake behind it.
    this.eventMode = "static";
    this.cursor = CURSORS.default;
    this.hitArea = new Rectangle(0, 0, WIDTH, HEIGHT);

    const frame = new Graphics();
    drawPanel(frame, 0, 0, WIDTH, HEIGHT, {
      fill: UI.panel,
      alpha: 0.9,
      shadow: true,
    });
    this.addChild(frame);

    this.band.eventMode = "none";
    this.addChild(this.band);

    for (let index = 0; index < STEPS; index += 1) {
      const icon = new Graphics();
      icon.eventMode = "none";
      this.addChild(icon);
      this.icons.push(icon);

      // The live column is the one the player reads first, so its caption is
      // bright and the queued ones stay muted: the same hierarchy the HUD card
      // uses for its current front.
      const label = makeText("", {
        size: 5.5,
        weight: 800,
        color: index === 0 ? UI.text : UI.textMuted,
        align: "center",
        letterSpacing: 0.2,
      });
      label.anchor.set(0.5, 0.5);
      label.eventMode = "none";
      this.addChild(label);
      this.labels.push(label);
    }

    this.refresh();
  }

  /** True inside the rail, for the cast cursor and for click swallowing. */
  hitTest(x: number, y: number): boolean {
    return (
      this.visible &&
      x >= this.x - 2 &&
      x <= this.x + WIDTH + 2 &&
      y >= this.y - 2 &&
      y <= this.y + HEIGHT + 2
    );
  }

  update(): void {
    this.refresh();
  }

  private refresh(): void {
    const clock = this.game.clock;
    // Enough raw fronts that four *periods* still fit after the repeats fold
    // together: a run of three clear fronts is one column, not three.
    const periods = mergeRuns(clock.forecastFor(this.areaId, STEPS + 3)).slice(
      0,
      STEPS,
    );
    if (periods.length === 0) return;

    const fronts = periods.map((period) => period.weather);
    const lengths = periods.map((period) => period.length);
    // Relayout when the fronts or their spans change, not every frame: a
    // column that jitters under the pointer reads as a broken widget.
    const signature = `${fronts.join(",")}|${lengths.map((value) => Math.round(value)).join(",")}`;
    if (signature !== this.painted) {
      this.painted = signature;
      this.fronts = fronts;
      this.widths = allocate(lengths, WIDTH - PAD_X * 2);
      this.layoutColumns();
      this.paintBand();
    }
    this.writeTimes(periods, clock.minutes);
  }

  /** Puts each glyph over its column and each caption under the band's edge. */
  private layoutColumns(): void {
    let x = PAD_X;
    for (let index = 0; index < STEPS; index += 1) {
      const width = this.widths[index];
      const front = this.fronts[index];
      const icon = this.icons[index];
      const label = this.labels[index];
      icon.visible = Boolean(front);
      label.visible = Boolean(front);
      if (!front || width === undefined) continue;
      icon.position.set(
        Math.round(x + width / 2 - ICON / 2),
        Math.round(BAND_Y + BAND_H / 2 - ICON / 2),
      );
      drawWeatherIcon(icon, front);
      label.position.set(Math.round(x + width / 2), LABEL_Y);
      x += width;
    }
  }

  /**
   * Paints the band and the medallions. Called only when the periods change,
   * so a still frame costs one string compare.
   */
  private paintBand(): void {
    const g = this.band;
    g.clear();
    const centreY = BAND_Y + BAND_H / 2;
    let x = PAD_X;
    for (const [index, front] of this.fronts.entries()) {
      const width = this.widths[index];
      if (width === undefined) continue;
      // The live period is the one the player is standing in, so it is a step
      // brighter than the ones that are still coming.
      g.rect(x, BAND_Y, width, BAND_H).fill({
        color: BAND_COLOR[front],
        alpha: index === 0 ? 0.62 : 0.34,
      });
      // Column divider. Drawn over both washes, so the seam is one pixel of ink
      // rather than two fills meeting at slightly different values.
      if (index > 0) {
        g.rect(x, BAND_Y, 1, BAND_H).fill({ color: UI.ink, alpha: 0.55 });
      }
      x += width;
    }
    x = PAD_X;
    for (const [index, front] of this.fronts.entries()) {
      const width = this.widths[index];
      if (width === undefined) continue;
      const centreX = x + width / 2;
      // Weather-coloured ring around a dark disc: the glyph keeps the panel it
      // was drawn for, and the ring still names the front at a glance. An
      // ice-white disc washed the pale cloud and the flakes out completely.
      g.circle(centreX, centreY, BADGE_R).fill({
        color: BAND_COLOR[front],
        alpha: 0.95,
      });
      g.circle(centreX, centreY, BADGE_INNER).fill(UI.panel);
      g.circle(centreX, centreY, BADGE_R).stroke({
        width: 1,
        color: UI.ink,
        alpha: 0.55,
      });
      x += width;
    }
    // Now marker: a bright tick on the left edge, the same ice-white the
    // interface uses for "this one is current" everywhere else.
    g.rect(PAD_X, BAND_Y - 3, 2, BAND_H + 6).fill(UI.primary);
    g.rect(PAD_X - 1, BAND_Y - 4, 5, 2).fill(UI.primary);
  }

  /** Captions: «сейчас» on the live period, the takeover time on the rest. */
  private writeTimes(periods: readonly ForecastStep[], minutes: number): void {
    this.labels.forEach((label, index) => {
      const period = periods[index];
      label.visible = Boolean(period);
      if (!period) return;
      setText(
        label,
        index === 0
          ? TEXT.forecast.now
          : formatClock(minutes + period.startsIn / 60),
      );
    });
  }
}
