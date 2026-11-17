import { Container, Graphics, Sprite } from "pixi.js";
import type { GameContext } from "../GameContext";
import { VIEW } from "../config";
import { easeOutCubic } from "../utils";
import { Screen } from "../ui/Screen";
import { Scrim } from "../ui/Scrim";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { UI } from "../ui/palette";
import { drawPanel, makeText } from "../ui/theme";
import { anchorInk } from "../ui/textInk";
import { CodexTabs } from "../ui/codex/CodexTabs";
import { HELP_PAGES, TEXT, type HelpPage } from "../texts";

/**
 * A dialog, not a page: 380×186 in the middle of the frame, the same inset
 * rhythm as the pause menu. The manual used to fill the screen and end in a
 * row of page arrows plus a «1 / 4» counter, which made four short lessons read
 * like a document; a popup keeps the menu visible behind it and every lesson
 * is one tab away.
 */
const PANEL = { x: 50, y: 40, width: 380, height: 190 } as const;
const LEFT = PANEL.x + 16;
const RIGHT = PANEL.x + PANEL.width - 16;
/** Header row, 16 px inside the frame like the codex's title row. */
const TOP = PANEL.y + 16;
/** Side of the square «Х» button in the title row, same as the codex. */
const CLOSE_SIZE = 18;
/**
 * Lesson switcher: one segmented bar, the lessons as its segments. It keeps the
 * same 8 px under the header row the codex leaves, so the two popups share one
 * vertical rhythm.
 */
const TABS = {
  x: LEFT,
  y: TOP + CLOSE_SIZE + 8,
  width: RIGHT - LEFT,
  height: 16,
};
/** The still and the copy beside it, 8 px under the switcher. */
const IMAGE = { x: LEFT, y: TABS.y + TABS.height + 8, width: 190, height: 107 };
const TEXT_X = IMAGE.x + IMAGE.width + 14;
const TEXT_W = RIGHT - TEXT_X;

/**
 * Popup motion. The numbers are the codex's own (`ui/CodexOverlay.ts`), so the
 * two dialogs open, hold and leave with one motion: same lift, same rise time,
 * same dimmer fade.
 */
const FLY_LIFT = 26;
const FLY_TIME = 0.34;
const SCRIM_TIME = 0.24;
const FLY_OUT_TIME = FLY_TIME;

/**
 * «Как играть», as a popup card.
 *
 * Four lessons — cast, fight, counter, landing — each with one line of the
 * real interface and three lines of copy, switched by the tab bar. There are no
 * page arrows and no counter: the tabs already say what the other lessons are,
 * so a reader jumps straight to the one they need instead of walking a pager.
 */
export class HelpScreen extends Screen {
  override readonly popup = true;
  /**
   * The popup flies itself: only the card moves. Letting the manager slide the
   * whole screen dragged the dark sheet across the menu with the panel, which
   * read as a second page passing over the first instead of a dialog opening on
   * top of it. The codex closes the same way.
   */
  override readonly selfFlown = true;
  private readonly game: GameContext;
  private readonly scrim = new Scrim();
  /** Everything the dialog is drawn from: the only thing that animates. */
  private readonly card = new Container();
  private readonly focus = new FocusGroup();
  private readonly pageLayer = new Container();
  private readonly tabs: CodexTabs;
  private pageIndex = 0;
  private intro = 0;
  private outro = 0;
  /**
   * Pages are painted immediately and their screenshot arrives from the lazy
   * loader a moment later. The token drops a late answer for a lesson the
   * player has already switched away from.
   */
  private renderToken = 0;

  constructor(game: GameContext) {
    super();
    this.game = game;
    // The dimmer is static: it fades where it stands while the card lifts.
    this.scrim.alpha = 0;
    this.addChild(this.scrim);
    this.addChild(this.card);

    const panel = new Graphics();
    drawPanel(panel, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
      fill: UI.panel,
      alpha: 0.94,
      shadow: true,
    });
    this.card.addChild(panel);

    const title = makeText(TEXT.help.title, {
      size: 14,
      weight: 800,
      color: UI.text,
      letterSpacing: 1,
    });
    // The wordmark and the close button are one row: the title is centred on
    // the button's middle, not on the top of the font's line box.
    anchorInk(title, "left", "center");
    title.position.set(LEFT, TOP + CLOSE_SIZE / 2);
    this.card.addChild(title);

    const close = new Button({
      label: "Х",
      width: CLOSE_SIZE,
      height: CLOSE_SIZE,
      size: 15,
      variant: "secondary",
      marks: false,
      onClick: () => this.close(),
    });
    close.position.set(RIGHT - CLOSE_SIZE, TOP);
    this.card.addChild(close);

    this.tabs = new CodexTabs({
      labels: HELP_PAGES.map((page) => page.title),
      width: TABS.width,
      height: TABS.height,
      onPick: (index) => {
        this.game.audio.click();
        this.showPage(index);
      },
      onHover: () => this.game.audio.hover(),
    });
    this.tabs.position.set(TABS.x, TABS.y);
    this.card.addChild(this.tabs);

