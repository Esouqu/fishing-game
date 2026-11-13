import { Container, Graphics, Sprite } from "pixi.js";
import type { Game } from "../Game";
import { C } from "../config";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { drawPanel, makeText, setText } from "../ui/theme";
import { HELP_PAGES, TEXT, type HelpPage } from "../texts";

const PANEL = { x: 24, y: 14, width: 432, height: 242 };
const IMAGE = { x: 44, y: 54, width: 218, height: 124 };
const TEXT_X = 282;

export class HelpScreen extends Screen {
  private readonly game: Game;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly pageLayer = new Container();
  private readonly pageText: ReturnType<typeof makeText>;
  private readonly prevButton: Button;
  private readonly nextButton: Button;
  private readonly backButton: Button;
  private pageIndex = 0;

  constructor(game: Game) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(game.assets, game.clock);
    this.addChild(this.backdrop);

    const panel = new Graphics();
    drawPanel(panel, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
      fill: C.panel,
      alpha: 0.94,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText(TEXT.help.title, {
      size: 16,
      weight: 800,
      color: C.gold,
      letterSpacing: 1,
    });
    title.position.set(44, 22);
    this.addChild(title);

    this.pageText = makeText("", {
      size: 8,
      color: C.steelPale,
      align: "right",
      letterSpacing: 0.5,
    });
    this.pageText.position.set(436, 26);
    this.addChild(this.pageText);

    const rule = new Graphics();
    rule.rect(44, 44, 392, 1).fill({ color: C.brownDark, alpha: 0.65 });
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
    this.prevButton.position.set(44, 227);
    this.addChild(this.prevButton);

    this.nextButton = new Button({
      label: TEXT.help.next,
      width: 62,
      height: 21,
      variant: "secondary",
      size: 8,
      onClick: () => this.changePage(1),
    });
    this.nextButton.position.set(108, 227);
    this.addChild(this.nextButton);

    this.backButton = new Button({
      label: TEXT.common.menu,
      width: 96,
      height: 21,
      variant: "primary",
      size: 9,
      onClick: () => game.showMenu(),
    });
    this.backButton.position.set(344, 227);
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

    const page: HelpPage = HELP_PAGES[this.pageIndex];
    const frame = new Graphics();
    drawPanel(frame, IMAGE.x, IMAGE.y, IMAGE.width, IMAGE.height, {
      fill: C.ink,
      alpha: 0.55,
      shadow: false,
    });
    this.pageLayer.addChild(frame);

    const illustration = new Sprite(this.game.assets.help[page.id]);
    illustration.width = 210;
    illustration.height = 118;
    illustration.position.set(IMAGE.x + 4, IMAGE.y + 2);
    illustration.eventMode = "none";
    this.pageLayer.addChild(illustration);

    const mask = new Graphics();
    mask.rect(IMAGE.x + 4, IMAGE.y + 2, 210, 118).fill(0xffffff);
    this.pageLayer.addChild(mask);
    illustration.mask = mask;

    const caption = makeText(page.caption, {
      size: 7,
      color: C.steelPale,
      letterSpacing: 0.6,
    });
    caption.position.set(44, 183);
    this.pageLayer.addChild(caption);

    const heading = makeText(page.title, {
      size: 12,
      weight: 800,
      color: C.cream,
      letterSpacing: 0.4,
    });
    heading.position.set(TEXT_X, 60);
    this.pageLayer.addChild(heading);

    const divider = new Graphics();
    divider.rect(TEXT_X, 80, 154, 1).fill({
      color: C.brownDark,
      alpha: 0.55,
    });
    this.pageLayer.addChild(divider);

    let lineY = 92;
    for (const line of page.lines) {
      const bullet = new Graphics();
      bullet.rect(TEXT_X, lineY + 2, 3, 3).fill(C.gold);
      this.pageLayer.addChild(bullet);

      const text = makeText(line, {
        size: 8,
        color: C.cream,
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
    this.focus.focus(0);
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
