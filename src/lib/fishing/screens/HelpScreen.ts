import { Graphics } from "pixi.js";
import type { Game } from "../Game";
import { C } from "../config";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { FocusGroup } from "../ui/FocusGroup";
import { drawFishGlyph, drawPanel, makeText } from "../ui/theme";

interface Line {
  text: string;
  y: number;
  bullet?: boolean;
  color?: number;
}

const SECTIONS: Array<{ title: string; y: number; lines: Line[] }> = [
  {
    title: "УПРАВЛЕНИЕ",
    y: 54,
    lines: [
      { text: "ЗАБРОС — зажми ЛКМ или ПРОБЕЛ, отпусти в нужный момент", y: 68 },
      { text: "ПОКЛЁВКА — жми, как только над поплавком появится «!»", y: 81 },
      {
        text: "ВЫВАЖИВАНИЕ — держи ЛКМ/пробел и веди прицел; отпусти — отдых",
        y: 94,
      },
      {
        text: "ФИНАЛЬНЫЙ РЫВОК — ПКМ/F, когда появился крючок",
        y: 107,
      },
      { text: "РАНО ПОДСЕКЁШЬ — рыба уйдёт, а заброс вернётся", y: 120 },
    ],
  },
  {
    title: "МИР И ЛОВЛЯ",
    y: 134,
    lines: [
      {
        text: "КРУГ — рыба рвётся наружу, не дай ей выйти",
        y: 147,
        bullet: true,
      },
      {
        text: "ПУЗЫРИ — куда рванёт; отдохни 0.15 с и тяни в обратную сторону",
        y: 160,
        bullet: true,
      },
      {
        text: "МОЛНИЯ — хватка: отпусти кнопку, чтобы восстановить",
        y: 173,
        bullet: true,
      },
      {
        text: "КРЮЧОК — рыба выдохлась: ПКМ/F или тап по крючку",
        y: 186,
        bullet: true,
      },
      {
        text: "ЗОНА УДАЧИ И ПОГОДА — влияют на клёв и редкость рыбы",
        y: 199,
        bullet: true,
      },
      {
        text: "ОЧКИ = рыба × комбо × бонус; идеально — не больше 2 срывов",
        y: 212,
        bullet: true,
      },
    ],
  },
];

export class HelpScreen extends Screen {
  private readonly game: Game;
  private readonly backdrop: Backdrop;
  private readonly focus = new FocusGroup();
  private readonly backButton: Button;

  constructor(game: Game) {
    super();
    this.game = game;
    this.backdrop = new Backdrop(game.assets, game.clock);
    this.addChild(this.backdrop);

    const g = new Graphics();
    drawPanel(g, 28, 18, 424, 234, {
      fill: C.panel,
      alpha: 0.94,
      shadow: true,
    });
    this.addChild(g);

    const title = makeText("КАК ИГРАТЬ", {
      size: 17,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(240, 28);
    this.addChild(title);

    const rule = new Graphics();
    rule.rect(48, 50, 384, 1).fill({ color: C.steel, alpha: 0.5 });
    this.addChild(rule);

    for (const section of SECTIONS) {
      const heading = makeText(section.title, {
        size: 11,
        weight: 700,
        color: C.cyan,
      });
      heading.position.set(48, section.y);
      this.addChild(heading);

      for (const line of section.lines) {
        if (line.bullet) {
          const glyph = new Graphics();
          drawFishGlyph(glyph, C.gold);
          glyph.position.set(48, line.y + 1);
          this.addChild(glyph);
        }
        const text = makeText(line.text, {
          size: 10,
          color: line.color ?? C.cream,
        });
        text.position.set(line.bullet ? 64 : 48, line.y);
        text.alpha = 0.92;
        this.addChild(text);
      }
    }

    this.backButton = new Button({
      label: "НАЗАД",
      width: 128,
      height: 21,
      variant: "primary",
      size: 11,
      onClick: () => game.showMenu(),
    });
    this.backButton.position.set(176, 226);
    this.addChild(this.backButton);

    this.focus.setItems([this.backButton]);
    this.focus.onMove = () => game.audio.hover();
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
    return this.focus.handleKey(event);
  }
}
