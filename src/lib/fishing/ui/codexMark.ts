import type { Graphics } from "pixi.js";
import { UI } from "./palette";

/**
 * Book mark of the HUD's codex control: a cover, two blocks of paper with ruled
 * entries and a bookmark down the gutter.
 *
 * It is drawn two rows taller than the pause bars beside it (`drawPauseIcon`
 * spans y 4–11, this book spans y 3–12): the two controls are one pair in 16 px
 * buttons, and the reference is the one that carries text, so it gets the extra
 * rows a cover, two pages and a bookmark need. The book keeps the ten columns
 * from x 3 to x 12 and the pause's bars sit centred inside them, so the pair
 * lines up in the corner; only the book spends them on a whole object — the
 * pause is two bars.
 *
 * Nothing here is warm: the cover is periwinkle-pale, the paper is the
 * interface's ice white, the entries are periwinkle and the contour is ink, so
 * the only accent is the bookmark. A gold cover was the first draft and it
 * became the loudest thing on the frame, louder than the amber the landing cue
 * owns.
 *
 * The silhouette is chamfered rather than square — the top and bottom edges are
 * a pixel shorter than the sides, so the corners step — and the top edge is
 * interrupted over the gutter, where the 2 px outline cap sits one pixel lower
 * than the rest of it. Together those are what make the mark a book and not a
 * panel with a stripe: a plain rectangle in this UI reads as a window with a
 * title bar, whatever is drawn inside it.
 */
export function drawCodexMark(g: Graphics): void {
  g.clear();
  // Box: ten columns from x 3, ten rows from y 3 — the height the cover, the
  // pages and the bookmark need, two rows more than the pause bars use.
  const left = 3;
  const right = 12;
  const top = 3;
  const bottom = 12;
  // Bookmark columns, centred in the box.
  const gutter = 7;
  const gutterWidth = 2;

  // Paper: the two pages, each a block of entries.
  g.rect(left + 2, top + 2, 2, 5).fill(UI.primary);
  g.rect(gutter + gutterWidth, top + 2, 2, 5).fill(UI.primary);
  // Entries ruled on the pages.
  g.rect(left + 2, top + 3, 2, 1).fill(UI.periwinkle);
  g.rect(gutter + gutterWidth, top + 3, 2, 1).fill(UI.periwinkle);
  g.rect(left + 2, top + 5, 2, 1).fill(UI.periwinkle);
  g.rect(gutter + gutterWidth, top + 5, 2, 1).fill(UI.periwinkle);
  // Cover: a pale ring around the paper, one pixel wide on every side.
  g.rect(left + 1, top + 1, 3, 1).fill(UI.periwinklePale);
  g.rect(gutter + gutterWidth, top + 1, 3, 1).fill(UI.periwinklePale);
  g.rect(left + 1, bottom - 2, 3, 1).fill(UI.periwinklePale);
  g.rect(gutter + gutterWidth, bottom - 2, 3, 1).fill(UI.periwinklePale);
  g.rect(left + 1, top + 2, 1, 5).fill(UI.periwinklePale);
  g.rect(right - 1, top + 2, 1, 5).fill(UI.periwinklePale);
  // Bookmark down the gutter, one row past the bottom edge. Its last row is a
  // single pixel on the left: a two-pixel tip read as a cut ribbon, and the
  // right bottom pixel was the one that poked out of the book's silhouette.
  g.rect(gutter, top + 2, gutterWidth, 7).fill(UI.danger);
  g.rect(gutter, bottom, 1, 1).fill(UI.danger);
  // Outline: chamfered corners, and the cap over the gutter one pixel lower
  // than the top edge it belongs to.
  g.rect(left + 1, top, 3, 1).fill(UI.ink);
  g.rect(gutter + gutterWidth, top, 3, 1).fill(UI.ink);
  g.rect(gutter, top + 1, gutterWidth, 1).fill(UI.ink);
  g.rect(left, top + 1, 1, 7).fill(UI.ink);
  g.rect(right, top + 1, 1, 7).fill(UI.ink);
  g.rect(left + 1, bottom - 1, 3, 1).fill(UI.ink);
  g.rect(gutter + gutterWidth, bottom - 1, 3, 1).fill(UI.ink);
}
