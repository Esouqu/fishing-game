import { Graphics, Text } from "pixi.js";
import type { Game } from "../Game";
import { C } from "../config";
import type { SessionResult } from "../types";
import { formatScore } from "../utils";
import { Screen } from "../ui/Screen";
import { Backdrop } from "../ui/Backdrop";
import { Button } from "../ui/Button";
import { drawPanel, makeText } from "../ui/theme";

type Layout = "ru" | "en";

const LAYOUTS: Record<Layout, string[][]> = {
  ru: [
    ["Й", "Ц", "У", "К", "Е", "Н", "Г", "Ш", "Щ", "З", "Х", "Ъ"],
    ["Ф", "Ы", "В", "А", "П", "Р", "О", "Л", "Д", "Ж", "Э"],
    ["Я", "Ч", "С", "М", "И", "Т", "Ь", "Б", "Ю", "Ё"],
  ],
  en: [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ],
};

const MAX_NAME = 12;
const NAME_PATTERN = /^[A-Za-zА-Яа-яЁё0-9 _-]$/;

export class NameEntryScreen extends Screen {
  private readonly game: Game;
  private readonly result: SessionResult;
  private readonly backdrop: Backdrop;

  private readonly nameText: Text;
  private readonly placeholder: Text;
  private readonly caret = new Graphics();

  private readonly letterButtons: Button[] = [];
  private readonly actionButtons: Button[] = [];
  private allButtons: Button[] = [];

  private readonly doneButton: Button;
  private readonly layoutButton: Button;

  private layout: Layout = "ru";
  private playerName: string;
  private focusIndex = 0;
  private time = 0;

