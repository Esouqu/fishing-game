import { VIEW } from "./config";
import { GameBootLayer } from "./GameBootLayer";
import { CURSORS, type CursorName } from "./cursors";
import { CursorOverlay } from "./ui/CursorOverlay";
import type { CursorTextures } from "./cursors";

export abstract class GameInputLayer extends GameBootLayer {
  /** True while the page hides the system pointer in favour of the overlay. */
  private nativeCursorHidden = false;

  protected layout(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const scale = Math.min(width / VIEW.width, height / VIEW.height);
    const x = Math.round((width - VIEW.width * scale) / 2);
    const y = Math.round((height - VIEW.height * scale) / 2);
    this.world.scale.set(scale);
    this.world.position.set(x, y);
    this.worldMask.scale.set(scale);
    this.worldMask.position.set(x, y);
  }

  protected applyResize(): void {
    const host = this.options.container;
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(1, Math.floor(host.clientHeight));
    if (
      Math.floor(this.app.screen.width) === width &&
      Math.floor(this.app.screen.height) === height
    ) {
      this.layout();
      return;
    }
    this.app.renderer.resize(width, height);
    this.layout();
  }
  protected updateCursor(): void {
    const overlay = this.cursorOverlay;
    if (!overlay) return;
    if (!this.pointerInside) {
      overlay.hide();
      this.setNativeCursorHidden(false);
      return;
    }

    const target = this.app.renderer.events.rootBoundary.hitTest(
      this.cursorX,
      this.cursorY,
    );
    const token = target?.cursor;
    const name: CursorName =
      token && Object.prototype.hasOwnProperty.call(CURSORS, token)
        ? (token as CursorName)
        : "default";
    overlay.setCursor(name);
    overlay.moveTo(this.cursorX, this.cursorY, this.world.scale.x * 0.5);
    this.setNativeCursorHidden(true);
  }

  protected mountCursor(cursors: CursorTextures): void {
    const overlay = new CursorOverlay(cursors);
    this.cursorOverlay = overlay;
    this.app.stage.addChild(overlay);
    this.updateCursor();
  }

  /**
   * Hides the system pointer only while the game is drawing its own. It used to
   * be hidden unconditionally from the first frame, which is why a pointer that
   * was already sitting over the canvas showed nothing at all until it moved.
   */
  private setNativeCursorHidden(hidden: boolean): void {
    if (this.nativeCursorHidden === hidden) return;
    this.nativeCursorHidden = hidden;
    this.app.canvas.classList.toggle("cursor-hidden", hidden);
  }
}
