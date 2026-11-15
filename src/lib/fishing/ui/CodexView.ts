import { Container, Graphics, Sprite } from "pixi.js";
import type { Game } from "../Game";
import { VIEW } from "../config";
import { AREAS, type AreaDef } from "../areas";
import {
  TIER_COLOR,
  TIER_LABEL,
  fishDescription,
  fishInArea,
  temperamentFor,
  type FishSpecies,
} from "../fish";
import { formatWeight } from "../fishWeight";
import {
  TEMPERAMENT_HINT,
  TEMPERAMENT_LABEL,
  TEXT,
  WATER_ADJ,
  WATER_LABEL,
} from "../texts";
import type { AreaId } from "../types";
import { clamp } from "../utils";
import { Button } from "./Button";
import { FocusGroup } from "./FocusGroup";
import { UI } from "./palette";
import { PANEL_PAD, SCREEN_INSET, drawPanel, makeText, setText } from "./theme";

const PANEL = {
  x: SCREEN_INSET,
  y: SCREEN_INSET,
  width: VIEW.width - SCREEN_INSET * 2,
  height: VIEW.height - SCREEN_INSET * 2,
};
const CONTENT = {
  left: PANEL.x + PANEL_PAD,
  right: PANEL.x + PANEL.width - PANEL_PAD,
  width: PANEL.width - PANEL_PAD * 2,
};
const TITLE = { x: CONTENT.left, y: PANEL.y + 12 };
const TABS = {
  x: CONTENT.left,
  y: 50,
  width: (CONTENT.width - 16) / 3,
  height: 18,
  gap: 8,
};
/**
 * Five columns by four rows. The largest roster is 16 species, so four rows
 * hold every water body; the row height is sized to the new content box so the
 * last row never runs under the panel edge.
 */
const GRID = {
  x: CONTENT.left + 12,
  y: 74,
  cellWidth: 80,
  cellHeight: 42,
  columns: 5,
};
/** Tooltip: fixed width, height follows the wrapped blurb so no dead space. */
const TIP = { width: 190, minHeight: 58, padding: 8 };

interface Cell {
  button: Button;
  fish: FishSpecies;
  area: AreaDef;
}

/** Codex grid: art + name, black silhouettes until caught, hover tooltips. */
export class CodexView extends Container {
  private readonly game: Game;
  private readonly closeLabel: string;
  private readonly onClose: () => void;
  private readonly tabs: Button[] = [];
  private readonly focus = new FocusGroup();
  private cells: Cell[] = [];
  private readonly cellsByArea = new Map<AreaId, Cell[]>();
  private readonly gridContainers = new Map<AreaId, Container>();
  private area: AreaDef;
  private mode: "tabs" | "grid" = "grid";

  private readonly gridLayer = new Container();
  private readonly tipLayer = new Container();
  private readonly tipPanel = new Graphics();
  private readonly tipName = makeText("", {
    size: 10,
    weight: 800,
    color: UI.text,
  });
  private readonly tipType = makeText("", { size: 7, color: UI.textMuted });
  private readonly tipDesc = makeText("", {
    size: 7,
    color: UI.textMuted,
    lineHeight: 9,
    wordWrapWidth: TIP.width - 16,
  });

  constructor(
    game: Game,
    initialAreaId: AreaId,
    closeLabel: string,
    onClose: () => void,
  ) {
    super();
    this.game = game;
    this.closeLabel = closeLabel;
    this.onClose = onClose;
    this.area = AREAS.find((area) => area.id === initialAreaId) ?? AREAS[0];

    this.buildChrome();
    this.buildTooltip();
    this.buildGrids();
    this.addChild(this.gridLayer);
    this.addChild(this.tipLayer);
    this.selectArea(this.area);
  }

