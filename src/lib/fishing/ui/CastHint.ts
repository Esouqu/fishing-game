import { Container, Graphics } from "pixi.js";
import { C, SCENE } from "../config";
import { keycapWidth, makeKeycap, makeText, drawWoodFrame } from "./theme";
import { TEXT } from "../texts";

export const CAST_HINT_BOUNDS = {
  x: SCENE.anglerX - 36,
  y: SCENE.anglerY - 53,
  width: 72,
  height: 25,
};

/**
 * Small "ready to cast" prompt above the angler. It only appears while the
 * player can start a new cast (idle), and disappears as soon as LMB is held.
 */
export class CastHint extends Container {
  private readonly inner = new Container();
  private time = 0;

  constructor() {
    super();
    this.eventMode = "none";
    this.interactiveChildren = false;

    const PAD = 4;
    const GAP = 4;
    const label = makeText(TEXT.game.readyToCast, {
      size: 7,
      color: C.cream,
      weight: 700,
    });
    label.anchor.set(0, 0.5);

    const key = makeKeycap(TEXT.game.castKey);
    const keyW = keycapWidth(TEXT.game.castKey);
    const contentH = Math.max(label.height, 11);
    const contentW = label.width + GAP + keyW;
    const width = contentW + PAD * 2;
    const height = contentH + PAD * 2;
    const left = -width / 2;
    const top = -height / 2;

    const badge = new Graphics();
    badge.rect(left, top, width, height).fill({ color: C.ink, alpha: 0.86 });
    drawWoodFrame(badge, left, top, width, height, 0);
    badge.rect(left + 3, top + 2, width - 6, 1).fill({
      color: C.brownLight,
      alpha: 0.55,
    });
    badge
      .poly([-4, height / 2, 0, height / 2 + 4, 4, height / 2])
      .fill({ color: C.gold, alpha: 0.8 });
    this.inner.addChild(badge);

    label.position.set(left + PAD, 0);
    this.inner.addChild(label);

    key.position.set(left + PAD + label.width + GAP, -11 / 2);
    this.inner.addChild(key);

    this.addChild(this.inner);
    this.position.set(SCENE.anglerX, SCENE.anglerY - 44);
    this.visible = false;
  }

  tick(dt: number): void {
    this.time += dt;
    const wave = Math.sin(this.time * 2.6);
    this.inner.y = wave * 1.1;
    this.inner.alpha = 0.84 + ((wave + 1) / 2) * 0.16;
  }
}
