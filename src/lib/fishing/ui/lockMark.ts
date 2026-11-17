import type { Graphics } from "pixi.js";
import { UI } from "./palette";

/**
 * Pixel padlock: a 7×9 glyph drawn from whole pixels, multiplied by `scale`.
 *
 * The same mark seals a closed location in the water picker, the travel cards
 * and anywhere else the host has closed a door, so a locked water body is
 * recognised by its shape before any of its labels are read. `body` carries the
 * fill and `face` the keyhole, so the mark can sit on a dark plate or on a
 * bright one without a second variant.
 */
export function drawLockMark(
  g: Graphics,
  x: number,
  y: number,
  scale = 1,
  body: number = UI.periwinkle,
  face: number = UI.ink,
): void {
  const px = Math.max(1, Math.round(scale));
  const block = (
    dx: number,
    dy: number,
    w: number,
    h: number,
    color: number,
  ) => {
    g.rect(x + dx * px, y + dy * px, w * px, h * px).fill(color);
  };
  // Shackle: three pixel steps, so it reads as a rounded handle and not a box.
  block(2, 0, 3, 1, body);
  block(1, 1, 1, 2, body);
  block(5, 1, 1, 2, body);
  // Body, with a lit top lip that separates it from the shackle.
  block(0, 3, 7, 6, body);
  block(0, 3, 7, 1, UI.periwinklePale);
  // Keyhole: a round hole over a slot.
  block(3, 5, 1, 1, face);
  block(3, 6, 1, 2, face);
}
