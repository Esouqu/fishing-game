import type { ForecastStep } from "../world";

/**
 * Pixel geometry of the weather rail, in virtual units.
 *
 * The rail is a slim panel holding a fixed number of card slots. Half the
 * height of the corner travel cards on purpose: it is a readout, not a picture.
 * A card is one row — the weather glyph and the caption (the clock, or «СЕЙЧАС»
 * for the period in progress) centred in it as one group. The row is always
 * {@link RAIL_SLOTS} slots wide, so the panel never changes size; a period that
 * folds several fronts together takes one slot per front and drops the divider
 * between them instead of getting a narrower card.
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

/** How many card slots the rail always shows. */
export const RAIL_SLOTS = 4;

/** One period as it is drawn: how many of the four slots it spans. */
export interface RailPeriod extends ForecastStep {
  slots: number;
}

/** Panel width that holds `count` equal cards, padding and gaps included. */
export function railWidth(count: number): number {
  return (
    RAIL.pad * 2 + count * RAIL.cardWidth + Math.max(0, count - 1) * RAIL.gap
  );
}

/** Width of one period drawn across `slots` slots; the dividers collapse. */
export function periodWidth(slots: number): number {
  return slots * RAIL.cardWidth + Math.max(0, slots - 1) * RAIL.gap;
}

/**
 * Folds consecutive fronts of the same sky into one period that keeps their
 * slots, so the row stays four slots wide.
 *
 * The clock rolls a new front every minute or two even when nothing changes,
 * and a rail that printed `ЯСНО | ЯСНО | ЯСНО` was three identical cards
 * pretending to be news. Two identical neighbours are one period drawn across
 * two slots with no separator: the eye reads one longer block of the same sky,
 * and its length is what the player actually cares about — how long until the
 * sky turns. A queue shorter than the rail leaves the spare slots with the last
 * front rather than shrinking the panel.
 */
export function railPeriods(
  steps: readonly ForecastStep[],
  slots = RAIL_SLOTS,
): RailPeriod[] {
  const periods: RailPeriod[] = [];
  let used = 0;
  for (const step of steps) {
    if (used >= slots) break;
    const last = periods[periods.length - 1];
    if (last && last.weather === step.weather) {
      last.endsIn = step.endsIn;
      last.length += step.length;
      last.slots += 1;
      used += 1;
      continue;
    }
    periods.push({ ...step, slots: 1 });
    used += 1;
  }
  if (periods.length === 0) return periods;
  periods[periods.length - 1].slots += slots - used;
  return periods;
}
