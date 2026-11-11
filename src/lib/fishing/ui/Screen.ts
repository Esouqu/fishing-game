import { Container } from "pixi.js";

export abstract class Screen extends Container {
  onEnter(): void {}
  onExit(): void {}
  update(_dt: number): void {}
  handleKey(_event: KeyboardEvent): boolean {
    return false;
  }
  handleKeyUp(_event: KeyboardEvent): void {}
  handleWheel(_event: WheelEvent): boolean {
    return false;
  }
  onHostPause(_paused: boolean): void {}
  onMuteChanged(): void {}
}
