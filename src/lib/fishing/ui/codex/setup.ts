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
export const TABS = {
  x: CONTENT.left,
  y: 50,
  width: (CONTENT.width - 16) / 3,
  height: 18,
  gap: 8,
};
/**
 * Five columns by four rows. The largest roster is 16 species, so four rows
 * hold every water body; the row height is sized to the new content box so the
 * last row never runs under the panel edge.
 */
export const GRID = {
  x: CONTENT.left + 12,
  y: 74,
  cellWidth: 80,
  cellHeight: 42,
  columns: 5,
};
/** Tooltip: fixed width, height follows the wrapped blurb so no dead space. */
export const TIP = { width: 190, minHeight: 58, padding: 8 };

export interface Cell {
  button: Button;
  fish: FishSpecies;
  area: AreaDef;
}
