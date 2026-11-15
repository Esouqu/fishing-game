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
  /**
   * The dev audio panel opened or closed over this screen. The panel has to
   * hear the faders it is tuning, so a screen that ducks its own audio lifts
   * that duck while the panel is up.
   */
  onAudioPanel(_open: boolean): void {}
}
