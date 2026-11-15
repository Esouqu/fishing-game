export interface Focusable {
  setFocused(focused: boolean): void;
  activate(): void;
}

/**
 * Keyboard navigation helper. A plain list (`columns = 1`) is navigated with
 * up/down (or left/right); grids additionally support horizontal movement.
 *
 * The highlight is a keyboard affordance, not a default state: a panel that
 * opens with one button already outlined reads as an answer that has been
 * given. Nothing is lit until the player navigates with the keyboard, and the
 * first navigation key only reveals the ring where the panel already points.
 */
export class FocusGroup {
  private items: Focusable[] = [];
  private columns = 1;
  private index = -1;
  /** True once the keyboard has been used in this group. */
  private keyboard = false;

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

  /** True once the player has navigated this group with the keyboard. */
  get keyboardActive(): boolean {
    return this.keyboard;
  }

  /**
   * Points the group at an item without lighting it. Panels use this to open
   * on the current choice; the pointer is never shown a ring it did not ask
   * for.
   */
  select(index = 0): void {
    if (this.items.length === 0) return;
    const next = Math.max(0, Math.min(this.items.length - 1, index));
    if (this.index >= 0 && this.index !== next) {
      this.items[this.index]?.setFocused(false);
    }
    this.index = next;
  }

  /** Points at an item and lights it: a key press asked for the ring. */
  focus(index = 0): void {
    this.keyboard = true;
    this.select(index);
    if (this.index >= 0) this.items[this.index].setFocused(true);
  }

  blur(): void {
    if (this.index >= 0) this.items[this.index]?.setFocused(false);
    this.index = -1;
  }

  /** Forgets the keyboard state, so a freshly opened panel starts unlit. */
  reset(): void {
    this.blur();
    this.keyboard = false;
  }

  move(dx: number, dy: number): void {
    if (this.items.length === 0) return;
    if (!this.keyboard) {
      // The first navigation key reveals the ring on the item the panel
      // already points at, or on the first one when it points at nothing.
      this.keyboard = true;
      if (this.index < 0) this.select(0);
      this.items[this.index]?.setFocused(true);
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
