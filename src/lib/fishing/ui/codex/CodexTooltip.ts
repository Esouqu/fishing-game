import { fishDescription, temperamentFor } from "../../fish";
import { formatWeight } from "../../fishWeight";
import {
  TEMPERAMENT_HINT,
  TEMPERAMENT_LABEL,
  TEXT,
  TIER_LABEL,
  WATER_ADJ,
} from "../../texts";
import { clamp } from "../../utils";
import { UI } from "../palette";
import { drawPanel, setText } from "../theme";
import { TIER_COLOR } from "../tier";
import { CodexGrid } from "./CodexGrid";
import { GRID, TIP, type Cell } from "./setup";
import { VIEW } from "../../config";

export class CodexTooltip extends CodexGrid {
  protected showFocusedTooltip(): void {
    const index = this.focus.currentIndex;
    if (index < 0 || index >= this.cells.length) return;
    this.showTooltip(this.cells[index]);
  }

  protected showTooltip(cell: Cell): void {
    const entry = this.game.progress.snapshot.fish[cell.fish.id];
    const caught = (entry?.caught ?? 0) > 0;
    setText(
      this.tipName,
      (caught ? cell.fish.name : TEXT.codex.unknown).toUpperCase(),
    );
    this.tipName.style.fill = caught ? UI.text : UI.textMuted;

    // The water, the tier and the habits stay hidden until the first catch;
    // the tooltip then shows the unlock hint instead of the species notes.
    this.tipType.visible = caught;
    if (caught) {
      setText(
        this.tipType,
        `${WATER_ADJ[cell.area.water].toUpperCase()} · ${TIER_LABEL[cell.fish.tier]}`,
      );
      this.tipType.style.fill = TIER_COLOR[cell.fish.tier];
    }
    this.tipDesc.y = caught ? 32 : 21;
    if (caught && entry) {
      const temperament = temperamentFor(cell.fish);
      setText(
        this.tipDesc,
        [
          fishDescription(cell.fish),
          `${TEXT.codex.temperament}: ${TEMPERAMENT_LABEL[temperament]} — ${TEMPERAMENT_HINT[temperament]}`,
          TEXT.codex.record(entry.caught, formatWeight(entry.bestKg)),
        ].join("\n"),
      );
    } else {
      setText(this.tipDesc, TEXT.codex.locked);
    }

    // The blurb length differs per species, so the panel is re-rasterized to
    // hug the text instead of leaving a fixed half-empty box.
    const height = Math.max(
      TIP.minHeight,
      Math.round(this.tipDesc.y + this.tipDesc.height + TIP.padding),
    );
    this.tipPanel.clear();
    drawPanel(this.tipPanel, 0, 0, TIP.width, height, {
      fill: UI.ink,
      alpha: 0.97,
      shadow: true,
    });

    const x = clamp(
      cell.button.x + GRID.cellWidth + 4,
      4,
      VIEW.width - TIP.width - 4,
    );
    const y = clamp(cell.button.y + 8, 4, VIEW.height - height - 4);
    this.tipLayer.position.set(x, y);
    this.tipLayer.visible = true;
  }

  protected hideTooltip(): void {
    if (this.mode === "tabs") return;
    this.tipLayer.visible = false;
  }
}
