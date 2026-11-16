import { Container, Graphics } from "pixi.js";
import type { GameContext } from "../../GameContext";
import { AREAS, type AreaDef } from "../../areas";
import { TEXT, WATER_LABEL } from "../../texts";
import type { AreaId } from "../../types";
import { Button } from "../Button";
import { FocusGroup } from "../FocusGroup";
import { UI } from "../palette";
import { drawPanel, makeText } from "../theme";
import { CONTENT, GRID, PANEL, TABS, TIP, TITLE, type Cell } from "./setup";

export abstract class CodexBase extends Container {
  protected readonly game: GameContext;
  protected readonly closeLabel: string;
  protected readonly onClose: () => void;
  protected readonly tabs: Button[] = [];
  protected readonly focus = new FocusGroup();
  protected cells: Cell[] = [];
  protected readonly cellsByArea = new Map<AreaId, Cell[]>();
  protected readonly gridContainers = new Map<AreaId, Container>();
  protected area: AreaDef;
  protected mode: "tabs" | "grid" = "grid";

  protected readonly gridLayer = new Container();
  protected readonly tipLayer = new Container();
  protected readonly tipPanel = new Graphics();
  protected readonly tipName = makeText("", {
    size: 10,
    weight: 800,
    color: UI.text,
  });
  protected readonly tipType = makeText("", { size: 7, color: UI.textMuted });
  protected readonly tipDesc = makeText("", {
    size: 7,
    color: UI.textMuted,
    lineHeight: 9,
    wordWrapWidth: TIP.width - 16,
  });

  constructor(
    game: GameContext,
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

  protected buildChrome(): void {
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

  protected buildTooltip(): void {
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

  protected selectArea(area: AreaDef): void {
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
  protected cycleArea(delta: number): void {
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

  protected abstract buildGrids(): void;
  protected abstract showTooltip(cell: Cell): void;
  protected abstract showFocusedTooltip(): void;
  protected abstract hideTooltip(): void;
}
