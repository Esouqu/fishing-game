import { CURSORS } from "../../cursors";
import { CodexOverlay } from "../../ui/CodexOverlay";
import { GameScreenCore } from "./GameScreenCore";

export abstract class GameOverlays extends GameScreenCore {
  protected openPause(): void {
    if (this.paused) return;
    this.paused = true;
    this.flow.setPaused(true);
    // The round goes quiet under the panel: a lake bed, a reel or a landed
    // chime still ringing would keep playing behind a frozen picture.
    this.game.audio.setPaused(true);
    // The flow may have cancelled the charge; clear the meter immediately
    // instead of leaving the last frame frozen behind the pause overlay.
    this.hud.update(0, null);
    this.castHint.visible = false;
    this.inputCatcher.cursor = CURSORS.default;
    this.pauseMenu.open();
    // No click here: the HUD pause button is a Button and already plays one,
    // so cueing it again made every pause sound like a double press.
  }

  protected closePause(silent = false): void {
    if (!this.paused) return;
    const hadCodex = this.codex !== null;
    // The codex flies out over the round that is about to run again; the screen
    // drops it when the animation is over (see `updateCodex`), exactly like the
    // pause panel itself.
    this.codex?.beginClose();
    this.paused = false;
    this.flow.setPaused(false);
    this.game.audio.setPaused(false);
    this.pauseMenu.close();
    if (!silent && !hadCodex) this.game.audio.back();
  }

  protected openCodex(): void {
    if (!this.paused || this.codex) return;
    this.pauseMenu.blur();
    this.codex = new CodexOverlay(this.game, this.area.id, () =>
      this.closeCodex(),
    );
    this.addChild(this.codex);
    // The pause menu's «справочник» entry is a Button and already plays the
    // click; a second one here read as a stutter.
  }

  /** Starts the close; the overlay itself animates out from here. */
  protected closeCodex(): void {
    this.codex?.beginClose();
  }

  /**
   * Ticks the codex and drops it when its fly-out has landed. It runs while the
   * round is paused and after it resumed, so a codex closed together with the
   * pause menu still finishes its slide instead of vanishing.
   */
  protected updateCodex(dt: number): void {
    const codex = this.codex;
    if (!codex) return;
    if (!codex.update(dt)) return;
    codex.destroy({ children: true });
    this.codex = null;
    // The codex is the second entry (resume, codex, sound, menu).
    this.pauseMenu.focusAt(1);
  }
}
