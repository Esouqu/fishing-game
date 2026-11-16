import { Container, Graphics, Sprite } from "pixi.js";
import type { GameContext } from "../../GameContext";
import { AREAS, type AreaDef } from "../../areas";
import { TEXT, WATER_LABEL } from "../../texts";
import type { AreaId } from "../../types";
import { Button } from "../Button";
import { FocusGroup } from "../FocusGroup";
import { UI } from "../palette";
import { drawPanel, makeText } from "../theme";
import { CodexTabs } from "./CodexTabs";
import { CONTENT, DETAILS, GRID, PANEL, TABS, TITLE, type Cell } from "./setup";

export abstract class CodexBase extends Container {
  protected readonly game: GameContext;
  protected readonly onClose: () => void;
  protected tabs!: CodexTabs;
  protected readonly focus = new FocusGroup();
  protected cells: Cell[] = [];
  protected readonly cellsByArea = new Map<AreaId, Cell[]>();
  protected readonly gridContainers = new Map<AreaId, Container>();
  protected area: AreaDef;
  protected mode: "tabs" | "grid" = "grid";

  protected readonly gridLayer = new Container();
  /** Ring around the entry whose details the card is showing. */
  private readonly selection = new Graphics();

  /** Fixed entry card on the right of the split. */
  protected readonly detailsLayer = new Container();
  private readonly detailsPanel = new Graphics();
  private readonly portraitSlot = new Graphics();
  protected readonly portrait = new Sprite();
  protected readonly detailsName = makeText("", {
    size: 10,
    weight: 800,
    color: UI.text,
    align: "center",
  });
  protected readonly detailsType = makeText("", {
    size: 6.5,
    color: UI.textMuted,
    align: "center",
  });
  protected readonly detailsRecord = makeText("", {
    size: 6,
    color: UI.textMuted,
  });
  private readonly wrap = DETAILS.width - DETAILS.pad * 2;
  protected readonly detailsDesc = makeText("", {
    size: 6.5,
    color: UI.textMuted,
    lineHeight: 8.5,
    wordWrapWidth: this.wrap,
  });

  constructor(game: GameContext, initialAreaId: AreaId, onClose: () => void) {
    super();
    this.game = game;
    this.onClose = onClose;
    this.area = AREAS.find((area) => area.id === initialAreaId) ?? AREAS[0];

    this.buildChrome();
    this.buildDetails();
    this.buildGrids();
    this.addChild(this.gridLayer);
    // Above every grid, so the ring marks the shown entry no matter which tab
    // drew the cells.
    this.gridLayer.addChild(this.selection);
    this.addChild(this.detailsLayer);
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

    // Standard secondary button with a big uppercase «Х»: the codex used to end
    // with a full ice-white «ЗАКРЫТЬ» bar, which competed with the title for the
    // eye. The letter is a text glyph from the pixel font, so it stays crisp.
    const close = new Button({
      label: "Х",
      width: 18,
      height: 18,
      size: 15,
      variant: "secondary",
      marks: false,
      onClick: () => this.onClose(),
    });
    close.position.set(CONTENT.right - 18, TITLE.y);
    this.addChild(close);

    this.tabs = new CodexTabs({
      labels: AREAS.map((area) => WATER_LABEL[area.water]),
      width: TABS.width,
      height: TABS.height,
      onPick: (index) => {
        this.game.audio.click();
        this.selectArea(AREAS[index]);
      },
      onHover: () => this.game.audio.hover(),
    });
    this.tabs.position.set(TABS.x, TABS.y);
    this.addChild(this.tabs);

    this.focus.onMove = () => this.showFocusedDetails();
  }

  /**
   * The entry card is built once: a dark plate (the same ink the old floating
   * tooltip used), a portrait slot, the name, the water and tier, the record and
   * the blurb. Only the text changes as the pointer moves, so hovering the
   * roster never re-rasterizes a panel.
   */
  protected buildDetails(): void {
    const { width, height, pad } = DETAILS;
    this.detailsLayer.position.set(DETAILS.x, DETAILS.y);
    this.detailsLayer.eventMode = "none";

    drawPanel(this.detailsPanel, 0, 0, width, height, {
      fill: UI.ink,
      alpha: 0.55,
    });
    this.detailsLayer.addChild(this.detailsPanel);

    const centre = width / 2;
    const {
      y,
      width: portraitWidth,
      height: portraitHeight,
    } = DETAILS.portrait;
    // A lighter well behind the fish: an uncaught species is drawn as a black
    // silhouette and would vanish straight into the ink of the card.
    this.portraitSlot
      .rect(centre - portraitWidth / 2, y, portraitWidth, portraitHeight)
      .fill({ color: UI.surface, alpha: 0.5 });
    this.detailsLayer.addChild(this.portraitSlot);

    this.portrait.anchor.set(0.5);
    this.portrait.scale.set(2.4);
    this.portrait.position.set(centre, y + portraitHeight / 2);
    this.detailsLayer.addChild(this.portrait);

    this.detailsName.anchor.y = 0.5;
    this.detailsName.position.set(centre, DETAILS.nameY);
    this.detailsType.anchor.y = 0.5;
    this.detailsType.position.set(centre, DETAILS.typeY);
    this.detailsRecord.position.set(pad, DETAILS.recordY);

    const rule = new Graphics();
    rule.rect(pad, DETAILS.ruleY, width - pad * 2, 1).fill({
      color: UI.periwinkle,
      alpha: 0.35,
    });
    this.detailsLayer.addChild(rule);

    this.detailsDesc.position.set(pad, DETAILS.bodyTop);
    this.detailsLayer.addChild(
      this.detailsName,
      this.detailsType,
      this.detailsRecord,
      this.detailsDesc,
    );
  }

  protected selectArea(area: AreaDef): void {
    this.area = area;
    this.tabs.setSelected(AREAS.indexOf(area));

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
    // The card is never empty: it opens on the first species of the water body,
    // and the roster keeps the same entry marked.
    const first = this.cells[0];
    if (first) this.showDetails(first);
  }

  protected cycleArea(delta: number): void {
    const index = AREAS.indexOf(this.area);
    const next = (index + delta + AREAS.length) % AREAS.length;
    this.selectArea(AREAS[next]);
    this.game.audio.hover();
  }

  /** Marks the roster entry whose details the card is showing. */
  protected markSelection(cell: Cell): void {
    const g = this.selection;
    g.clear();
    g.rect(
      Math.round(cell.button.x) - 1,
      Math.round(cell.button.y) - 1,
      Math.round(GRID.cellWidth),
      Math.round(GRID.cellHeight),
    ).stroke({ width: 1, color: UI.periwinkle, alignment: 0 });
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
        this.showFocusedDetails();
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
        this.showFocusedDetails();
      }
      return true;
    }

    if (event.code === "ArrowUp") {
      if (this.focus.currentIndex < GRID.columns) {
        this.mode = "tabs";
        return true;
      }
    }
    if (event.code === "ArrowDown") {
      const next = this.focus.currentIndex + GRID.columns;
      if (next >= this.cells.length) {
        this.mode = "tabs";
        return true;
      }
    }
    return this.focus.handleKey(event);
  }

  protected abstract buildGrids(): void;
  protected abstract showDetails(cell: Cell): void;
  protected abstract showFocusedDetails(): void;
}
