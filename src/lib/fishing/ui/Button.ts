import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { C } from "../config";
import { CURSORS } from "../cursors";
import type { Focusable } from "./FocusGroup";
import { makeText } from "./theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonOptions {
  label?: string;
  width?: number;
  height?: number;
  variant?: ButtonVariant;
  size?: number;
  onClick?: () => void;
  /** Draws a 16x16 icon centered in the button instead of a label. */
  icon?: (g: Graphics) => void;
}

type SoundKind = "hover" | "click";

let soundHandler: ((kind: SoundKind) => void) | null = null;

export function setUiSoundHandler(
  handler: ((kind: SoundKind) => void) | null,
): void {
  soundHandler = handler;
}

export class Button extends Container implements Focusable {
  readonly background = new Graphics();
  private readonly labelText: Text | null = null;
  private readonly iconLayer = new Graphics();
  private readonly widthValue: number;
  private readonly heightValue: number;
  private readonly variant: ButtonVariant;
  private readonly fontSize: number;

  private hovered = false;
  private focused = false;
  private pressed = false;
  private enabled = true;
  private onClick?: () => void;

  constructor(options: ButtonOptions) {
    super();
    this.variant = options.variant ?? "secondary";
    this.fontSize = options.size ?? 11;
    this.heightValue = options.height ?? 22;
    this.onClick = options.onClick;

    if (options.label !== undefined) {
      this.labelText = makeText(options.label, {
        size: this.fontSize,
        weight: 600,
        color: this.variant === "primary" ? C.ink : C.cream,
        align: "center",
      });
      this.labelText.anchor.set(0.5, 0.5);
      this.addChild(this.labelText);
    }

    this.widthValue =
      options.width ??
      Math.max(
        72,
        options.icon ? 24 : Math.ceil((this.labelText?.width ?? 40) + 24),
      );

    this.addChild(this.background);
    this.addChild(this.iconLayer);
    if (this.labelText) this.addChild(this.labelText);

    this.eventMode = "static";
    this.cursor = CURSORS.pointer;
    this.hitArea = new Rectangle(0, 0, this.widthValue, this.heightValue);

    this.on("pointerover", () => {
      this.hovered = true;
      soundHandler?.("hover");
      this.redraw();
    });
    this.on("pointerout", () => {
      this.hovered = false;
      this.pressed = false;
      this.redraw();
    });
    this.on("pointerdown", () => {
      this.pressed = true;
      this.redraw();
    });
    this.on("pointerup", () => {
      this.pressed = false;
      this.redraw();
    });
    this.on("pointerupoutside", () => {
      this.pressed = false;
      this.redraw();
    });
    this.on("pointertap", () => {
      this.activate();
    });

    if (options.icon) {
      options.icon(this.iconLayer);
    }

    this.layoutContent();
    this.redraw();
  }

  get buttonWidth(): number {
    return this.widthValue;
  }

  get buttonHeight(): number {
    return this.heightValue;
  }

  setLabel(label: string): void {
    if (this.labelText) this.labelText.text = label;
  }

  setIcon(icon: (g: Graphics) => void): void {
    this.iconLayer.clear();
    icon(this.iconLayer);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.eventMode = enabled ? "static" : "none";
    this.cursor = enabled ? CURSORS.pointer : CURSORS.default;
    this.alpha = enabled ? 1 : 0.5;
    this.redraw();
  }

  setFocused(focused: boolean): void {
    if (this.focused === focused) return;
    this.focused = focused;
    this.redraw();
  }

  activate(): void {
    if (!this.enabled) return;
    soundHandler?.("click");
    this.onClick?.();
  }

  private layoutContent(): void {
    const centerY = this.heightValue / 2;
    if (this.labelText) {
      this.labelText.position.set(this.widthValue / 2, centerY);
    }
    if (this.iconLayer) {
      this.iconLayer.position.set((this.widthValue - 16) / 2, centerY - 8);
    }
  }

  private redraw(): void {
    const g = this.background;
    const width = this.widthValue;
    const height = this.heightValue;
    const active = this.hovered || this.focused;
    g.clear();

    let fill: number;
    let fillActive: number;
    let fillPressed: number;
    const border = C.ink;
    let topLine: number = C.cream;

    switch (this.variant) {
      case "primary":
        fill = C.gold;
        fillActive = C.yellow;
        fillPressed = C.orange;
        topLine = C.yellow;
        break;
      case "danger":
        fill = C.red;
        fillActive = C.orange;
        fillPressed = C.redDark;
        topLine = C.skin;
        break;
      case "ghost":
        fill = C.panelAlt;
        fillActive = C.steel;
        fillPressed = C.steelLight;
        topLine = C.brownLight;
        break;
      default:
        fill = C.panelAlt;
        fillActive = C.steel;
        fillPressed = C.steelLight;
        topLine = C.brownLight;
        break;
    }

    if (this.variant !== "ghost" || active) {
      const color = this.pressed ? fillPressed : active ? fillActive : fill;
      const alpha = this.variant === "ghost" ? (active ? 0.5 : 0) : 1;
      if (alpha > 0) {
        g.rect(0, 0, width, height).fill({ color, alpha });
        g.rect(0, height - 2, width, 2).fill({
          color: C.ink,
          alpha: 0.35,
        });
        g.rect(0, 0, width, height).stroke({
          width: 1,
          color: border,
          alignment: 0,
        });
        g.rect(1, 1, width - 2, 1).fill({ color: topLine, alpha: 0.5 });
      }
    }

    if (this.focused) {
      g.rect(-2, -2, width + 4, height + 4).stroke({
        width: 1,
        color: C.cream,
        alignment: 0,
      });
    }

    if (this.iconLayer) {
      this.iconLayer.alpha = this.pressed ? 0.8 : 1;
    }
    if (this.labelText) {
      this.labelText.y = height / 2 + (this.pressed ? 1 : 0);
      this.labelText.alpha = this.enabled ? 1 : 0.6;
    }
  }
}
