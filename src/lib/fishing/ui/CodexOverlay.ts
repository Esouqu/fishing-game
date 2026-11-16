import { Container, Graphics, Rectangle } from "pixi.js";
import type { GameContext } from "../GameContext";
import type { AreaId } from "../types";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import { easeOutCubic } from "../utils";
import { CodexView } from "./CodexView";
import { UI } from "./palette";

/** How far the codex rises while it flies in, in pixels. */
export const CODEX_FLY_LIFT = 26;
/** How long that rise takes, in seconds. */
export const CODEX_FLY_TIME = 0.34;
/** The dimmer fades in under the arriving panel over this time. */
export const CODEX_SCRIM_TIME = 0.24;

/**
 * Modal codex layer for a paused round. The blocker dims the frozen game and
 * swallows input so only the codex receives clicks while it is open. The dimmer
 * stays put; only the panel rises into place, so the codex reads as a dialog
 * over the water rather than as a screen sliding in.
 */
export class CodexOverlay extends Container {
  private readonly view: CodexView;
  private readonly blocker = new Graphics();
  private intro = 0;

  constructor(game: GameContext, areaId: AreaId, onClose: () => void) {
    super();

    this.blocker
      .rect(0, 0, VIEW.width, VIEW.height)
      .fill({ color: UI.scrim, alpha: 0.72 });
    this.blocker.eventMode = "static";
    this.blocker.cursor = CURSORS.default;
    this.blocker.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.blocker.alpha = 0;
    this.addChild(this.blocker);

    this.view = new CodexView(game, areaId, onClose);
    this.view.y = CODEX_FLY_LIFT;
    this.view.alpha = 0;
    this.addChild(this.view);
  }

  /** Advances the fly-in; the screen ticks this while the round is paused. */
  update(dt: number): void {
    if (this.intro >= 1) return;
    this.intro = Math.min(1, this.intro + dt / CODEX_FLY_TIME);
    const eased = easeOutCubic(this.intro);
    this.view.y = CODEX_FLY_LIFT * (1 - eased);
    this.view.alpha = eased;
    this.blocker.alpha = Math.min(
      1,
      this.intro / (CODEX_SCRIM_TIME / CODEX_FLY_TIME),
    );
  }

  handleKey(event: KeyboardEvent): boolean {
    return this.view.handleKey(event);
  }
}
