import { Container, Graphics, Text } from "pixi.js";
import { TEXT } from "../texts";
import type { WeatherId } from "../types";
import { easeOutCubic, formatClock, lerp } from "../utils";
import type { ForecastStep } from "../world";
import { mixColor } from "../world";
import { UI } from "./palette";
import { drawWeatherIcon, makeText, WEATHER_TINT } from "./theme";
import { RAIL, railWidth } from "./weatherRailLayout";

/** How long the captions take to fade in after a rebuild, in seconds. */
const FADE = 0.2;
/** How long one slot of the leftward slide takes, in seconds. */
const SLIDE_TIME = 0.34;
/** Distance between two neighbouring card slots. */
const SLOT = RAIL.cardWidth + RAIL.gap;

/** One period on the strip: its card, its glyph, its caption. */
interface Card {
  weather: WeatherId;
  /** The period the player is standing in: raised card, bright caption. */
  live: boolean;
  node: Container;
  well: Graphics;
  icon: Graphics;
  label: Text;
  /** 0..1 fill of the raised «now» well, animated when a front is promoted. */
  glow: number;
}

/** One card's journey to its new slot in a sliding row. */
interface SlotMotion {
  card: Card;
  fromX: number;
  toX: number;
  fromAlpha: number;
  toAlpha: number;
}

/** The card that becomes «now»: its caption fades from time to the live one. */
interface Promotion {
  card: Card;
  ghost: Text;
  fromIconX: number;
  toIconX: number;
}

/** A leftward slide in flight. */
interface Slide {
  elapsed: number;
  motions: SlotMotion[];
  promotion: Promotion | null;
  exiting: Card[];
}

/**
 * The row of weather cards inside {@link WeatherForecast}: glyph and caption
 * centred together on a fixed-size card, clipped to the panel's inner face.
 *
 * When a front expires the row does not blink: every card slides one place to
 * the left, the card that becomes «now» crossfades its clock time into the live
 * caption while its well lights up, and the front that just entered the forecast
 * slides in from the right edge. A full re-layout (a different number of
 * periods) still uses a soft fade.
 */
export class WeatherRail extends Container {
  /** Card nodes, all in rail coordinates, clipped to the panel's inner face. */
  private readonly art = new Container();
  /** Inner face of the panel: cards slide in and out through this mask. */
  private readonly clip = new Graphics();
  private cards: Card[] = [];
  /** Panel width the row is laid out for. */
  span = railWidth(4);
  /** Fade progress of `art`, 0..1, used by whole-row rebuilds. */
  private appear = 1;
  /** Slide in flight, if any. */
  private slide: Slide | null = null;

  constructor() {
    super();
    this.art.eventMode = "none";
    this.addChild(this.art);
    this.addChild(this.clip);
    this.art.mask = this.clip;
  }

  /** The sky of each card, left to right; what a slide is matched against. */
  weathers(): WeatherId[] {
    return this.cards.map((card) => card.weather);
  }

  /**
   * Refreshes the clock captions in place. Used when the row's skies did not
   * change but the schedule behind them did (a debug pin, a re-rolled queue).
   */
  retime(periods: readonly ForecastStep[], minutes: number): void {
    this.cards.forEach((card, index) => {
      if (index === 0 || index >= periods.length) return;
      this.retimeCard(card, periods[index], minutes);
    });
  }

  update(dt: number): void {
    if (this.slide) this.step(dt);
    if (this.appear >= 1) return;
    this.appear = Math.min(1, this.appear + dt / FADE);
    this.art.alpha = this.appear;
  }

  /** Lays the row out from scratch: panel width, cards, glyphs, captions. */
  rebuild(
    periods: readonly ForecastStep[],
    minutes: number,
    animate: boolean,
  ): void {
    this.settle();
    for (const card of this.cards) this.destroyCard(card);
    this.cards = [];

    this.span = railWidth(periods.length);
    this.cards = periods.map((period, index) =>
      this.makeCard(period, index, minutes, index === 0),
    );
    this.paintClip();

    this.appear = animate ? 0 : 1;
    this.art.alpha = this.appear;
  }

  /** Starts the leftward roll: cards keep their glyphs, only slots change. */
  roll(
    periods: readonly ForecastStep[],
    minutes: number,
    removed: number,
  ): void {
    this.settle();
    const count = this.cards.length;
    const kept = this.cards.slice(removed);
    const exiting = this.cards.slice(0, removed);
    const motions: SlotMotion[] = [];

    exiting.forEach((card, index) =>
      motions.push({
        card,
        fromX: this.slotX(index),
        toX: this.slotX(index - removed),
        fromAlpha: 1,
        toAlpha: 0,
      }),
    );
    kept.forEach((card, index) => {
      card.weather = periods[index].weather;
      // A front pulled in early (a debug pin, a long frame) moves the start of
      // everything behind it; keep the kept captions honest.
      if (index > 0) this.retimeCard(card, periods[index], minutes);
      motions.push({
        card,
        fromX: this.slotX(removed + index),
        toX: this.slotX(index),
        fromAlpha: 1,
        toAlpha: 1,
      });
    });

    const promotion = this.promote(kept[0]);

    // The fronts that just appeared in the forecast enter from the right edge,
    // behind the panel's clip, so the row reads as one strip moving through a
    // window rather than as a card popping into place.
    const entries: Card[] = [];
    for (let index = 0; index < removed; index += 1) {
      const slot = count - removed + index;
      const card = this.makeCard(
        periods[slot],
        slot,
        minutes,
        false,
        this.span,
      );
      card.node.alpha = 0;
      motions.push({
        card,
        fromX: this.span,
        toX: this.slotX(slot),
        fromAlpha: 0,
        toAlpha: 1,
      });
      entries.push(card);
    }

    this.cards = [...kept, ...entries];
    this.slide = { elapsed: 0, motions, promotion, exiting };
  }

