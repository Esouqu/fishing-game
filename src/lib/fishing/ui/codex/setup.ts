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
export const TITLE = { x: CONTENT.left, y: PANEL.y + 12 };
/**
 * Water tabs: one segmented bar across the content width, not three separate
 * buttons. The three water bodies are one choice, so they share one track; the
 * selected segment is the only raised part of it.
 */
export const TABS = {
  x: CONTENT.left,
  y: 50,
  width: CONTENT.width,
  height: 18,
};

/**
 * The window body is a 60/40 split, in the spirit of a master-detail screen:
 * the roster of fish on the left, the entry of the fish under the pointer on the
 * right. It replaced a floating tooltip that covered the very cells it
 * described — the roster now keeps every name visible while a single entry card
 * stays in one place, so the eye learns where to read.
 *
 * The gutter comes out of the content width before the split, so the two halves
 * are 60% and 40% of what is actually left.
 */
const BODY_TOP = 74;
const BODY_BOTTOM = PANEL.y + PANEL.height - PANEL_PAD;
const GUTTER = 10;
const ROSTER_SHARE = 0.6;

/**
 * Left half: the roster. Four columns by four rows — 16 slots — hold the
 * largest roster (the bay has 16), and the cell height is the body divided by
 * four so the last row sits exactly on the panel's bottom padding. The lake and
 * the river have twelve species, so the last four wells are drawn empty instead
 * of the roster ending in mid-row.
 */
export const GRID = {
  x: CONTENT.left,
  y: BODY_TOP,
  width: Math.round((CONTENT.width - GUTTER) * ROSTER_SHARE),
  height: BODY_BOTTOM - BODY_TOP,
  columns: 4,
  rows: 4,
  slots: 16,
  cellWidth: Math.round((CONTENT.width - GUTTER) * ROSTER_SHARE) / 4,
  cellHeight: (BODY_BOTTOM - BODY_TOP) / 4,
};

/**
 * Right half: the entry card. Fixed height on purpose: the blurb length differs
 * per species, and a card that grows and shrinks as the pointer moves reads as a
 * layout bug, so the blocks are stacked inside a constant frame instead.
 */
export const DETAILS = {
  x: GRID.x + GRID.width + GUTTER,
  y: BODY_TOP,
  width: CONTENT.width - GUTTER - GRID.width,
  height: BODY_BOTTOM - BODY_TOP,
  pad: 8,
  /** Portrait slot at the top of the card. */
  portrait: { y: 8, width: 44, height: 40 },
  nameY: 58,
  typeY: 71,
  recordY: 82,
  ruleY: 90,
  /** First line of the blurb, under the rule. */
  bodyTop: 97,
};

export interface Cell {
  button: Button;
  fish: FishSpecies;
  area: AreaDef;
}
