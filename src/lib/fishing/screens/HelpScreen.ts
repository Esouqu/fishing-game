import { Container, Graphics, Sprite } from "pixi.js";
import type { GameContext } from "../GameContext";
import { VIEW } from "../config";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { UI } from "../ui/palette";
import {
  PANEL_PAD,
  SCREEN_INSET,
  drawPanel,
  makeText,
  setText,
} from "../ui/theme";
import { HELP_PAGES, TEXT, type HelpPage } from "../texts";

const PANEL = {
  x: SCREEN_INSET,
  y: SCREEN_INSET,
  width: VIEW.width - SCREEN_INSET * 2,
  height: VIEW.height - SCREEN_INSET * 2,
};
const LEFT = PANEL.x + PANEL_PAD;
const RIGHT = PANEL.x + PANEL.width - PANEL_PAD;
const IMAGE = { x: LEFT, y: 54, width: 218, height: 124 };
const TEXT_X = LEFT + IMAGE.width + 16;
const TEXT_W = RIGHT - TEXT_X;
const BUTTON_Y = PANEL.y + PANEL.height - PANEL_PAD - 21;

export class HelpScreen extends Screen {
  private readonly game: GameContext;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly pageLayer = new Container();
  private readonly pageText: ReturnType<typeof makeText>;
  private readonly prevButton: Button;
  private readonly nextButton: Button;
  private readonly backButton: Button;
  private pageIndex = 0;
  /**
   * Pages are painted immediately and their screenshot arrives from the lazy
   * loader a moment later. The token drops a late answer for a page the player
   * has already flipped away from.
   */
  private renderToken = 0;

  constructor(game: GameContext) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(
      game.previewFor(game.areaId),
      game.clock,
      game.area,
    );
    this.addChild(this.backdrop);

    const panel = new Graphics();
    drawPanel(panel, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
      fill: UI.panel,
      alpha: 0.94,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText(TEXT.help.title, {
      size: 16,
      weight: 800,
      color: UI.text,
      letterSpacing: 1,
    });
    title.position.set(LEFT, PANEL.y + 12);
    this.addChild(title);

    this.pageText = makeText("", {
      size: 8,
      color: UI.textMuted,
      align: "right",
      letterSpacing: 0.5,
    });
    this.pageText.position.set(RIGHT, 26);
    this.addChild(this.pageText);

    const rule = new Graphics();
    rule.rect(LEFT, 44, RIGHT - LEFT, 1).fill({
      color: UI.periwinkle,
      alpha: 0.45,
    });
    this.addChild(rule);

    this.addChild(this.pageLayer);

    this.prevButton = new Button({
      label: TEXT.help.prev,
      width: 58,
      height: 21,
      variant: "secondary",
      size: 8,
      onClick: () => this.changePage(-1),
    });
    this.prevButton.position.set(LEFT, BUTTON_Y);
    this.addChild(this.prevButton);

    this.nextButton = new Button({
      label: TEXT.help.next,
      width: 62,
      height: 21,
      variant: "secondary",
      size: 8,
      onClick: () => this.changePage(1),
    });
    this.nextButton.position.set(LEFT + 64, BUTTON_Y);
    this.addChild(this.nextButton);

    this.backButton = new Button({
      label: TEXT.common.menu,
      width: 96,
      height: 21,
      variant: "primary",
      size: 9,
      onClick: () => game.showMenu(),
    });
    this.backButton.position.set(RIGHT - 96, BUTTON_Y);
    this.addChild(this.backButton);

    this.focus.setItems([this.backButton]);
    this.focus.onMove = () => game.audio.hover();

    this.renderPage();
  }

  private changePage(delta: number): void {
    const next = Math.max(
      0,
      Math.min(HELP_PAGES.length - 1, this.pageIndex + delta),
    );
    if (next === this.pageIndex) return;
    this.pageIndex = next;
    this.game.audio.hover();
    this.renderPage();
  }

  private renderPage(): void {
    for (const child of this.pageLayer.removeChildren()) {
      child.destroy({ children: true });
    }

    const token = (this.renderToken += 1);
    const page: HelpPage = HELP_PAGES[this.pageIndex];
    const frame = new Graphics();
    drawPanel(frame, IMAGE.x, IMAGE.y, IMAGE.width, IMAGE.height, {
      fill: UI.ink,
      alpha: 0.55,
      shadow: false,
    });
    this.pageLayer.addChild(frame);

    // The screenshot is loaded on demand (see `assets.ts`): four images used
    // to ride the boot path even though they live behind this screen. The
    // frame is already painted, so the page behaves with a short gap.
    const imageLayer = new Container();
    const mask = new Graphics();
    mask.rect(IMAGE.x + 4, IMAGE.y + 2, 210, 118).fill(0xffffff);
    this.pageLayer.addChild(mask);
    imageLayer.mask = mask;
    this.pageLayer.addChild(imageLayer);

    void this.game.helpTexture(page.id).then((texture) => {
      if (token !== this.renderToken) return;
      const illustration = new Sprite(texture);
      illustration.width = 210;
      illustration.height = 118;
      illustration.eventMode = "none";
      illustration.position.set(IMAGE.x + 4, IMAGE.y + 2);
      imageLayer.addChild(illustration);
    });

    const caption = makeText(page.caption, {
      size: 7,
      color: UI.textMuted,
      letterSpacing: 0.6,
    });
    caption.position.set(LEFT, 183);
    this.pageLayer.addChild(caption);

    const heading = makeText(page.title, {
      size: 12,
      weight: 800,
      color: UI.text,
      letterSpacing: 0.4,
    });
    heading.position.set(TEXT_X, 60);
    this.pageLayer.addChild(heading);

    const divider = new Graphics();
    divider.rect(TEXT_X, 80, TEXT_W, 1).fill({
      color: UI.periwinkle,
      alpha: 0.4,
    });
    this.pageLayer.addChild(divider);

    let lineY = 92;
    for (const line of page.lines) {
      const bullet = new Graphics();
      bullet.rect(TEXT_X, lineY + 2, 3, 3).fill(UI.periwinkle);
      this.pageLayer.addChild(bullet);

      const text = makeText(line, {
        size: 8,
        color: UI.text,
        lineHeight: 10,
      });
      text.position.set(TEXT_X + 10, lineY);
      text.alpha = 0.94;
      this.pageLayer.addChild(text);

      const lineCount = line.split("\n").length;
      lineY += 15 + (lineCount - 1) * 11;
    }

    setText(
      this.pageText,
      TEXT.help.page(this.pageIndex + 1, HELP_PAGES.length),
    );
    this.prevButton.setEnabled(this.pageIndex > 0);
    this.nextButton.setEnabled(this.pageIndex < HELP_PAGES.length - 1);
  }

  override onEnter(): void {
    // No button is outlined until the keyboard is used: the ring marks where
    // an arrow key will land, not a choice that has already been made.
  }

  override onExit(): void {
    this.focus.blur();
  }

  override update(dt: number): void {
    this.backdrop.update(dt);
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape" || event.code === "Backspace") {
      this.game.audio.back();
      this.game.showMenu();
      return true;
    }
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      this.changePage(-1);
      return true;
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      this.changePage(1);
      return true;
    }
    return this.focus.handleKey(event);
  }
}
