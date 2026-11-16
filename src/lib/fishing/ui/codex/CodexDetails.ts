import { fishDescription, temperamentFor } from "../../fish";
import { formatWeight } from "../../fishWeight";
import { TEMPERAMENT_LABEL, TEXT, TIER_LABEL, WATER_ADJ } from "../../texts";
import { UI } from "../palette";
import { setText } from "../theme";
import { TIER_COLOR } from "../tier";
import { CodexGrid } from "./CodexGrid";
import type { Cell } from "./setup";

/**
 * The right half of the split: one entry card for the fish under the pointer
 * (or under the keyboard focus), rebuilt from the progress snapshot.
 *
 * The card is fixed in place and size, so the roster next to it never has to
 * dodge a tooltip. Everything below the name is filled in place; the blurb is
 * the only block that changes height. The temperament is the first word of that
 * blurb now — a separate temperament footer only repeated what the roster
 * already taught and took room the notes needed.
 */
export class CodexDetails extends CodexGrid {
  protected showFocusedDetails(): void {
    const index = this.focus.currentIndex;
    if (index < 0 || index >= this.cells.length) return;
    this.showDetails(this.cells[index]);
  }

  protected showDetails(cell: Cell): void {
    const entry = this.game.progress.snapshot.fish[cell.fish.id];
    const caught = (entry?.caught ?? 0) > 0;

    this.portrait.texture = this.game.assets.fish[cell.fish.id];
    // An uncaught species is a silhouette, exactly like its roster cell: the
    // slot behind it is light so the ink shape still reads.
    this.portrait.tint = caught ? 0xffffff : UI.ink;
    this.portrait.alpha = caught ? 1 : 0.9;

    setText(
      this.detailsName,
      (caught ? cell.fish.name : TEXT.codex.unknown).toUpperCase(),
    );
    this.detailsName.style.fill = caught ? UI.text : UI.textMuted;

    // The water, the tier and the habits stay hidden until the first catch; the
    // card then shows the unlock hint instead of the species notes.
    this.detailsType.visible = caught;
    this.detailsRecord.visible = caught;
    if (caught) {
      const temperament = temperamentFor(cell.fish);
      setText(
        this.detailsType,
        `${WATER_ADJ[cell.area.water].toUpperCase()} · ${TIER_LABEL[cell.fish.tier]}`,
      );
      this.detailsType.style.fill = TIER_COLOR[cell.fish.tier];
      setText(
        this.detailsRecord,
        TEXT.codex.record(entry.caught, formatWeight(entry.bestKg)),
      );
      setText(
        this.detailsDesc,
        `${TEMPERAMENT_LABEL[temperament]}. ${fishDescription(cell.fish)}`,
      );
    } else {
      setText(this.detailsDesc, TEXT.codex.locked);
    }

    this.markSelection(cell);
  }
}
