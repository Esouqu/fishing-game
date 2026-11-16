import type { GameContext } from "../GameContext";
import type { CodexReturn } from "../types";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { CodexView } from "../ui/CodexView";

export class CodexScreen extends Screen {
  private readonly backdrop: Backdrop;
  private readonly view: CodexView;

  constructor(game: GameContext, returnTo: CodexReturn = "menu") {
    super();
    this.backdrop = new Backdrop(
      game.previewFor(game.areaId),
      game.clock,
      game.area,
    );
    this.addChild(this.backdrop);

    this.view = new CodexView(game, game.areaId, "НАЗАД", () => {
      if (returnTo === "areas") game.showAreas();
      else game.showMenu();
    });
    this.addChild(this.view);
  }

  override update(dt: number): void {
    this.backdrop.update(dt);
  }

  override handleKey(event: KeyboardEvent): boolean {
    return this.view.handleKey(event);
  }
}
