import { Container, Graphics, Sprite } from "pixi.js";
import { AREAS, type AreaDef } from "../../areas";
import { fishInArea } from "../../fish";
import { formatWeight } from "../../fishWeight";
import { TEXT } from "../../texts";
import { UI } from "../palette";
import { makeText } from "../theme";
import { anchorInk } from "../textInk";
import { Button } from "../Button";
import { CodexBase } from "./CodexBase";
import { GRID, type Cell } from "./setup";

/**
 * The left half of the split: a 4×4 roster of wells.
 *
 * A slot is a picture, not a label — the name, the rarity dot and the «???» of
 * an unseen species are gone, the fish is centred, and the two numbers the
 * player actually tracks (catches and the record weight) sit under it. The
 * species name is the entry card's job on the right. Lake and river have twelve
 * species, so the remaining four wells are drawn empty on purpose.
 */
export abstract class CodexGrid extends CodexBase {
  protected buildGrids(): void {
    for (const area of AREAS) {
      const layer = new Container();
      layer.visible = false;
      this.gridLayer.addChild(layer);
      const cells = this.buildAreaGrid(area, layer);
      this.gridContainers.set(area.id, layer);
      this.cellsByArea.set(area.id, cells);
    }
  }

  protected buildAreaGrid(area: AreaDef, layer: Container): Cell[] {
    const cells: Cell[] = [];
    const roster = fishInArea(area.id);
    const width = GRID.cellWidth - 2;
    const height = GRID.cellHeight - 2;

    roster.forEach((fish, index) => {
      const column = index % GRID.columns;
      const row = Math.floor(index / GRID.columns);
      const button = new Button({
        width,
        height,
        variant: "ghost",
      });
      button.position.set(
        GRID.x + column * GRID.cellWidth,
        GRID.y + row * GRID.cellHeight,
      );

      const entry = this.game.progress.snapshot.fish[fish.id];
      const caught = (entry?.caught ?? 0) > 0;

      // A lighter well keeps the ink silhouette of an unseen fish readable on
      // the dark panel.
      const slot = new Graphics();
      slot.roundRect(1, 1, width - 2, height - 2, 3).fill({
        color: caught ? UI.panelAlt : UI.surface,
        alpha: caught ? 0.32 : 0.55,
      });
      slot.eventMode = "none";
      button.addChild(slot);

      const icon = new Sprite(this.game.assets.fish[fish.id]);
      icon.anchor.set(0.5);
      icon.scale.set(1.45);
      // The picture owns the slot dead centre; the numbers live in its corners.
      icon.position.set(width / 2, height / 2);
      icon.eventMode = "none";
      if (!caught) {
        icon.tint = UI.ink;
        icon.alpha = 0.92;
      }
      button.addChild(icon);

      if (caught && entry) {
        const weight = makeText(
          TEXT.codex.slotWeight(formatWeight(entry.bestKg)),
          {
            size: 6.5,
            color: UI.textMuted,
          },
        );
        anchorInk(weight, "left", "bottom");
        weight.position.set(4, height - 2);
        weight.eventMode = "none";
        button.addChild(weight);

        const count = makeText(TEXT.codex.slotCount(entry.caught), {
          size: 6.5,
          color: UI.text,
        });
        anchorInk(count, "right", "bottom");
        count.position.set(width - 4, height - 2);
        count.eventMode = "none";
        button.addChild(count);
      }

      const cell: Cell = { button, fish, area };
      // Both open the entry card. Leaving the cell keeps the last entry: the
      // card is a fixed pane, and blanking it on every pointer move made the
      // whole right half of the window flicker.
      button.on("pointertap", () => this.showDetails(cell));
      button.on("pointerover", () => this.showDetails(cell));
      layer.addChild(button);
      cells.push(cell);
    });

    this.buildEmptySlots(layer, roster.length);
    return cells;
  }

  /** Wells past the end of the roster, so a short roster still fills the grid. */
  private buildEmptySlots(layer: Container, filled: number): void {
    const width = GRID.cellWidth - 2;
    const height = GRID.cellHeight - 2;
    for (let index = filled; index < GRID.slots; index += 1) {
      const column = index % GRID.columns;
      const row = Math.floor(index / GRID.columns);
      const x = GRID.x + column * GRID.cellWidth;
      const y = GRID.y + row * GRID.cellHeight;

      const empty = new Graphics();
      empty
        .roundRect(x + 1, y + 1, width - 2, height - 2, 3)
        .fill({ color: UI.ink, alpha: 0.22 });
      empty
        .roundRect(x + 1, y + 1, width - 2, height - 2, 3)
        .stroke({ width: 1, color: UI.periwinkle, alpha: 0.14 });
      // A short dash instead of a picture: the well reads as "nothing here".
      empty
        .rect(x + width / 2 - 4, y + height / 2, 8, 1)
        .fill({ color: UI.periwinkle, alpha: 0.2 });
      empty.eventMode = "none";
      layer.addChild(empty);
    }
  }
}
