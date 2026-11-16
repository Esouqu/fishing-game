import type { ForecastStep } from "../world";

/**
 * Pixel geometry of the weather rail, in virtual units.
 *
 * The rail is a slim panel holding one card per period. Half the height of the
 * corner travel cards on purpose: it is a readout, not a picture. A card is one
 * row — the weather glyph and the caption (the clock, or «СЕЙЧАС» for the period
 * in progress) centred in it as one group. Every card is the same fixed size, so
 * a period's length never changes how much room it gets and the row never
 * reflows.
 */
export const RAIL = {
  cardWidth: 42,
  cardHeight: 16,
  /** Space between two period cards. */
  gap: 3,
  /** Panel padding between the frame and the cards. */
  pad: 2,
  /** Air between the glyph and its caption. */
  labelGap: 3,
  /** Glyph footprint. */
  icon: 12,
} as const;

/** Panel height: the cards plus the panel's own padding. */
export const RAIL_HEIGHT = RAIL.pad * 2 + RAIL.cardHeight;

/** Panel width that holds `count` equal cards, padding and gaps included. */
export function railWidth(count: number): number {
  return (
    RAIL.pad * 2 + count * RAIL.cardWidth + Math.max(0, count - 1) * RAIL.gap
  );
}

/**
 * Folds consecutive fronts of the same sky into one period.
 *
 * The clock rolls a new front every minute or two even when nothing changes,
 * and a rail that printed `ЯСНО | ЯСНО | ЯСНО` was three identical cards
 * pretending to be news. Two identical neighbours are one period, and its
 * length is what the player actually cares about: how long until the sky turns.
 */
export function mergeRuns(steps: readonly ForecastStep[]): ForecastStep[] {
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
