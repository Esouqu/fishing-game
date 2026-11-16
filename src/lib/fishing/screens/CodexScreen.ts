import type { GameContext } from "../GameContext";
import type { CodexReturn } from "../types";
import { easeOutCubic } from "../utils";
import { Screen } from "../ui/Screen";
import { Scrim } from "../ui/Scrim";
import { CodexView } from "../ui/CodexView";
import {
  CODEX_FLY_LIFT,
  CODEX_FLY_TIME,
  CODEX_SCRIM_TIME,
} from "../ui/CodexOverlay";

/**
 * Full-screen codex host for the menu and the water picker.
 *
 * It is a popup, not a page: the dimmer is a static scrim, and only the panel
 * rises into it. The manager is told to leave the screen in place
 * (`selfFlown`), so the dimming never slides along with the panel.
 */
export class CodexScreen extends Screen {
  override readonly popup = true;
  override readonly selfFlown = true;
  private readonly scrim = new Scrim();
  private readonly view: CodexView;
  private intro = 0;

  constructor(game: GameContext, returnTo: CodexReturn = "menu") {
    super();
    this.scrim.alpha = 0;
    this.addChild(this.scrim);

    this.view = new CodexView(game, game.areaId, () => {
      if (returnTo === "areas") game.showAreas();
      else game.showMenu();
    });
    this.view.y = CODEX_FLY_LIFT;
    this.view.alpha = 0;
    this.addChild(this.view);
  }

  override update(dt: number): void {
    if (this.intro >= 1) return;
    this.intro = Math.min(1, this.intro + dt / CODEX_FLY_TIME);
    const eased = easeOutCubic(this.intro);
    this.view.y = CODEX_FLY_LIFT * (1 - eased);
    // A slow fade under the rise: the panel used to snap to full opacity in
    // about a sixth of a second, which is what made the opening feel abrupt.
    this.view.alpha = eased;
    this.scrim.alpha = Math.min(
      1,
      this.intro / (CODEX_SCRIM_TIME / CODEX_FLY_TIME),
    );
  }

  override handleKey(event: KeyboardEvent): boolean {
    return this.view.handleKey(event);
  }
}
