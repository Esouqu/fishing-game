import { Container, Graphics } from "pixi.js";
import { TEXT, WEATHER_LABEL } from "../texts";
import type { WeatherId } from "../types";
import { WEATHER_IDS } from "../world";
import { Button } from "./Button";
import { UI } from "./palette";
import { drawPanel, makeText } from "./theme";

/** Panel geometry, in the 480×270 virtual frame. */
const PANEL = { x: 8, y: 8, width: 294, height: 34 } as const;
const ROW = { top: PANEL.y + 12, width: 54, height: 14, gap: 2 } as const;

export interface DevWeatherDeps {
  /** Front of the water body the player is on right now. */
  current(): WeatherId;
  /** Sets the front for that water body and persists it. */
  onPick(weather: WeatherId): void;
  onClose(): void;
}

/**
 * Dev-only weather picker (`F3`).
 *
 * The weather is normally rolled by the world clock, which means a front you
 * want to look at may be half an hour away. This panel pins it: one button per
 * front, applied to the current water body and saved, so the choice survives a
 * reload. It is deliberately not part of any menu — nothing in the UI points at
 * it and it only opens on the hotkey.
 */
export class DevWeatherPanel extends Container {
  private readonly deps: DevWeatherDeps;
  private readonly buttons = new Map<WeatherId, Button>();
  private open_ = false;

  constructor(deps: DevWeatherDeps) {
    super();
    this.deps = deps;
    this.visible = false;

    const panel = new Graphics();
    drawPanel(panel, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
      fill: UI.panel,
      alpha: 0.97,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText(TEXT.devtools.weather, {
      size: 7,
      weight: 800,
      color: UI.text,
      letterSpacing: 0.6,
    });
    title.position.set(PANEL.x + 8, PANEL.y + 3);
    this.addChild(title);

    const hint = makeText(TEXT.devtools.weatherHint, {
      size: 6,
      color: UI.textMuted,
      align: "right",
    });
    hint.anchor.set(1, 0);
    hint.position.set(PANEL.x + PANEL.width - 8, PANEL.y + 4);
    this.addChild(hint);

    WEATHER_IDS.forEach((id, index) => {
      const button = new Button({
        label: WEATHER_LABEL[id],
        width: ROW.width,
        height: ROW.height,
        size: 6,
        onClick: () => {
          this.deps.onPick(id);
          this.refresh();
        },
      });
      button.position.set(PANEL.x + 8 + index * (ROW.width + ROW.gap), ROW.top);
      this.addChild(button);
      this.buttons.set(id, button);
    });
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    this.visible = true;
    this.refresh();
  }

  close(): void {
    this.open_ = false;
    this.visible = false;
  }

  /** Highlights the front that is live right now. */
  refresh(): void {
    const current = this.deps.current();
    for (const [id, button] of this.buttons) {
      button.setSelected(id === current);
    }
  }

  /** `F3` / `Escape` while open; returns true when the panel consumed the key. */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.open_) return false;
    if (event.code === "Escape" || event.code === "F3") {
      this.deps.onClose();
      return true;
    }
    return false;
  }
}
