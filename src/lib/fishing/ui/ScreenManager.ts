import { Container, Graphics } from "pixi.js";
import { C, VIEW } from "../config";
import type { Screen } from "./Screen";

/**
 * Holds a single screen at a time and cross-fades between screens with a short
 * pixel-perfect black dip. The fade layer always stays on top.
 */
export class ScreenManager {
  readonly layer = new Container();
  private readonly fade = new Graphics();
  private current: Screen | null = null;
  private pending: Screen | null = null;
  private phase: "idle" | "out" | "in" = "idle";
  private progress = 0;

  constructor() {
    this.fade.rect(0, 0, VIEW.width, VIEW.height).fill({ color: C.ink });
    this.fade.alpha = 0;
    this.fade.eventMode = "none";
    this.layer.addChild(this.fade);
  }

  get active(): Screen | null {
    return this.current;
  }

  show(screen: Screen): void {
    if (this.current === null) {
      this.setCurrent(screen);
      this.phase = "in";
      this.progress = 0;
      this.fade.alpha = 1;
      return;
    }
    if (this.pending && this.pending !== screen) {
      this.pending.destroy({ children: true });
    }
    this.pending = screen;
    this.phase = "out";
    this.progress = 0;
  }

  private setCurrent(screen: Screen): void {
    this.current = screen;
    this.layer.addChildAt(screen, this.layer.children.length - 1);
    screen.onEnter();
  }

  private swap(): void {
    if (!this.pending) return;
    const next = this.pending;
    this.pending = null;
    if (this.current) {
      const old = this.current;
      old.onExit();
      this.layer.removeChild(old);
      old.destroy({ children: true });
    }
    this.setCurrent(next);
    this.phase = "in";
    this.progress = 0;
  }
  update(dt: number): void {
    if (this.phase === "out") {
      this.progress += dt / 0.13;
      this.fade.alpha = Math.min(1, this.progress);
      if (this.progress >= 1) this.swap();
    } else if (this.phase === "in") {
      this.progress += dt / 0.17;
      this.fade.alpha = 1 - Math.min(1, this.progress);
      if (this.progress >= 1) {
        this.phase = "idle";
        this.fade.alpha = 0;
      }
    }
    this.current?.update(dt);
  }

  handleKey(event: KeyboardEvent): void {
    this.current?.handleKey(event);
  }

  handleKeyUp(event: KeyboardEvent): void {
    this.current?.handleKeyUp(event);
  }

  onHostPause(paused: boolean): void {
    this.current?.onHostPause(paused);
  }

  destroy(): void {
    if (this.pending) {
      this.pending.destroy({ children: true });
      this.pending = null;
    }
    this.current = null;
    this.layer.parent?.removeChild(this.layer);
    this.layer.destroy({ children: true });
  }
}
