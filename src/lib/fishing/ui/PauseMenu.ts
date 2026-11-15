import { Container, Graphics, Rectangle } from "pixi.js";
import type { Game } from "../Game";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import { TEXT } from "../texts";
import { Button } from "./Button";
import { FocusGroup } from "./FocusGroup";
import { UI } from "./palette";
import { PANEL_PAD, drawPanel, makeText } from "./theme";

export interface PauseMenuHandlers {
  onResume(): void;
  onCodex(): void;
}

/**
 * Centred dialog with the same inner padding on all four sides.
 *
 * It used to carry a «сменить водоем» entry under «продолжить». The two travel
 * cards in the corners of the round do that job in one click, so the pause
 * panel is down to the entries that leave or pause the round itself.
 */
const PANEL = { x: 130, y: 39, width: 220, height: 164 };
const BUTTON_W = PANEL.width - PANEL_PAD * 2;
const BUTTON_H = 21;
const BUTTON_GAP = 6;
const BUTTON_X = PANEL.x + PANEL_PAD;
const BUTTON_Y = PANEL.y + PANEL_PAD + 22 + 8;

/**
 * Pause overlay with the resume/areas/codex/sound/menu column and keyboard
 * focus navigation. The screen owns the paused state and plays the UI sounds;
 * the menu only renders the panel and tracks which button is focused.
 */
export class PauseMenu extends Container {
  private readonly game: Game;
  private readonly focus = new FocusGroup();
  private readonly soundButton: Button;

  constructor(game: Game, handlers: PauseMenuHandlers) {
    super();
    this.game = game;
    this.visible = false;

    const blocker = new Graphics();
    blocker
      .rect(0, 0, VIEW.width, VIEW.height)
      .fill({ color: UI.scrim, alpha: 0.72 });
    blocker.eventMode = "static";
    blocker.cursor = CURSORS.default;
    blocker.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.addChild(blocker);

    const panel = new Graphics();
    drawPanel(panel, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
      fill: UI.panel,
      alpha: 0.98,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText(TEXT.common.pause, {
      size: 18,
      weight: 800,
      color: UI.text,
      align: "center",
      letterSpacing: 2,
    });
    title.position.set(240, PANEL.y + PANEL_PAD);
    this.addChild(title);

    const resume = new Button({
      label: TEXT.common.resume,
      width: BUTTON_W,
      height: BUTTON_H,
      variant: "primary",
      size: 11,
      onClick: handlers.onResume,
    });
    resume.position.set(BUTTON_X, BUTTON_Y);
    this.addChild(resume);

    const codex = new Button({
      label: TEXT.codex.title,
      width: BUTTON_W,
      height: BUTTON_H,
      size: 11,
      onClick: handlers.onCodex,
    });
    codex.position.set(BUTTON_X, BUTTON_Y + BUTTON_H + BUTTON_GAP);
    this.addChild(codex);

    this.soundButton = new Button({
      label: this.muteLabel(),
      width: BUTTON_W,
      height: BUTTON_H,
      size: 11,
      onClick: () => this.game.toggleMute(),
    });
    this.soundButton.position.set(
      BUTTON_X,
      BUTTON_Y + (BUTTON_H + BUTTON_GAP) * 2,
    );
    this.addChild(this.soundButton);

    const menu = new Button({
      label: TEXT.common.menu,
      width: BUTTON_W,
      height: BUTTON_H,
      size: 11,
      onClick: () => this.game.showMenu(),
    });
    menu.position.set(BUTTON_X, BUTTON_Y + (BUTTON_H + BUTTON_GAP) * 3);
    this.addChild(menu);

    this.focus.setItems([resume, codex, this.soundButton, menu]);
    this.focus.onMove = () => this.game.audio.hover();
  }

  open(): void {
    this.visible = true;
    // The panel opens unlit: the ring appears on the first arrow key, so no
    // button is pre-selected for a player who is about to use the mouse.
    this.focus.reset();
  }

  close(): void {
    this.visible = false;
    this.focus.blur();
  }

  /** Drops the button highlight without hiding the panel (codex on top). */
  blur(): void {
    this.focus.blur();
  }

  /** Focuses one of the panel buttons by index. */
  focusAt(index: number): void {
    // Restoring the ring after an overlay closes is only right when the
    // keyboard was already driving this panel; a mouse user gets no ring.
    if (this.focus.keyboardActive) this.focus.focus(index);
    else this.focus.select(index);
  }

  handleKey(event: KeyboardEvent): boolean {
    return this.focus.handleKey(event);
  }

  /** Repaints the sound entry after the mute state changed. */
  refreshSound(): void {
    this.soundButton.setLabel(this.muteLabel());
  }

  private muteLabel(): string {
    return this.game.muted ? TEXT.common.soundOff : TEXT.common.soundOn;
  }
}
