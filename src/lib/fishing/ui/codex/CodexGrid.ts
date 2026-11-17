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
 * How far the numbers are lifted off the well's bottom rim, in pixels. They used
 * to be anchored on the rim itself, so the ink sat on the slot's lower border
 * and the whole cell read as cramped.
 */
const CAPTION_LIFT = 5;

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

  /**
   * Box of one well inside the roster block. Cells are flush: the grid's
   * hairlines are drawn as one set of lines over them (see
   * {@link paintGridLines}), so a cell has no frame of its own and two
   * neighbours share the line between them instead of each drawing one.
   */
  private cellBox(
    column: number,
    row: number,
  ): {
    x: number;
    y: number;
    w: number;
    h: number;
  } {
    return {
      x: GRID.x + column * GRID.cellWidth,
      y: GRID.y + row * GRID.cellHeight,
      w: GRID.cellWidth,
      h: GRID.cellHeight,
    };
  }

  protected buildAreaGrid(area: AreaDef, layer: Container): Cell[] {
    const cells: Cell[] = [];
    const roster = fishInArea(area.id);

    roster.forEach((fish, index) => {
      const column = index % GRID.columns;
      const row = Math.floor(index / GRID.columns);
      const { x, y, w: width, h: height } = this.cellBox(column, row);
      // Bare: the roster cell is an input surface only. Its fill is drawn below
      // and its frame comes from the shared line layer, so hovering never paints
      // a second, thicker edge over the grid.
      const button = new Button({
        width,
        height,
        variant: "ghost",
        bare: true,
      });
      button.position.set(x, y);

      const entry = this.game.progress.snapshot.fish[fish.id];
      const caught = (entry?.caught ?? 0) > 0;

      // The well: one flush socket per fish. Its frame is the grid's, not its
      // own — a per-cell stroke made the outside of the roster two pixels thick
      // while the seams inside it stayed one. The socket's own styling is drawn
      // one pixel in from that frame, so it never doubles the edge: an ink lip
      // along the top and left where the well sits under the plate, and a cold
      // highlight along the bottom and right where the light catches it. It is
      // the same sunken treatment the panels use for their inner bevel.
      const slot = new Graphics();
      const well = caught
        ? { color: UI.panelAlt, alpha: 0.34 }
        : { color: UI.surface, alpha: 0.5 };
      slot.rect(0, 0, width, height).fill(well);
      slot
        .rect(1, 1, width - 2, 1)
        .fill({ color: UI.ink, alpha: caught ? 0.32 : 0.24 });
      slot
        .rect(1, 1, 1, height - 2)
        .fill({ color: UI.ink, alpha: caught ? 0.2 : 0.16 });
      slot
        .rect(1, height - 2, width - 2, 1)
        .fill({ color: UI.periwinklePale, alpha: caught ? 0.18 : 0.14 });
      slot
        .rect(width - 2, 1, 1, height - 2)
        .fill({ color: UI.periwinklePale, alpha: caught ? 0.09 : 0.07 });
      slot.eventMode = "none";
      button.addChild(slot);

      const icon = new Sprite(this.game.assets.fish[fish.id]);
      icon.anchor.set(0.5);
      icon.scale.set(1.3);
      // Dead centre of the well: the picture is the slot's subject and must not
      // drift to make room for the numbers.
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
        weight.position.set(4, height - CAPTION_LIFT);
        weight.eventMode = "none";
        button.addChild(weight);

        const count = makeText(TEXT.codex.slotCount(entry.caught), {
          size: 6.5,
          color: UI.text,
        });
        anchorInk(count, "right", "bottom");
        count.position.set(width - 4, height - CAPTION_LIFT);
        count.eventMode = "none";
        button.addChild(count);
      }

      const cell: Cell = { button, fish, area, w: width, h: height };
      // Both open the entry card. Leaving the cell keeps the last entry: the
      // card is a fixed pane, and blanking it on every pointer move made the
      // whole right half of the window flicker.
      button.on("pointertap", () => this.showDetails(cell));
      button.on("pointerover", () => this.showDetails(cell));
      layer.addChild(button);
      cells.push(cell);
    });

    this.buildEmptySlots(layer, roster.length);
    this.paintGridLines(layer);
    return cells;
  }

  /**
   * The roster's frame: the same one-pixel line for the outside edge and for
   * every seam inside it.
   *
   * It used to be each well's own stroke, inset by a two-pixel seam. At the
   * border of the block that seam read as a second, darker band on top of the
   * stroke, so the roster looked framed twice as heavily outside as inside.
   * Drawing the lines once, after the sockets, makes every edge exactly one
   * pixel and gives the sliding outline one grid to travel over.
   */
  private paintGridLines(layer: Container): void {
    const lines = new Graphics();
    const x0 = GRID.x;
    const y0 = GRID.y;
    const width = GRID.columns * GRID.cellWidth;
    const height = GRID.rows * GRID.cellHeight;
    const style = { color: UI.ink, alpha: 0.55 };

    // The outer frame sits on the boundary *after* the last cell, so the last
    // vertical line has to carry one extra pixel down to the bottom frame. It
    // did not, and the block's bottom-right corner was the one place where the
    // two lines never met. Only that line grows: a longer interior seam would
    // lay a second fill over the bottom frame and print a darker dot at every
    // column.
    for (let column = 0; column <= GRID.columns; column += 1) {
      // Rounding keeps every seam on the pixel grid even when the roster width
      // is not a multiple of four.
      const x = Math.round(x0 + column * GRID.cellWidth);
      const reach = column === GRID.columns ? height + 1 : height;
      lines.rect(x, y0, 1, reach).fill(style);
    }
    for (let row = 0; row <= GRID.rows; row += 1) {
      const y = Math.round(y0 + row * GRID.cellHeight);
      lines.rect(x0, y, width, 1).fill(style);
    }
    lines.eventMode = "none";
    layer.addChild(lines);
  }

  /** Wells past the end of the roster, so a short roster still fills the grid. */
  private buildEmptySlots(layer: Container, filled: number): void {
    for (let index = filled; index < GRID.slots; index += 1) {
      const column = index % GRID.columns;
      const row = Math.floor(index / GRID.columns);
      const { x, y, w: width, h: height } = this.cellBox(column, row);

      const empty = new Graphics();
      empty.rect(x, y, width, height).fill({ color: UI.ink, alpha: 0.22 });
      // The same sunken lip as a filled socket, one pixel inside the grid line.
      empty
        .rect(x + 1, y + 1, width - 2, 1)
        .fill({ color: UI.ink, alpha: 0.18 });
      empty
        .rect(x + 1, y + height - 2, width - 2, 1)
        .fill({ color: UI.periwinklePale, alpha: 0.07 });
      // A short dash instead of a picture: the well reads as "nothing here".
      empty
        .rect(x + width / 2 - 4, y + height / 2, 8, 1)
        .fill({ color: UI.periwinkle, alpha: 0.2 });
      empty.eventMode = "none";
      layer.addChild(empty);
    }
  }
}
