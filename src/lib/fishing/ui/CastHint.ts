import { Container, Sprite, type Texture } from "pixi.js";
import { makeText } from "./theme";
import { anchorInk, inkWidth } from "./textInk";
import { UI } from "./palette";
import { TEXT } from "../texts";

/**
 * Gap between the label and the mouse badge, in pixels.
 *
 * Four read as two separate things that happened to stand next to each other;
 * flush to zero read as one block with a seam. Two is the seam a prompt needs:
 * the outlined word and the pictogram are one unit, and the badge is still
 * clearly its own mark. Three left the pictogram floating a pixel off the word's
 * contour, which the outline makes visible: the two marks are read as one caption
 * or not at all.
 *
 * The gap is measured from the *ink* of the word (see {@link inkWidth}), not
 * from its advance box: the pixel font leaves about five empty pixels after the
 * last glyph at this size, which used to be added on top of this gap and made
 * the badge look pushed away from the prompt.
 */
const GAP = 2;
const LABEL_SIZE = 7;
/** Height of the idle float above and below the anchor, in scene pixels. */
const FLOAT_RISE = 2.2;
/** Radians per second of that float: a full rise-and-fall takes ~4 s. */
const FLOAT_RATE = 1.55;
/**
 * Side of the badge, in virtual pixels: eleven sixteenths of its 16 px tile.
 *
 * At 1:1 it stood taller than two lines of the prompt's capitals and pulled the
 * eye off the word it is captioning, while a half lost the lit button. Eleven is
 * the step down from the old 12: a pictogram beside a 7 px caption should not
 * reach the full height of the block the caption sits in, and the shorter badge
 * also lets the pair close up without the mouse touching the word.
 */
const BADGE_SIZE = 11;

let labelInk = 0;

/** Ink width of the prompt word; measured once, the label never changes. */
function labelWidth(): number {
  if (labelInk > 0) return labelInk;
  const label = makeText(TEXT.game.readyToCast, {
    size: LABEL_SIZE,
    weight: 800,
    color: UI.text,
    letterSpacing: 0.6,
    outline: true,
  });
  labelInk = inkWidth(label);
  label.destroy();
  return labelInk;
}

/**
 * Small "ready to cast" prompt above the angler. It only appears while the
 * player can start a new cast (idle), and disappears as soon as LMB is held.
 *
 * It is drawn as outlined text plus one pictogram, with no plate: the prompt has
 * to read as a caption over the water, not as a dialog in front of it. The
 * pictogram is a single 16 px sprite from the input-prompt set — a mouse with
 * its left button lit — instead of the mouse-and-stopwatch pair the UI used to
 * draw by hand: the pack's art says "press this" with one mark, where the pair
 * needed the player to read two shapes.
 */
export class CastHint extends Container {
  private readonly inner = new Container();
  private time = 0;

  constructor(x: number, y: number, icon: Texture) {
    super();
    this.eventMode = "none";
    this.interactiveChildren = false;

    const ink = labelWidth();
    const width = ink + GAP + BADGE_SIZE;
    const label = makeText(TEXT.game.readyToCast, {
      size: LABEL_SIZE,
      weight: 800,
      color: UI.text,
      letterSpacing: 0.6,
      // The outline is what replaces the plate: it keeps the words legible over
      // both the bright snow bank and the dark water. It is the interface's one
      // contour (`TEXT_OUTLINE`), so the prompt carries the same edge as the
      // catch tags it shares the water with.
      outline: true,
    });
    anchorInk(label, "left");

    const left = -width / 2;
    label.position.set(left, 0);
    this.inner.addChild(label);

    // The badge is anchored on its left edge and its middle, so it sits against
    // the word's ink with exactly {@link GAP} between them, on the label's
    // centre line. It is drawn at the size the layout already used, so the art
    // and the block can never disagree. Nearest sampling keeps the pixels square.
    const mouse = new Sprite(icon);
    mouse.anchor.set(0, 0.5);
    mouse.scale.set(BADGE_SIZE / icon.width);
    mouse.position.set(left + ink + GAP, 0);
    this.inner.addChild(mouse);

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
