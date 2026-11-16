import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { CURSORS } from "../cursors";
import type { Focusable } from "./FocusGroup";
import { UI } from "./palette";
import { makeText, setText } from "./theme";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "card";
export interface ButtonOptions {
  label?: string;
  width?: number;
  height?: number;
  variant?: ButtonVariant;
  size?: number;
  onClick?: () => void;
  /** Draws a 16x16 icon centered in the button instead of a label. */
  icon?: (g: Graphics) => void;
  /** Selected state for tabs: ice-white fill and a dark label. */
  selected?: boolean;
  /**
   * Draw the `>…<` selection marks around the label. Off for icon-like labels
   * such as the codex's «х», where the marks would read as a second glyph.
   */
  marks?: boolean;
  /**
   * Mutes the interface cue this button would play on hover and press, for
   * controls that are auditioning a sound of their own.
   */
  quiet?: boolean;
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
  /**
   * Selection marks, drawn as their own glyphs beside the label.
   *
   * They used to be part of the label string (`>ТЕКСТ<`). Rewriting the string
   * made Pixi re-lay the whole line out, and the word under the marks shifted
   * by a pixel — a hover that moves the text it is highlighting reads as a
   * rendering bug. Two separate texts never touch the label's layout.
   */
  private readonly markLeft: Text | null = null;
  private readonly markRight: Text | null = null;
  private readonly iconLayer = new Graphics();
  private readonly widthValue: number;
  private readonly heightValue: number;
  private readonly variant: ButtonVariant;
  private readonly fontSize: number;

  private hovered = false;
  private focused = false;
  private pressed = false;
  private enabled = true;
  private isSelected = false;
  private readonly quiet: boolean;
  private readonly marksEnabled: boolean;
  private onClick?: () => void;