    this.card.addChild(this.pageLayer);

    this.focus.setItems([close]);
    this.focus.onMove = () => game.audio.hover();

    this.renderPage();

    // The card starts below its resting place and out of sight: the dimmer is
    // already there, the panel rises into it.
    this.card.y = FLY_LIFT;
    this.card.alpha = 0;
  }

  /** The rise, played once on entry. */
  override update(dt: number): void {
    if (this.intro >= 1) return;
    this.intro = Math.min(1, this.intro + dt / FLY_TIME);
    const eased = easeOutCubic(this.intro);
    this.card.y = FLY_LIFT * (1 - eased);
    this.card.alpha = eased;
    this.scrim.alpha = Math.min(1, this.intro / (SCRIM_TIME / FLY_TIME));
  }

  /**
   * The card drops out of the frame while the dimmer fades where it stands.
   * Sliding the whole screen, as an ordinary popup does, dragged the dark sheet
   * down with the panel and left the menu dimmed from the top.
   */
  override animateOut(dt: number): void {
    if (this.outro === 0) {
      // Nothing may take a click while the dialog is leaving.
      this.scrim.eventMode = "none";
      this.card.interactiveChildren = false;
    }
    this.outro = Math.min(1, this.outro + dt / FLY_OUT_TIME);
    const eased = easeOutCubic(this.outro);
    this.card.y = VIEW.height * eased;
    this.card.alpha = 1 - eased;
    this.scrim.alpha = Math.min(this.scrim.alpha, 1 - eased);
  }

  private close(): void {
    this.game.audio.back();
    this.game.showMenu();
  }

  private showPage(index: number): void {
    const next = Math.max(0, Math.min(HELP_PAGES.length - 1, index));
    if (next === this.pageIndex) return;
    this.pageIndex = next;
    this.renderPage();
  }

  private renderPage(): void {
    for (const child of this.pageLayer.removeChildren()) {
      child.destroy({ children: true });
    }
    this.tabs.setSelected(this.pageIndex);

    const token = (this.renderToken += 1);
    const page: HelpPage = HELP_PAGES[this.pageIndex];
    const frame = new Graphics();
    drawPanel(frame, IMAGE.x, IMAGE.y, IMAGE.width, IMAGE.height, {
      fill: UI.ink,
      alpha: 0.55,
      shadow: false,
    });
    this.pageLayer.addChild(frame);

    // The screenshot is loaded on demand (see `assets.ts`): four images used to
    // ride the boot path even though they live behind this screen. The frame is
    // already painted, so the page behaves with a short gap.
    const imageLayer = new Container();
    const mask = new Graphics();
    mask
      .rect(IMAGE.x + 4, IMAGE.y + 2, IMAGE.width - 8, IMAGE.height - 6)
      .fill(0xffffff);
    this.pageLayer.addChild(mask);
    imageLayer.mask = mask;
    this.pageLayer.addChild(imageLayer);

    void this.game.helpTexture(page.id).then((texture) => {
      if (token !== this.renderToken) return;
      const illustration = new Sprite(texture);
      illustration.width = IMAGE.width - 8;
      illustration.height = IMAGE.height - 6;
      illustration.eventMode = "none";
      illustration.position.set(IMAGE.x + 4, IMAGE.y + 2);
      imageLayer.addChild(illustration);
    });

    const heading = makeText(page.title, {
      size: 11,
      weight: 800,
      color: UI.text,
      letterSpacing: 0.4,
    });
    heading.position.set(TEXT_X, IMAGE.y);
    this.pageLayer.addChild(heading);

    const divider = new Graphics();
    divider.rect(TEXT_X, IMAGE.y + 17, TEXT_W, 1).fill({
      color: UI.periwinkle,
      alpha: 0.4,
    });
    this.pageLayer.addChild(divider);

    // Bullets hang off the rule. Copy wraps inside the column, so a long rule
    // takes two lines and the next one starts below it instead of behind.
    let lineY = IMAGE.y + 25;
    for (const line of page.lines) {
      const bullet = new Graphics();
      bullet.rect(TEXT_X, lineY + 2, 3, 3).fill(UI.periwinkle);
      this.pageLayer.addChild(bullet);

      const text = makeText(line, {
        size: 7,
        color: UI.text,
        lineHeight: 9,
        wordWrapWidth: TEXT_W - 10,
      });
      text.position.set(TEXT_X + 9, lineY);
      text.alpha = 0.94;
      this.pageLayer.addChild(text);
      // `text.height` is the wrapped block, so the row after it is measured
      // from what this one actually took.
      lineY += Math.ceil(text.height) + 2;
    }
  }

  override onEnter(): void {
    // No button is outlined until the keyboard is used: the ring marks where
    // an arrow key will land, not a choice that has already been made.
  }

  override onExit(): void {
    this.focus.blur();
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape" || event.code === "Backspace") {
      this.close();
      return true;
    }
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      this.showPage(this.pageIndex - 1);
      return true;
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      this.showPage(this.pageIndex + 1);
      return true;
    }
    return this.focus.handleKey(event);
  }
}