  /**
   * Makes the card that just became «now» change its caption from a clock time
   * to the live one: the old text stays as a ghost and fades out while the new
   * one fades in, and the glyph slides to the centre of the new group.
   */
  private promote(card: Card): Promotion {
    const ghost = makeText(card.label.text, {
      size: 5.5,
      weight: 800,
      color: UI.textMuted,
      letterSpacing: 0.2,
    });
    ghost.anchor.set(0, 0.5);
    ghost.position.copyFrom(card.label.position);
    card.node.addChild(ghost);

    const fromIconX = card.icon.x;
    card.live = true;
    card.glow = 0;
    card.label.text = TEXT.forecast.now;
    card.label.style.fill = UI.text;
    this.place(card);
    const toIconX = card.icon.x;

    card.icon.x = fromIconX;
    card.label.alpha = 0;
    return { card, ghost, fromIconX, toIconX };
  }

  /** Advances the slide; finishes it by dropping the left-out cards. */
  private step(dt: number): void {
    const slide = this.slide;
    if (!slide) return;
    slide.elapsed = Math.min(SLIDE_TIME, slide.elapsed + dt);
    const eased = easeOutCubic(slide.elapsed / SLIDE_TIME);

    for (const motion of slide.motions) {
      motion.card.node.x = lerp(motion.fromX, motion.toX, eased);
      motion.card.node.alpha = lerp(motion.fromAlpha, motion.toAlpha, eased);
    }

    if (slide.promotion) {
      const { card, ghost, fromIconX, toIconX } = slide.promotion;
      card.icon.x = lerp(fromIconX, toIconX, eased);
      card.label.alpha = eased;
      ghost.alpha = 1 - eased;
      card.glow = eased;
      this.paintCard(card);
    }

    if (slide.elapsed < SLIDE_TIME) return;
    this.finish(slide);
  }

  /** Drops a slide immediately, so a re-layout cannot fight a running one. */
  private settle(): void {
    if (this.slide) this.finish(this.slide);
  }

  /** Applies the final state of `slide` and drops the cards it removed. */
  private finish(slide: Slide): void {
    for (const motion of slide.motions) {
      motion.card.node.x = motion.toX;
      motion.card.node.alpha = motion.toAlpha;
    }
    for (const card of slide.exiting) this.destroyCard(card);
    if (slide.promotion) {
      const { card, ghost, toIconX } = slide.promotion;
      ghost.destroy();
      card.label.alpha = 1;
      card.icon.x = toIconX;
      card.glow = 1;
      this.paintCard(card);
    }
    this.slide = null;
  }

  /** One card's glyph and caption, already placed on its slot in the row. */
  private makeCard(
    period: ForecastStep,
    slot: number,
    minutes: number,
    live: boolean,
    fromX?: number,
  ): Card {
    const node = new Container();
    node.position.set(fromX ?? this.slotX(slot), RAIL.pad);
    const well = new Graphics();
    const icon = new Graphics();
    // The glyph keeps the front's own colour, like the corner travel badges: a
    // coloured icon on the dark card reads at a glance and never fights the text.
    drawWeatherIcon(icon, period.weather, WEATHER_TINT[period.weather]);
    const label = makeText(
      live ? TEXT.forecast.now : formatClock(minutes + period.startsIn / 60),
      {
        size: 5.5,
        weight: 800,
        color: live ? UI.text : UI.textMuted,
        letterSpacing: 0.2,
      },
    );
    label.anchor.set(0, 0.5);
    label.y = RAIL.cardHeight / 2;
    node.addChild(well, icon, label);
    this.art.addChild(node);

    const card: Card = {
      weather: period.weather,
      live,
      node,
      well,
      icon,
      label,
      glow: live ? 1 : 0,
    };
    this.place(card);
    this.paintCard(card);
    return card;
  }

  /** Rewrites a kept card's clock caption when the schedule moved. */
  private retimeCard(card: Card, period: ForecastStep, minutes: number): void {
    const text = formatClock(minutes + period.startsIn / 60);
    if (card.label.text === text) return;
    card.label.text = text;
    this.place(card);
  }

  /** Centres the glyph and its caption in the card as one group. */
  private place(card: Card): void {
    const group = RAIL.icon + RAIL.labelGap + card.label.width;
    const iconX = Math.round((RAIL.cardWidth - group) / 2);
    card.icon.position.set(
      iconX,
      Math.round((RAIL.cardHeight - RAIL.icon) / 2),
    );
    card.label.x = iconX + RAIL.icon + RAIL.labelGap;
  }

  /** Paints one card's well from its current live glow. */
  private paintCard(card: Card): void {
    // Cards are wells sunk into the panel: the same indigo, darker. The live one
    // is the only raised surface in the row, so "now" reads without an ornament
    // that the 16 px card has no room for.
    const well = mixColor(UI.panel, UI.ink, 0.33);
    card.well
      .clear()
      .rect(0, 0, RAIL.cardWidth, RAIL.cardHeight)
      .fill(mixColor(well, UI.panelAlt, card.glow));
  }

  /** Fits the clip to the panel's inner face. */
  private paintClip(): void {
    this.clip
      .clear()
      .rect(RAIL.pad, RAIL.pad, this.span - RAIL.pad * 2, RAIL.cardHeight)
      .fill(0xffffff);
  }

  /** Left edge of a card slot in rail coordinates. */
  private slotX(slot: number): number {
    return RAIL.pad + slot * SLOT;
  }

  private destroyCard(card: Card): void {
    this.cards = this.cards.filter((other) => other !== card);
    card.node.destroy({ children: true });
  }
}
