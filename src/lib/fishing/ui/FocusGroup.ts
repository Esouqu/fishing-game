export interface Focusable {
  setFocused(focused: boolean): void;
  activate(): void;
}

/**
 * Keyboard navigation helper. A plain list (`columns = 1`) is navigated with
 * up/down (or left/right); grids additionally support horizontal movement.
 */
export class FocusGroup {
  private items: Focusable[] = [];
  private columns = 1;
  private index = -1;

  onMove?: () => void;

  setItems(items: Focusable[], columns = 1): void {
    this.blur();
    this.items = items;
    this.columns = Math.max(1, columns);
    this.index = -1;
  }

  get current(): Focusable | null {
    return this.index >= 0 ? (this.items[this.index] ?? null) : null;
  }

  get currentIndex(): number {
    return this.index;
  }

  focus(index = 0): void {
    if (this.items.length === 0) return;
    this.index = Math.max(0, Math.min(this.items.length - 1, index));
    this.items[this.index].setFocused(true);
  }

  blur(): void {
    if (this.index >= 0) this.items[this.index]?.setFocused(false);
    this.index = -1;
  }

  move(dx: number, dy: number): void {
    if (this.items.length === 0) return;
    if (this.index < 0) {
      this.focus(0);
      this.onMove?.();
      return;
    }
    let next = this.index;
    if (this.columns <= 1) {
      if (dx > 0 || dy > 0) next += 1;
      if (dx < 0 || dy < 0) next -= 1;
    } else {
      if (dx !== 0) {
        const row = Math.floor(this.index / this.columns);
        const col = this.index % this.columns;
        const nextCol = col + dx;
        if (nextCol >= 0 && nextCol < this.columns) {
          next = Math.min(this.items.length - 1, row * this.columns + nextCol);
        }
      }
      if (dy !== 0) {
        next = Math.max(
          0,
          Math.min(this.items.length - 1, this.index + dy * this.columns),
        );
      }
    }
    next = Math.max(0, Math.min(this.items.length - 1, next));
    if (next !== this.index) {
      this.items[this.index]?.setFocused(false);
      this.index = next;
      this.items[this.index].setFocused(true);
      this.onMove?.();
    }
  }

  activate(): void {
    this.items[this.index]?.activate();
  }

  handleKey(event: KeyboardEvent): boolean {
    switch (event.code) {
      case "ArrowUp":
      case "KeyW":
        this.move(0, -1);
        return true;
      case "ArrowDown":
      case "KeyS":
        this.move(0, 1);
        return true;
      case "ArrowLeft":
      case "KeyA":
        this.move(-1, 0);
        return true;
      case "ArrowRight":
      case "KeyD":
        this.move(1, 0);
        return true;
      case "Enter":
      case "Space":
      case "NumpadEnter":
        this.activate();
        return true;
      default:
        return false;
    }
  }
}
