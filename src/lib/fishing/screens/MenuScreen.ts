import type { GameContext } from "../GameContext";
import { VIEW } from "../config";
import type { AreaId } from "../types";
import { TEXT } from "../texts";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { UI } from "../ui/palette";
import { makeText } from "../ui/theme";

const MAIN = { x: 130, y: 92, width: 220, height: 28, gap: 8 };
const FOOTER = { y: 206, height: 24, width: 106, gap: 8 };
/** Centre of the «играть» button: where the travel wipe opens from. */
const PLAY_WIPE = { x: MAIN.x + MAIN.width / 2, y: MAIN.y + 17 };

export class MenuScreen extends Screen {
  private readonly game: GameContext;
  /** Water body the backdrop and the «играть» button point at. */
  readonly areaId: AreaId;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly buttons: Button[] = [];
  private muteButton!: Button;

  constructor(game: GameContext) {
    super();
    this.game = game;
    this.areaId = game.areaId;
    game.audio.setAmbience(game.areaId);
    this.backdrop = new Backdrop(
      game.previewFor(game.areaId),
      game.clock,
      game.area,
    );
    this.addChild(this.backdrop);

    this.buildTitle();
    this.buildButtons();
  }

  private buildTitle(): void {
    const title = makeText(TEXT.menu.title, {
      size: 26,
      weight: 800,
      color: UI.text,
      align: "center",
      letterSpacing: 0.5,
      outline: true,
    });
    title.position.set(VIEW.width / 2, 34);
    this.addChild(title);
  }

  private buildButtons(): void {
    const play = this.makeMainButton(
      TEXT.common.play,
      0,
      34,
      14,
      "primary",
      // Straight into the water body the player left last: the picker is no
      // longer a step on the way in. Travel between the three waters stays in
      // the round itself, on the corner cards.
      () => this.game.startGame(this.game.areaId, PLAY_WIPE),
    );
    const codex = this.makeMainButton(
      TEXT.codex.title,
      1,
      24,
      12,
      "secondary",
      // The codex always comes back to the title now: the water picker is gone
      // and travel between the remaining bodies happens in the round itself.
      () => this.game.showCodex(),
    );
    const help = this.makeMainButton(
      TEXT.common.howToPlay,
      2,
      24,
      12,
      "secondary",
      () => this.game.showHelp(),
    );
    this.buttons.push(play, codex, help);

    const hasExit = this.game.options.onExit !== undefined;
    const footerWidth = hasExit ? FOOTER.width : FOOTER.width * 2 + FOOTER.gap;

    this.muteButton = new Button({
      label: this.muteLabel(),
      width: footerWidth,
      height: FOOTER.height,
      size: 10,
      onClick: () => {
        this.game.toggleMute();
        this.muteButton.setLabel(this.muteLabel());
      },
    });
    this.muteButton.position.set(MAIN.x, FOOTER.y);
    this.addChild(this.muteButton);
    this.buttons.push(this.muteButton);

    if (hasExit) {
      const exit = new Button({
        label: TEXT.common.exit,
        width: FOOTER.width,
        height: FOOTER.height,
        size: 10,
        onClick: () => this.game.exit(),
      });
      exit.position.set(MAIN.x + FOOTER.width + FOOTER.gap, FOOTER.y);
      this.addChild(exit);
      this.buttons.push(exit);
    }

    this.focus.setItems(this.buttons);
    this.focus.onMove = () => this.game.audio.hover();
  }

  private makeMainButton(
    label: string,
    index: number,
    height: number,
    size: number,
    variant: "primary" | "secondary",
    onClick: () => void,
  ): Button {
    const button = new Button({
      label,
      width: MAIN.width,
      height,
      variant,
      size,
      onClick,
    });
    const y =
      index === 0
        ? MAIN.y
        : MAIN.y + 34 + MAIN.gap + (index - 1) * (MAIN.height + MAIN.gap);
    button.position.set(MAIN.x, y);
    this.addChild(button);
    return button;
  }

  private muteLabel(): string {
    return this.game.muted ? TEXT.common.soundOff : TEXT.common.soundOn;
  }

  override onEnter(): void {
    // Nothing is outlined on entry: the ring is a keyboard affordance, and it
    // appears on the first arrow key (see `FocusGroup`).
  }

  override onExit(): void {
    this.focus.blur();
  }

  override onMuteChanged(): void {
    this.muteButton.setLabel(this.muteLabel());
  }

  override update(dt: number): void {
    this.backdrop.update(dt);
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape") return true;
    return this.focus.handleKey(event);
  }
}
