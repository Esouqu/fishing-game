import type { AreaDef } from "../../areas";
import type { FishSpecies } from "../../fish";
import { VIEW } from "../../config";
import { Button } from "../Button";
import { PANEL_PAD, SCREEN_INSET } from "../theme";

export const PANEL = {
  x: SCREEN_INSET,
  y: SCREEN_INSET,
  width: VIEW.width - SCREEN_INSET * 2,
  height: VIEW.height - SCREEN_INSET * 2,
};
export const CONTENT = {
  left: PANEL.x + PANEL_PAD,
  right: PANEL.x + PANEL.width - PANEL_PAD,
  width: PANEL.width - PANEL_PAD * 2,
};
export const TITLE = { x: CONTENT.left, y: PANEL.y + PANEL_PAD };

/**
 * The window body is a two-column split, in the spirit of a master-detail
 * screen: the water tabs and the roster of fish on the left, the entry of the
 * fish under the pointer on the right. It replaced a floating tooltip that
 * covered the very cells it described — the roster now keeps every species
 * visible while a single entry card stays in one place, so the eye learns where
 * to read.
 *
 * Both columns run down to the window's bottom inset: the row of progress that
 * used to sit under them as a footer is gone, so the roster and the entry card
 * own the full height of the body.
 */
const BODY_TOP = 78;
const BODY_BOTTOM = PANEL.y + PANEL.height - PANEL_PAD;
const GUTTER = 10;
const ROSTER_SHARE = 0.6;
const ROSTER_WIDTH = Math.round((CONTENT.width - GUTTER) * ROSTER_SHARE);

/**
 * Water tabs: one segmented bar, not three separate buttons. The three water
 * bodies are one choice, so they share one track; the selected segment is the
 * only raised part of it.
 *
 * The bar spans the roster's whole block — its right edge lands on the grid's
 * right frame — so the two read as one column instead of a bar floating over a
 * wider grid. It sits on the help screen's rhythm: the same 8 px under the
 * title row, the same 16 px height, and the body opens 8 px below it.
 */
export const TABS = {
  x: CONTENT.left,
  y: 54,
  width: ROSTER_WIDTH,
  height: 16,
};

/**
 * Left column: the roster. Four columns by four rows — 16 slots — hold the
 * largest roster (the bay has 16), and the columns run down to the window's
 * bottom inset, so the roster owns the full height of the body. The lake and the
 * river have twelve species, so the last four wells are drawn empty instead of
 * the roster ending in mid-row.
 */
export const GRID = {
  x: CONTENT.left,
  y: BODY_TOP,
  width: ROSTER_WIDTH,
  height: BODY_BOTTOM - BODY_TOP,
  columns: 4,
  rows: 4,
  slots: 16,
  cellWidth: ROSTER_WIDTH / 4,
  cellHeight: (BODY_BOTTOM - BODY_TOP) / 4,
};

/**
 * Right column: the entry card. Fixed height on purpose: the blurb length
 * differs per species, and a card that grows and shrinks as the pointer moves
 * reads as a layout bug, so the blocks are stacked inside a constant frame.
 *
 * The card is exactly as tall as the left column's tabs plus roster: it opens on
 * the tab bar's top edge and closes on the wells' bottom edge, so the two
 * columns are one block.
 */
export const DETAILS = {
  x: GRID.x + GRID.width + GUTTER,
  y: TABS.y,
  width: CONTENT.width - GUTTER - GRID.width,
  height: BODY_BOTTOM - TABS.y,
  pad: 8,
  /** Portrait slot at the top of the card. */
  portrait: { y: 8, width: 44, height: 40 },
  nameY: 58,
  typeY: 71,
  ruleY: 82,
  /**
   * Blurb under the rule: the gap from the rule to the top of the capitals, and
   * the line pitch. The pitch used to be 8.5 while the gap measured more than a
   * line, so the notes read as a detached block with cramped lines.
   */
  bodyGap: 6,
  bodyLineHeight: 9,
  /**
   * The card's own footer: the catch record of this species, under a hairline.
   * It used to sit in the middle of the card, between the species line and the
   * blurb, where it broke the reading order — the card answers "what is this
   * fish" first and "how am I doing with it" last.
   */
  footer: 20,
};

export interface Cell {
  button: Button;
  fish: FishSpecies;
  area: AreaDef;
  /** Cell frame in scene pixels: what the selection ring has to trace. */
  w: number;
  h: number;
}
