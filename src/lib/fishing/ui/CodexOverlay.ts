import { Container, Graphics, Rectangle } from "pixi.js";
import type { GameContext } from "../GameContext";
import type { AreaId } from "../types";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import { CodexView } from "./CodexView";
import { UI } from "./palette";

/**
 * Modal codex layer. The blocker dims the paused game and swallows input so
 * only the codex receives clicks while it is open.
 */
export class CodexOverlay extends Container {
  private readonly view: CodexView;

  constructor(
    game: GameContext,
    areaId: AreaId,
    closeLabel: string,
    onClose: () => void,
  ) {
    super();

    const blocker = new Graphics();
    blocker
      .rect(0, 0, VIEW.width, VIEW.height)
      .fill({ color: UI.scrim, alpha: 0.72 });
    blocker.eventMode = "static";
    blocker.cursor = CURSORS.default;
    blocker.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.addChild(blocker);

    this.view = new CodexView(game, areaId, closeLabel, onClose);
    this.addChild(this.view);
  }

  handleKey(event: KeyboardEvent): boolean {
    return this.view.handleKey(event);
  }
}
