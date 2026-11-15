import { Container, Text } from "pixi.js";
import { VIEW } from "../config";
import { clamp } from "../utils";
import { UI } from "./palette";
import { makeText } from "./theme";

interface Floater {
  text: Text;
  life: number;
  maxLife: number;
  vy: number;
  /** Seconds to wait before the label appears; it does not age while hidden. */
  delay: number;
}

/**
 * Short-lived floating labels (catch feedback, early-hook warnings). Every
 * label rises and fades on its own; the layer never takes pointer events, so
 * it can sit above the HUD without stealing clicks.
 */
export class FloaterLayer extends Container {
  private readonly floaters: Floater[] = [];

  constructor() {
    super();
    this.eventMode = "none";
  }

  add(
    value: string,
    x: number,
    y: number,
    color: number,
    size = 14,
    life = 1.1,
    vy = -28,
    anchorX = 0.5,
    delay = 0,
  ): void {
    const text = makeText(value, {
      size,
      weight: 800,
      color,
      align: anchorX === 0 ? "left" : "center",
      lineHeight: size + 1,
    });
    text.anchor.set(anchorX, 1);
    // A centred tag over an angler near the shore would otherwise run off the
    // playfield; keep it fully visible.
    const safeX =
      anchorX === 0
        ? x
        : clamp(x, text.width / 2 + 4, VIEW.width - text.width / 2 - 4);
    text.position.set(safeX, y);
    text.style.stroke = { color: UI.ink, width: 2 };
    text.visible = delay <= 0;
    this.addChild(text);
    this.floaters.push({ text, life, maxLife: life, vy, delay });
  }

  update(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i];
      // A delayed label holds its place and its full life until its cue: a tag
      // that has already begun to rise and fade before it is shown would hand
      // the player a half-spent caption.
      if (floater.delay > 0) {
        floater.delay -= dt;
        if (floater.delay > 0) continue;
        floater.text.visible = true;
      }
      floater.life -= dt;
      floater.text.y += floater.vy * dt;
      const fadeTime = Math.min(0.4, floater.maxLife * 0.45);
      floater.text.alpha =
        floater.life < fadeTime ? Math.max(0, floater.life / fadeTime) : 1;
      if (floater.life <= 0) {
        this.removeChild(floater.text);
        floater.text.destroy();
        this.floaters.splice(i, 1);
      }
    }
  }
}
