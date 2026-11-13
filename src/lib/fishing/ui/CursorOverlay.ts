import { Container, Sprite } from "pixi.js";
import type { CursorName, CursorTextures } from "../cursors";

/**
 * One Pixi-rendered cursor for the whole game. Every texture is the same
 * 24×24 box, and the overlay follows the pointer directly — no easing.
 */
export class CursorOverlay extends Container {
  private readonly sprites: Record<CursorName, Sprite>;
  private current: CursorName = "default";

  constructor(textures: CursorTextures) {
    super();
    this.eventMode = "none";
    this.interactiveChildren = false;

    const names = Object.keys(textures) as CursorName[];
    const sprites = {} as Record<CursorName, Sprite>;
    for (const name of names) {
      const data = textures[name];
      const sprite = new Sprite(data.texture);
      sprite.anchor.set(data.anchorX, data.anchorY);
      sprite.visible = false;
      this.addChild(sprite);
      sprites[name] = sprite;
    }
    this.sprites = sprites;
    // The fishing crosshair is deliberately smaller than the menu pointer.
    this.sprites.crosshair.scale.set(0.6);
    this.sprites.default.visible = true;
    this.visible = false;
  }

  setCursor(name: CursorName): void {
    if (this.current === name) return;
    this.current = name;
    for (const [key, sprite] of Object.entries(this.sprites)) {
      sprite.visible = key === name;
    }
  }

  moveTo(x: number, y: number, scale: number): void {
    this.position.set(x, y);
    this.scale.set(scale);
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }
}
