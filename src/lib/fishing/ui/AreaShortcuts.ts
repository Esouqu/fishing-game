import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { Game } from "../Game";
import { AREAS } from "../areas";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import type { AreaId } from "../types";
import { easeOutCubic, lerp } from "../utils";
import { UI } from "./palette";
import { drawPanel, makeText } from "./theme";

/** One travel card in the bottom corner. */
const CARD = { width: 68, height: 40 } as const;
/** Inset of the cards from the frame edge; matches the HUD's corner cards. */
const MARGIN = 8;
/** Height of the name strip along the bottom of a card. */
const FOOTER = 11;
/** Inner gutter of the thumbnail against the frame. */
const THUMB_PAD = 2;
/** Distance a card travels while sliding into its corner, in pixels. */
const SLIDE = 26;
/** How long that slide takes, in seconds. */
const SLIDE_TIME = 0.3;

/**
 * Two travel cards in the bottom corners: the water bodies either side of the
 * one being fished, one per corner, showing a real still of each.
 *
 * The pair is a carousel, not "the other two in table order": the left card is
 * the water body before the current one in {@link AREAS} and the right card the
 * one after, wrapping around. Clicking the right card therefore walks the ring
 * forward (the lake you leave slides into the left corner and the next water
 * body appears on the right), and clicking the left card walks it back. Under
 * the old table order the two cards simply swapped names: from the lake, two
 * clicks to the right bounced between two water bodies and the third was never
 * reachable that way.
 */
export class AreaShortcuts extends Container {
  private readonly cards: ShortcutCard[] = [];
  /** Cards sliding into their corners, with the x each one started from. */
  private readonly arrivals: Array<{
    card: ShortcutCard;
    fromX: number;
    targetX: number;
  }> = [];
  private elapsed = 0;

  constructor(game: Game, current: AreaId, onPick: (areaId: AreaId) => void) {
    super();
    const count = AREAS.length;
    const index = Math.max(
      0,
      AREAS.findIndex((area) => area.id === current),
    );
    // Around the ring in the direction the cards read left to right.
    const neighbours = [
      AREAS[(index + count - 1) % count],
      AREAS[(index + 1) % count],
    ];
    neighbours.forEach((area, side) => {
      const card = new ShortcutCard(
        game,
        game.previewFor(area.id),
        area.name,
        () => onPick(area.id),
      );
      // First neighbour on the left, second on the right: the ring order is
      // fixed by `AREAS`, so the corners never swap under the player's hand.
      const targetX = side === 0 ? MARGIN : VIEW.width - MARGIN - CARD.width;
      const fromX = targetX + (side === 0 ? -SLIDE : SLIDE);
      card.position.set(fromX, VIEW.height - MARGIN - CARD.height);
      card.alpha = 0;
      this.addChild(card);
      this.cards.push(card);
      this.arrivals.push({ card, fromX, targetX });
    });
  }

  /**
   * Slides the pair into place. The cards arrive from the sides they belong to,
   * so a switch reads as the ring turning rather than as two thumbnails being
   * swapped behind a fade.
   */
  update(dt: number): void {
    if (this.elapsed >= SLIDE_TIME) return;
    this.elapsed = Math.min(SLIDE_TIME, this.elapsed + dt);
    const t = this.elapsed / SLIDE_TIME;
    const eased = easeOutCubic(t);
    for (const arrival of this.arrivals) {
      arrival.card.x = lerp(arrival.fromX, arrival.targetX, eased);
      arrival.card.alpha = eased;
    }
  }

  /** True when the point is on one of the cards, for the cast cursor. */
  hitTest(x: number, y: number): boolean {
    return this.cards.some((card) => card.hitTest(x, y));
  }

  /**
   * Dims and disables the cards. A fight is a one-mistake window right under
   * the player's hand, and a corner card that jumps to another lake would end
   * the round on a stray click.
   */
  setAvailable(available: boolean): void {
    for (const card of this.cards) card.setAvailable(available);
  }
}

/** A single travel card: a still of the water body with its name on a strip. */
class ShortcutCard extends Container {
  private readonly game: Game;
  private readonly hoverLayer = new Graphics();
  private available = true;

  constructor(
    game: Game,
    texture: Texture,
    label: string,
    onClick: () => void,
  ) {
    super();
    this.game = game;

    const frame = new Graphics();
    drawPanel(frame, 0, 0, CARD.width, CARD.height, {
      fill: UI.panel,
      alpha: 0.92,
      shadow: true,
    });
    this.addChild(frame);

    // The preview is a full 480×270 still, cropped to the card: the card is
    // wider than it is tall, so the still is scaled to cover and the mask takes
    // the middle band, which is the water the player recognises.
    const viewWidth = CARD.width - THUMB_PAD * 2;
    const viewHeight = CARD.height - FOOTER - THUMB_PAD;
    const thumb = new Sprite(texture);
    const scale = Math.max(
      viewWidth / Math.max(1, texture.width),
      viewHeight / Math.max(1, texture.height),
    );
    thumb.scale.set(scale);
    thumb.position.set(
      THUMB_PAD + viewWidth / 2 - (texture.width * scale) / 2,
      THUMB_PAD + viewHeight / 2 - (texture.height * scale) / 2,
    );
    this.addChild(thumb);

    const mask = new Graphics();
    mask.rect(THUMB_PAD, THUMB_PAD, viewWidth, viewHeight).fill(0xffffff);
    this.addChild(mask);
    thumb.mask = mask;

    // Name strip: the label has to stay readable over bright snow, so it gets
    // its own dark band instead of sitting straight on the still.
    const footer = new Graphics();
    footer
      .rect(THUMB_PAD, CARD.height - FOOTER - THUMB_PAD, viewWidth, FOOTER)
      .fill({ color: UI.ink, alpha: 0.82 });
    this.addChild(footer);

    const name = makeText(label, {
      size: 5.5,
      weight: 800,
      color: UI.text,
      align: "center",
      letterSpacing: 0.2,
    });
    name.anchor.set(0.5, 0.5);
    name.position.set(CARD.width / 2, CARD.height - FOOTER / 2 - THUMB_PAD);
    this.addChild(name);

    this.hoverLayer.visible = false;
    this.addChild(this.hoverLayer);

    this.eventMode = "static";
    this.cursor = CURSORS.pointer;
    this.hitArea = new Rectangle(0, 0, CARD.width, CARD.height);
    this.on("pointerover", () => {
      if (!this.available) return;
      this.game.audio.hover();
      this.setHovered(true);
    });
    this.on("pointerout", () => this.setHovered(false));
    this.on("pointertap", () => {
      if (!this.available) return;
      this.game.audio.click();
      onClick();
    });
  }

  hitTest(x: number, y: number): boolean {
    return (
      this.visible &&
      x >= this.x &&
      x <= this.x + CARD.width &&
      y >= this.y &&
      y <= this.y + CARD.height
    );
  }

  setAvailable(available: boolean): void {
    if (this.available === available) return;
    this.available = available;
    this.alpha = available ? 1 : 0.4;
    this.eventMode = available ? "static" : "none";
    this.cursor = available ? CURSORS.pointer : CURSORS.default;
    if (!available) this.setHovered(false);
  }

  private setHovered(hovered: boolean): void {
    this.hoverLayer.visible = hovered;
    if (!hovered) return;
    const g = this.hoverLayer;
    g.clear();
    g.rect(0, 0, CARD.width, CARD.height).stroke({
      width: 1,
      color: UI.primary,
      alignment: 0.5,
    });
  }
}