  constructor(options: ButtonOptions) {
    super();
    this.variant = options.variant ?? "secondary";
    this.fontSize = options.size ?? 11;
    this.heightValue = options.height ?? 22;
    this.onClick = options.onClick;
    this.isSelected = options.selected ?? false;
    this.quiet = options.quiet ?? false;
    this.marksEnabled = options.marks ?? true;

    if (options.label !== undefined) {
      this.labelText = makeText(options.label, {
        size: this.fontSize,
        weight: 600,
        color: this.labelOnBright ? UI.textOnBright : UI.text,
        align: "center",
      });
      this.labelText.anchor.set(0.5, 0.5);
      this.addChild(this.labelText);

      if (this.marksEnabled) {
        const markStyle = {
          size: this.fontSize,
          weight: 600,
          color: this.labelOnBright ? UI.textOnBright : UI.text,
        };
        this.markLeft = makeText(">", markStyle);
        this.markLeft.anchor.set(1, 0.5);
        this.markLeft.visible = false;
        this.markRight = makeText("<", markStyle);
        this.markRight.anchor.set(0, 0.5);
        this.markRight.visible = false;
      }
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
    if (this.markLeft) this.addChild(this.markLeft);
    if (this.markRight) this.addChild(this.markRight);

    this.eventMode = "static";
    this.cursor = CURSORS.pointer;
    this.hitArea = new Rectangle(0, 0, this.widthValue, this.heightValue);

    this.on("pointerover", () => {
      this.hovered = true;
      if (!this.quiet) soundHandler?.("hover");
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

  /**
   * True when this button's fill is light enough to need dark copy. Primary,
   * secondary and selected buttons are light; ghost and danger are not.
   */
  private get labelOnBright(): boolean {
    return (
      this.isSelected ||
      this.variant === "primary" ||
      this.variant === "secondary"
    );
  }

  setLabel(label: string): void {
    if (this.labelText) {
      setText(this.labelText, label);
      this.layoutContent();
    }
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

  setSelected(selected: boolean): void {
    if (this.isSelected === selected) return;
    this.isSelected = selected;
    this.redraw();
  }

  /**
   * Marks the label as the current one, the way a dialogue writes the line the
   * player is on. The glyphs sit just outside the word, so the word itself
   * never moves when the marks come and go.
   */
  private layoutMarks(): void {
    if (!this.labelText || !this.markLeft || !this.markRight) return;
    const centre = this.widthValue / 2;
    const half = Math.ceil(this.labelText.width / 2);
    this.markLeft.position.set(centre - half - 1, this.heightValue / 2);
    this.markRight.position.set(centre + half + 1, this.heightValue / 2);
  }

  activate(): void {
    if (!this.enabled) return;
    if (!this.quiet) soundHandler?.("click");
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
    this.layoutMarks();
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
    let topLine: number;
    const border = UI.ink;

    switch (this.variant) {
      case "primary":
        fill = UI.primary;
        fillActive = UI.primaryHover;
        fillPressed = UI.primaryPressed;
        topLine = UI.periwinkleLight;
        break;
      case "danger":
        fill = UI.danger;
        fillActive = UI.dangerHover;
        fillPressed = UI.dangerPressed;
        topLine = UI.rose;
        break;
      case "ghost":
        fill = UI.panelAlt;
        fillActive = UI.surface;
        fillPressed = UI.surface;
        topLine = UI.periwinklePale;
        break;
      case "card":
        // Dark card for a picture inside it: the preview and its white caption
        // need a surface that the periwinkle button fill would not give them.
        fill = UI.panelAlt;
        fillActive = UI.surface;
        fillPressed = UI.surface;
        topLine = UI.periwinkle;
        break;
      default:
        fill = UI.periwinkle;
        fillActive = UI.periwinkleLight;
        fillPressed = UI.periwinklePressed;
        topLine = UI.periwinklePale;
        break;
    }

    if (this.isSelected) {
      fill = UI.primary;
      fillActive = UI.primaryHover;
      fillPressed = UI.primaryPressed;
      topLine = UI.periwinkleLight;
    }

    if (this.variant === "ghost" && !active && !this.isSelected) {
      // Ghost stays unfilled until hovered so a codex grid does not turn into a
      // wall of boxes, but keeps a hairline so every cell still reads as a slot.
      g.rect(0, 0, width, height).stroke({
        width: 1,
        color: UI.periwinkle,
        alpha: 0.5,
        alignment: 0,
      });
    } else if (this.variant !== "ghost" || active || this.isSelected) {
      const color = this.pressed ? fillPressed : active ? fillActive : fill;
      const alpha = this.variant === "ghost" ? (active ? 0.55 : 0) : 1;
      if (alpha > 0) {
        g.rect(0, 0, width, height).fill({ color, alpha });
        g.rect(0, height - 2, width, 2).fill({
          color: UI.ink,
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
      // Two pixel rings, not one: the ice ring vanishes on an ice-white
      // primary button, so the indigo ring behind it carries the focus.
      g.rect(-3, -3, width + 6, height + 6).stroke({
        width: 1,
        color: UI.ink,
        alpha: 0.7,
        alignment: 0,
      });
      g.rect(-2, -2, width + 4, height + 4).stroke({
        width: 1,
        color: UI.primary,
        alignment: 0,
      });
    }

    if (this.iconLayer) {
      this.iconLayer.alpha = this.pressed ? 0.8 : 1;
    }
    if (this.labelText) {
      this.labelText.y = height / 2 + (this.pressed ? 1 : 0);
      this.labelText.alpha = this.enabled ? 1 : 0.6;
      this.labelText.style.fill = this.labelOnBright
        ? UI.textOnBright
        : UI.text;
      const fill = this.labelOnBright ? UI.textOnBright : UI.text;
      const shown =
        this.marksEnabled && (this.hovered || this.focused || this.isSelected);
      for (const mark of [this.markLeft, this.markRight]) {
        if (!mark) continue;
        mark.visible = shown;
        mark.y = height / 2 + (this.pressed ? 1 : 0);
        mark.style.fill = fill;
      }
    }
  }
}
