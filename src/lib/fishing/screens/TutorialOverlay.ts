import { Container, Graphics, Rectangle, type Text } from "pixi.js";
import { C, VIEW } from "../config";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { drawPanel, makeText, setText } from "../ui/theme";

interface Page {
  title: string;
  body: string;
}

const PAGES: readonly Page[] = [
  {
    title: "ТЯГА",
    body: "Держи ЛКМ / ПРОБЕЛ и веди прицел — тянешь рыбу. Отпусти кнопку — хватка (молния) восстанавливается.",
  },
  {
    title: "КОНТРРЫВОК",
    body: "Пузыри показывают, куда рванёт. Отдохни 0.15 с и тяни в обратную сторону — получится контррывок.",
  },
  {
    title: "ФИНАЛЬНЫЙ РЫВОК",
    body: "Когда рыба выдохлась и она в круге, появится крючок. Нажми ПКМ / F. На тач — коснись крючка.",
  },
];

/** First-fight tutorial: three short pages over the frozen fight. */
export class TutorialOverlay extends Container {
  private readonly subtitle: Text;
  private readonly body: Text;
  private readonly iconG = new Graphics();
  private readonly dots = new Graphics();
  private readonly nextButton: Button;
  private readonly focus = new FocusGroup();
  private pageIndex = 0;

  onClose?: () => void;

  constructor() {
    super();

    const blocker = new Graphics();
    blocker
      .rect(0, 0, VIEW.width, VIEW.height)
      .fill({ color: C.ink, alpha: 0.82 });
    blocker.eventMode = "static";
    blocker.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.addChild(blocker);

    const panel = new Graphics();
    drawPanel(panel, 52, 34, 376, 202, {
      fill: C.panel,
      alpha: 0.98,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText("КАК ЛОВИТЬ", {
      size: 15,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(240, 44);
    this.addChild(title);

    this.subtitle = makeText("", {
      size: 11,
      weight: 700,
      color: C.cyan,
      letterSpacing: 0.6,
    });
    this.subtitle.position.set(78, 72);
    this.addChild(this.subtitle);

    this.iconG.position.set(104, 118);
    this.addChild(this.iconG);

    this.body = makeText("", {
      size: 10,
      color: C.cream,
      lineHeight: 14,
    });
    this.body.position.set(146, 88);
    this.body.style.wordWrap = true;
    this.body.style.wordWrapWidth = 246;
    this.addChild(this.body);

    this.dots.position.set(240, 160);
    this.addChild(this.dots);

    const skip = new Button({
      label: "ПРОПУСТИТЬ",
      width: 104,
      height: 22,
      variant: "ghost",
      size: 10,
      onClick: () => this.close(),
    });
    skip.position.set(78, 190);
    this.addChild(skip);

    this.nextButton = new Button({
      label: "ДАЛЬШЕ",
      width: 116,
      height: 22,
      variant: "primary",
      size: 10,
      onClick: () => this.next(),
    });
    this.nextButton.position.set(278, 190);
    this.addChild(this.nextButton);

    this.focus.setItems([skip, this.nextButton]);
    this.focus.onMove = () => undefined;
    this.focus.focus(1);
    this.render();
  }

  next(): void {
    if (this.pageIndex >= PAGES.length - 1) {
      this.close();
      return;
    }
    this.pageIndex += 1;
    this.render();
  }

  close(): void {
    this.onClose?.();
    this.parent?.removeChild(this);
    this.destroy({ children: true });
  }

  handleKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape") {
      this.close();
      return true;
    }
    if (
      event.code === "Enter" ||
      event.code === "Space" ||
      event.code === "ArrowRight" ||
      event.code === "ArrowDown"
    ) {
      if (!event.repeat) this.next();
      return true;
    }
    return this.focus.handleKey(event);
  }

  private render(): void {
    const page = PAGES[this.pageIndex];
    setText(this.subtitle, page.title);
    setText(this.body, page.body);
    this.nextButton.setLabel(
      this.pageIndex === PAGES.length - 1 ? "ПОНЯТНО" : "ДАЛЬШЕ",
    );

    this.drawIcon();

    const g = this.dots;
    g.clear();
    for (let i = 0; i < PAGES.length; i += 1) {
      const x = i * 10 - (PAGES.length - 1) * 5;
      g.circle(x, 0, 2.2).fill({
        color: i === this.pageIndex ? C.gold : C.steel,
        alpha: i === this.pageIndex ? 1 : 0.55,
      });
    }
  }

  private drawIcon(): void {
    const g = this.iconG;
    g.clear();

    if (this.pageIndex === 0) {
      // Lightning bolt, the grip reserve.
      g.poly([4, -18, -7, 2, -1, 2, -6, 18, 9, -3, 3, -3]).fill(C.cyan);
      g.rect(-18, -24, 36, 48).stroke({
        width: 1,
        color: C.steel,
        alpha: 0.25,
      });
      return;
    }

    if (this.pageIndex === 1) {
      // Bubble stream and the burst arrow.
      const points = [
        [-16, 10, 2.4],
        [-8, 4, 3.2],
        [1, -3, 2.6],
        [10, -10, 3.8],
        [17, -16, 2.2],
      ];
      for (const [x, y, r] of points) {
        g.circle(x, y, r).stroke({ width: 1, color: C.cream, alpha: 0.8 });
        g.circle(x - r * 0.3, y - r * 0.3, 0.7).fill({
          color: C.cyan,
          alpha: 0.8,
        });
      }
      g.moveTo(10, -10);
      g.lineTo(25, -22);
      g.stroke({ width: 1.5, color: C.gold, alpha: 0.9 });
      g.poly([25, -22, 18, -21, 23, -15]).fill(C.gold);
      return;
    }

    // Landing hook.
    g.moveTo(4, -18);
    g.lineTo(4, 6);
    g.quadraticCurveTo(4, 18, -9, 14);
    g.stroke({ width: 2.2, color: C.gold, alpha: 0.95 });
    g.moveTo(-5, -18);
    g.lineTo(11, -18);
    g.stroke({ width: 1.8, color: C.gold, alpha: 0.95 });
    g.circle(-9, 14, 1.4).fill(C.cream);
  }
}
