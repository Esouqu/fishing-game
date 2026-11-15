import { Container } from "pixi.js";
import { keycapWidth, makeKeycap, makeText } from "./theme";
import { UI } from "./palette";
import { TEXT } from "../texts";

/**
 * Gap between the label and the keycap, in pixels.
 *
 * Four read as two separate things that happened to stand next to each other;
 * flush to zero read as one block with a seam. Two is the seam a prompt needs:
 * the outlined word and the bordered chip are one unit, and the chip is still
 * clearly its own key.
 */
const GAP = 2;
/**
 * Keycap height. Kept even on purpose: the label's own box is 8 px tall and is
 * centred on the prompt's y, so an odd chip would have to sit half a pixel off
 * that centre — impossible on the pixel grid, and the 1 px it rounded to is
 * visible as the badge hanging below the word.
 */
const KEY_HEIGHT = 8;
const LABEL_SIZE = 7;
/** Height of the idle float above and below the anchor, in scene pixels. */
const FLOAT_RISE = 2.2;
/** Radians per second of that float: a full rise-and-fall takes ~4 s. */
const FLOAT_RATE = 1.55;
/** Outline width: the prompt sits straight on the water, so it needs its own edge. */
const OUTLINE = 2.5;

let cachedSize: { width: number; height: number } | null = null;

/**
 * Size of the prompt, shared by the widget and its click dead zone.
 *
 * There is no plate around it any more: the badge used to be a 72×25 wooden
 * plate with a hairline frame and a drop shadow, which covered the water it was
 * pointing at. What is left is the label with its own outline and the keycap,
 * so the size is exactly those two things side by side.
 */
function hintSize(): { width: number; height: number } {
  if (!cachedSize) {
    const label = makeText(TEXT.game.readyToCast, {
      size: LABEL_SIZE,
      weight: 800,
      color: UI.text,
      letterSpacing: 0.6,
    });
    label.style.stroke = { color: UI.ink, width: OUTLINE };
    cachedSize = {
      width: label.width + GAP + keycapWidth(TEXT.game.castKey),
      height: Math.max(label.height, KEY_HEIGHT),
    };
    label.destroy();
  }
  return cachedSize;
}

/**
 * Small "ready to cast" prompt above the angler. It only appears while the
 * player can start a new cast (idle), and disappears as soon as LMB is held.
 *
 * It is drawn as outlined text plus the keycap, with no plate: the prompt has
 * to read as a caption over the water, not as a dialog in front of it.
 */
export class CastHint extends Container {
  private readonly inner = new Container();
  private time = 0;

  constructor(x: number, y: number) {
    super();
    this.eventMode = "none";
    this.interactiveChildren = false;

    const { width } = hintSize();
    const label = makeText(TEXT.game.readyToCast, {
      size: LABEL_SIZE,
      weight: 800,
      color: UI.text,
      letterSpacing: 0.6,
    });
    label.anchor.set(0, 0.5);
    // The outline is what replaces the plate: it keeps the words legible over
    // both the bright snow bank and the dark water.
    label.style.stroke = { color: UI.ink, width: OUTLINE };

    const left = -width / 2;
    label.position.set(left, 0);
    this.inner.addChild(label);

    const key = makeKeycap(TEXT.game.castKey, KEY_HEIGHT, 6, true);
    key.position.set(left + label.width + GAP, -KEY_HEIGHT / 2);
    this.inner.addChild(key);

    this.addChild(this.inner);
    this.position.set(x, y);
    this.visible = false;
  }

  tick(dt: number): void {
    this.time += dt;
    // A slow, continuous drift: the prompt rises a couple of pixels above its
    // anchor and settles back, on a sine, forever. The amplitude has to be a
    // few pixels rather than the half-pixel nudge the old version used: the
    // renderer snaps positions to the pixel grid, so a very small amplitude
    // spends most of its cycle rounding to the same row and reads as a twitch
    // instead of a float. Over this height the snap is a step every few frames,
    // which is exactly how the rest of the pixel art moves.
    this.inner.y = -Math.sin(this.time * FLOAT_RATE) * FLOAT_RISE;
    // Alpha breathes on a different clock, so the loop never looks mechanical.
    const wave = Math.sin(this.time * 2.6);
    this.inner.alpha = 0.88 + ((wave + 1) / 2) * 0.12;
  }
}
