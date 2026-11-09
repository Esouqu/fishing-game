import { Container } from "pixi.js";

export abstract class Screen extends Container {
  onEnter(): void {}
  onExit(): void {}
  update(_dt: number): void {}
  handleKey(_event: KeyboardEvent): boolean {
    return false;
  }
  handleKeyUp(_event: KeyboardEvent): void {}
  onHostPause(_paused: boolean): void {}
  onMuteChanged(): void {}
}