  private buildChrome(): void {
    const panel = new Graphics();
    drawPanel(panel, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
      fill: UI.panel,
      alpha: 0.97,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText(TEXT.codex.title, {
      size: 18,
      weight: 800,
      color: UI.text,
      letterSpacing: 1,
    });
    title.position.set(TITLE.x, TITLE.y);
    this.addChild(title);

    const close = new Button({
      label: this.closeLabel,
      width: 100,
      height: 18,
      variant: "primary",
      size: 9,
      onClick: () => this.onClose(),
    });
    close.position.set(CONTENT.right - 100, TITLE.y);
    this.addChild(close);

    AREAS.forEach((area, index) => {
      const tab = new Button({
        label: WATER_LABEL[area.water],
        width: TABS.width,
        height: TABS.height,
        size: 8,
        selected: area.id === this.area.id,
        onClick: () => this.selectArea(area),
      });
      tab.position.set(TABS.x + index * (TABS.width + TABS.gap), TABS.y);
      this.addChild(tab);
      this.tabs.push(tab);
    });

    const rule = new Graphics();
    rule.rect(CONTENT.left, 70, CONTENT.width, 1).fill({
      color: UI.periwinkle,
      alpha: 0.45,
    });
    this.addChild(rule);

    this.focus.onMove = () => this.showFocusedTooltip();
  }

  private buildTooltip(): void {
    this.tipLayer.visible = false;
    this.tipLayer.eventMode = "none";
    drawPanel(this.tipPanel, 0, 0, TIP.width, TIP.minHeight, {
      fill: UI.ink,
      alpha: 0.97,
      shadow: true,
    });
    this.tipLayer.addChild(this.tipPanel);
    this.tipName.position.set(8, 6);
    this.tipType.position.set(8, 21);
    this.tipDesc.position.set(8, 32);
    this.tipLayer.addChild(this.tipName, this.tipType, this.tipDesc);
  }

  private selectArea(area: AreaDef): void {
    this.area = area;
    for (const tab of this.tabs) {
      tab.setSelected(tab === this.tabs[AREAS.indexOf(area)]);
    }
    // No click sound here: the tab is a Button and already plays one.

    // Every area grid is built once; switching only toggles visibility, so no
    // Text/Button objects are destroyed or re-rasterized on a tab click.
    for (const [id, layer] of this.gridContainers) {
      layer.visible = id === area.id;
    }
    this.cells = this.cellsByArea.get(area.id) ?? [];
    this.mode = "grid";
    // Opening the codex must not outline the first fish: the ring is a keyboard
    // affordance and appears on the first arrow key. Once the player is
    // navigating, switching tabs keeps the ring on the new grid.
    const keyboard = this.focus.keyboardActive;
    this.focus.setItems(
      this.cells.map((cell) => cell.button),
      GRID.columns,
    );
    if (keyboard) this.focus.focus(0);
    else this.focus.select(0);
    this.tipLayer.visible = false;
  }
  private buildGrids(): void {
    for (const area of AREAS) {
      const layer = new Container();
      layer.visible = false;
      this.gridLayer.addChild(layer);
      const cells = this.buildAreaGrid(area, layer);
      this.gridContainers.set(area.id, layer);
      this.cellsByArea.set(area.id, cells);
    }
  }

  private buildAreaGrid(area: AreaDef, layer: Container): Cell[] {
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

  private showFocusedTooltip(): void {
    const index = this.focus.currentIndex;
    if (index < 0 || index >= this.cells.length) return;
    this.showTooltip(this.cells[index]);
  }

  private showTooltip(cell: Cell): void {
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

  private hideTooltip(): void {
    if (this.mode === "tabs") return;
    this.tipLayer.visible = false;
  }

  private cycleArea(delta: number): void {
    const index = AREAS.indexOf(this.area);
    const next = (index + delta + AREAS.length) % AREAS.length;
    this.selectArea(AREAS[next]);
    this.game.audio.hover();
  }

  handleKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape" || event.code === "Backspace") {
      this.game.audio.back();
      this.onClose();
      return true;
    }

    if (event.code === "Tab") {
      this.mode = this.mode === "tabs" ? "grid" : "tabs";
      if (this.mode === "grid") {
        this.focus.focus(0);
        this.showFocusedTooltip();
      } else {
        this.tipLayer.visible = false;
      }
      return true;
    }

    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      if (this.mode === "tabs") {
        this.cycleArea(-1);
        return true;
      }
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      if (this.mode === "tabs") {
        this.cycleArea(1);
        return true;
      }
    }

    if (this.mode === "tabs") {
      if (event.code === "ArrowDown" || event.code === "Enter") {
        this.mode = "grid";
        this.focus.focus(0);
        this.showFocusedTooltip();
      }
      return true;
    }

    if (event.code === "ArrowUp") {
      if (this.focus.currentIndex < GRID.columns) {
        this.mode = "tabs";
        this.tipLayer.visible = false;
        return true;
      }
    }
    if (event.code === "ArrowDown") {
      const next = this.focus.currentIndex + GRID.columns;
      if (next >= this.cells.length) {
        this.mode = "tabs";
        this.tipLayer.visible = false;
        return true;
      }
    }
    return this.focus.handleKey(event);
  }
}
