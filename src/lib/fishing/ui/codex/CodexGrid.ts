import { Container, Graphics, Sprite } from "pixi.js";
import { AREAS, type AreaDef } from "../../areas";
import { fishInArea } from "../../fish";
import { TEXT } from "../../texts";
import { UI } from "../palette";
import { makeText } from "../theme";
import { TIER_COLOR } from "../tier";
import { Button } from "../Button";
import { CodexBase } from "./CodexBase";
import { GRID, type Cell } from "./setup";

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

    roster.forEach((fish, index) => {
      const column = index % GRID.columns;
      const row = Math.floor(index / GRID.columns);
      const button = new Button({
        width: GRID.cellWidth - 2,
        height: GRID.cellHeight - 2,
        variant: "ghost",
      });
      button.position.set(
        GRID.x + column * GRID.cellWidth,
        GRID.y + row * GRID.cellHeight,
      );

      const caught =
        (this.game.progress.snapshot.fish[fish.id]?.caught ?? 0) > 0;
      // A lighter slot keeps the black silhouette readable on the dark panel.
      const slot = new Graphics();
      slot
        .roundRect((GRID.cellWidth - 2) / 2 - 16, 0, 32, 30, 3)
        .fill({ color: caught ? UI.panelAlt : UI.surface, alpha: 0.55 });
      slot.eventMode = "none";
      button.addChild(slot);

      const icon = new Sprite(this.game.assets.fish[fish.id]);
      icon.anchor.set(0.5);
      icon.scale.set(1.6);
      icon.position.set((GRID.cellWidth - 2) / 2, 14);
      icon.eventMode = "none";
      if (!caught) {
        icon.tint = UI.ink;
        icon.alpha = 0.92;
      }
      button.addChild(icon);

      const tier = new Graphics();
      tier
        .rect(3, 3, 3, 3)
        .fill({ color: TIER_COLOR[fish.tier], alpha: caught ? 1 : 0.4 });
      // Rarity is knowledge as well: an unseen fish shows no tier at all.
      tier.visible = caught;
      tier.eventMode = "none";
      button.addChild(tier);

      const name = makeText(caught ? fish.name : TEXT.codex.unknown, {
        size: 6.5,
        color: caught ? UI.text : UI.textMuted,
        align: "center",
        lineHeight: 7.5,
        wordWrapWidth: GRID.cellWidth - 8,
      });
      name.position.set((GRID.cellWidth - 2) / 2, 25);
      name.eventMode = "none";
      button.addChild(name);

      const cell: Cell = { button, fish, area };
      button.on("pointertap", () => this.showTooltip(cell));
      button.on("pointerover", () => this.showTooltip(cell));
      button.on("pointerout", () => this.hideTooltip());
      layer.addChild(button);
      cells.push(cell);
    });

    return cells;
  }
}
