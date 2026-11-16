import { CURSORS } from "../../cursors";
import { TEXT } from "../../texts";
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
    this.closeCodex();
    this.paused = false;
    this.flow.setPaused(false);
    this.game.audio.setPaused(false);
    this.pauseMenu.close();
    if (!silent && !hadCodex) this.game.audio.back();
  }

  protected openCodex(): void {
    if (!this.paused || this.codex) return;
    this.pauseMenu.blur();
    this.codex = new CodexOverlay(
      this.game,
      this.area.id,
      TEXT.codex.close,
      () => this.closeCodex(),
    );
    this.addChild(this.codex);
    // The pause menu's «справочник» entry is a Button and already plays the
    // click; a second one here read as a stutter.
  }

  protected closeCodex(): void {
    if (!this.codex) return;
    this.codex.destroy({ children: true });
    this.codex = null;
    // The codex is the second entry (resume, codex, sound, menu).
    this.pauseMenu.focusAt(1);
  }
}