  constructor(game: Game, result: SessionResult) {
    super();
    this.game = game;
    this.result = result;
    this.backdrop = new Backdrop(game.assets);
    this.addChild(this.backdrop);

    this.playerName = (
      game.settings.lastName ||
      game.options.playerName ||
      ""
    ).slice(0, MAX_NAME);

    const panel = new Graphics();
    drawPanel(panel, 18, 16, 444, 238, {
      fill: C.panel,
      alpha: 0.96,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText("ТВОЁ ИМЯ", {
      size: 16,
      weight: 800,
      color: C.gold,
      align: "center",
      letterSpacing: 1,
    });
    title.position.set(240, 25);
    this.addChild(title);

    const rank = game.leaderboard.previewRank(result.score);
    const rankLine = makeText(
      `МЕСТО ${rank} · ${formatScore(result.score)} ОЧКОВ`,
      {
        size: 9,
        color: C.cyan,
        align: "center",
        weight: 600,
      },
    );
    rankLine.position.set(240, 44);
    this.addChild(rankLine);

    const inputBg = new Graphics();
    inputBg.rect(90, 60, 300, 30).fill({ color: C.ink, alpha: 0.7 });
    inputBg
      .rect(90, 60, 300, 30)
      .stroke({ width: 1, color: C.steel, alignment: 0 });
    inputBg.rect(91, 61, 298, 1).fill({ color: C.cream, alpha: 0.12 });
    this.addChild(inputBg);

    this.placeholder = makeText("ВВЕДИ ИМЯ", {
      size: 11,
      color: C.steelPale,
      align: "center",
    });
    this.placeholder.position.set(240, 68);
    this.placeholder.alpha = 0.45;
    this.addChild(this.placeholder);

    this.nameText = makeText("", {
      size: 19,
      weight: 700,
      color: C.cream,
      align: "center",
      letterSpacing: 1,
    });
    this.nameText.position.set(240, 64);
    this.addChild(this.nameText, this.caret);

    this.buildKeyboard();

    this.doneButton = new Button({
      label: "ГОТОВО",
      width: 92,
      height: 20,
      variant: "primary",
      size: 9,
      onClick: () => this.submit(),
    });
    this.doneButton.position.set(272, 174);
    this.addChild(this.doneButton);

    const space = new Button({
      label: "ПРОБЕЛ",
      width: 88,
      height: 20,
      size: 9,
      onClick: () => this.append(" "),
    });
    space.position.set(42, 174);
    this.addChild(space);

    const erase = new Button({
      label: "СТЕРЕТЬ",
      width: 80,
      height: 20,
      size: 9,
      onClick: () => this.erase(),
    });
    erase.position.set(134, 174);
    this.addChild(erase);

    this.layoutButton = new Button({
      label: "ENG",
      width: 50,
      height: 20,
      size: 9,
      onClick: () => this.toggleLayout(),
    });
    this.layoutButton.position.set(218, 174);
    this.addChild(this.layoutButton);

    const back = new Button({
      label: "НАЗАД",
      width: 70,
      height: 20,
      size: 9,
      onClick: () => this.back(),
    });
    back.position.set(368, 174);
    this.addChild(back);

    this.actionButtons.push(
      space,
      erase,
      this.layoutButton,
      this.doneButton,
      back,
    );
    this.allButtons = [...this.letterButtons, ...this.actionButtons];

    const hint = makeText(
      "ПЕЧАТАЙ НА КЛАВИАТУРЕ · ENTER — АКТИВИРОВАТЬ КНОПКУ",
      {
        size: 8,
        color: C.steelPale,
        align: "center",
        letterSpacing: 0.4,
      },
    );
    hint.position.set(240, 202);
    hint.alpha = 0.85;
    this.addChild(hint);

    const footer = makeText("ИМЯ СОХРАНИТСЯ В ТАБЛИЦЕ ЛИДЕРОВ", {
      size: 8,
      color: C.steelPale,
      align: "center",
      letterSpacing: 0.4,
    });
    footer.position.set(240, 224);
    footer.alpha = 0.65;
    this.addChild(footer);

    this.refreshName();
    this.focusIndex = this.allButtons.indexOf(this.doneButton);
    this.applyFocus(false);
  }

  private buildKeyboard(): void {
    for (const button of this.letterButtons) {
      this.removeChild(button);
      button.destroy({ children: true });
    }
    this.letterButtons.length = 0;

    const rows = LAYOUTS[this.layout];
    const keyWidth = 24;
    const keyHeight = 22;
    const gap = 3;
    const rowY = [100, 124, 148];

    rows.forEach((row, rowIndex) => {
      const total = row.length * keyWidth + (row.length - 1) * gap;
      let x = Math.round(240 - total / 2);
      for (const char of row) {
        const button = new Button({
          label: char,
          width: keyWidth,
          height: keyHeight,
          size: 10,
          onClick: () => this.append(char),
        });
        button.position.set(x, rowY[rowIndex]);
        this.addChild(button);
        this.letterButtons.push(button);
        x += keyWidth + gap;
      }
    });
  }

  private toggleLayout(): void {
    this.layout = this.layout === "ru" ? "en" : "ru";
    this.layoutButton.setLabel(this.layout === "ru" ? "ENG" : "РУС");
    this.buildKeyboard();
    this.allButtons = [...this.letterButtons, ...this.actionButtons];
    this.focusIndex = this.allButtons.indexOf(this.doneButton);
    this.applyFocus(false);
  }

  private refreshName(): void {
    this.nameText.text = this.playerName;
    this.placeholder.visible = this.playerName.length === 0;
    const caretX =
      this.playerName.length === 0
        ? 240 - this.placeholder.width / 2 - 6
        : 240 + this.nameText.width / 2 + 3;
    this.caret.clear();
    this.caret.rect(caretX, 66, 2, 20).fill({ color: C.gold, alpha: 0.9 });
  }

  private append(char: string): void {
    if (this.playerName.length >= MAX_NAME) return;
    if (!NAME_PATTERN.test(char)) return;
    this.playerName += char;
    this.game.audio.hover();
    this.refreshName();
  }

  private erase(): void {
    if (this.playerName.length === 0) return;
    this.playerName = this.playerName.slice(0, -1);
    this.game.audio.back();
    this.refreshName();
  }

  private submit(): void {
    const name = this.playerName.trim() || "Рыбак";
    const standing = this.game.submitScore(name, this.result);
    this.game.audio.newRecord();
    this.game.showLeaderboard({
      highlightId: standing.entry.id,
      from: "result",
    });
  }

  private back(): void {
    this.game.audio.back();
    this.game.showResults(this.result, false);
  }

  private applyFocus(playSound: boolean): void {
    this.allButtons.forEach((button, index) => {
      button.setFocused(index === this.focusIndex);
    });
    if (playSound) this.game.audio.hover();
  }

  private moveFocus(dx: number, dy: number): void {
    const current = this.allButtons[this.focusIndex];
    if (!current) {
      this.focusIndex = 0;
      this.applyFocus(false);
      return;
    }
    const cx = current.x + current.buttonWidth / 2;
    const cy = current.y + current.buttonHeight / 2;

    let best = -1;
    let bestScore = Infinity;
    this.allButtons.forEach((button, index) => {
      if (button === current) return;
      const bx = button.x + button.buttonWidth / 2;
      const by = button.y + button.buttonHeight / 2;
      const ox = bx - cx;
      const oy = by - cy;
      const forward = dy !== 0 ? oy * dy : ox * dx;
      const side = dy !== 0 ? Math.abs(ox) : Math.abs(oy);
      if (forward <= 6) return;
      const score = forward + side * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = index;
      }
    });

    if (best >= 0) {
      this.focusIndex = best;
      this.applyFocus(true);
    }
  }

  override onEnter(): void {
    this.focusIndex = Math.max(0, this.allButtons.indexOf(this.doneButton));
    this.applyFocus(false);
  }

  override update(dt: number): void {
    this.time += dt;
    this.backdrop.update(dt);
    this.caret.visible = Math.floor(this.time * 2) % 2 === 0;
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape") {
      this.back();
      return true;
    }
    if (event.code === "Backspace") {
      this.erase();
      return true;
    }
    if (event.code === "ArrowLeft") {
      this.moveFocus(-1, 0);
      return true;
    }
    if (event.code === "ArrowRight") {
      this.moveFocus(1, 0);
      return true;
    }
    if (event.code === "ArrowUp") {
      this.moveFocus(0, -1);
      return true;
    }
    if (event.code === "ArrowDown") {
      this.moveFocus(0, 1);
      return true;
    }
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      const focused = this.allButtons[this.focusIndex];
      if (focused) focused.activate();
      else this.submit();
      return true;
    }
    if (event.key.length === 1) {
      this.append(event.key);
      return true;
    }
    return false;
  }
}
