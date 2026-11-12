import { Container, Graphics, Rectangle } from "pixi.js";
import { C } from "../config";
import { drawPanel, makeText } from "../ui/theme";

/**
 * Compact, non-blocking fight reminder. It sits in the HUD corner, leaves the
 * whole play area interactive and can be dismissed with the small ×.
 */
export class FightHint extends Container {
  onClose?: () => void;

  constructor() {
    super();
    this.eventMode = "none";

    const panel = new Graphics();
    drawPanel(panel, 10, 206, 204, 54, {
      fill: C.panel,
      alpha: 0.92,
      shadow: true,
    });
    panel.rect(12, 207, 200, 1).fill({ color: C.gold, alpha: 0.5 });
    this.addChild(panel);

    const icons = new Graphics();
    icons
      .poly([20, 214, 16, 222, 19, 222, 16, 229, 23, 220, 20, 220])
      .fill(C.cyan);
    icons.circle(18, 236, 2).stroke({ width: 1, color: C.cream, alpha: 0.85 });
    icons.circle(23, 233, 1.5).stroke({ width: 1, color: C.cream, alpha: 0.7 });
    icons.circle(21, 240, 1.2).stroke({ width: 1, color: C.cream, alpha: 0.6 });
    icons
      .moveTo(21, 247)
      .lineTo(21, 251)
      .quadraticCurveTo(21, 255, 17, 253)
      .stroke({ width: 1.4, color: C.gold, alpha: 0.9 });
    this.addChild(icons);

    const lines = [
      "Держи ЛКМ / ПРОБЕЛ — тяни, отпусти — отдых",
      "Пузыри — тяни в обратную сторону",
      "Крючок — ПКМ / F, на тач — тап",
    ];
    lines.forEach((line, index) => {
      const text = makeText(line, {
        size: 9,
        color: C.cream,
        alpha: 0.92,
      });
      text.position.set(30, 212 + index * 15);
      this.addChild(text);
    });

    const close = new Graphics();
    close.eventMode = "static";
    close.cursor = "pointer";
    close.hitArea = new Rectangle(188, 209, 16, 16);
    close
      .moveTo(192, 212)
      .lineTo(201, 221)
      .moveTo(201, 212)
      .lineTo(192, 221)
      .stroke({ width: 1.2, color: C.steelPale, alpha: 0.75 });
    close.on("pointertap", () => this.close());
    this.addChild(close);
  }

  private close(): void {
    this.onClose?.();
    this.parent?.removeChild(this);
    this.destroy({ children: true });
  }
}
