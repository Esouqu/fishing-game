import { fishInArea, isPlatinum, PLATINUM } from "../../fish";
import type { AreaId, FishProgress, ProgressSnapshot } from "../../types";

/**
 * Dev-only preview of a completed well.
 *
 * Reaching platinum honestly takes a hundred catches, both ends of the weight
 * and a shiny coat — too long a loop to look at the plate shader. In a dev build,
 * when the document has no platinum entry at all, the first species of the tab
 * the codex opens on gets a synthetic finished record.
 *
 * The record is served through `CodexBase.fishEntry`, so the roster and the
 * entry card read the same numbers: the plate, the tally and the «РАДУЖНАЯ» row
 * cannot disagree. Nothing is written back to storage, and the branch is dropped
 * from a production build.
 */
export function devPlatinumPreview(
  areaId: AreaId,
  snapshot: ProgressSnapshot,
): { fishId: string; entry: FishProgress } | null {
  if (!import.meta.env.DEV) return null;
  if (Object.values(snapshot.fish).some((entry) => isPlatinum(entry)))
    return null;
  const fish = fishInArea(areaId)[0];
  if (!fish) return null;
  const [lightestKg, bestKg] = fish.weightKg;
  return {
    fishId: fish.id,
    entry: {
      caught: PLATINUM.catches,
      bestKg,
      lightestKg,
      shiny: true,
    },
  };
}
