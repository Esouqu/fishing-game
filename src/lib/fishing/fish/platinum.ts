import type { FishProgress } from "../types";

/**
 * The platinum frame of a codex species: the completion mark of one entry.
 *
 * It is deliberately the hardest badge in the game — a species has to be worked,
 * not merely met: a hundred of it, both ends of its weight, and its shiny coat.
 * Nothing about it changes the catch; it only changes how the well is framed.
 *
 * It lives here rather than in `config.ts` so the rules can read it without
 * `config` having to import the fish index, which would close an import cycle:
 * `platinum` → `config` → `fish/index` → `platinum`.
 */
export const PLATINUM = {
  /** Catches of one species needed for its platinum frame. */
  catches: 100,
} as const;

/**
 * Whether a species has earned its platinum frame.
 *
 * Three conditions, all of them about the species itself rather than about the
 * collection: a hundred catches of it, both ends of its weight (a heaviest and a
 * lightest specimen, not the same fish twice), and its shiny coat. The frame is
 * the one place the codex says "this entry is finished" — the roster shows it as
 * the only bright frame on the grid.
 */
export function isPlatinum(entry: FishProgress | undefined): boolean {
  if (!entry || entry.caught < PLATINUM.catches) return false;
  if (!entry.shiny) return false;
  return lowEnd(entry) < entry.bestKg;
}

/** Lower end of the species record; a missing minimum means "never set". */
export function lowEnd(entry: FishProgress): number {
  return entry.lightestKg > 0
    ? Math.min(entry.lightestKg, entry.bestKg)
    : entry.bestKg;
}
