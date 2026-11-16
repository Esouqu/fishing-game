import type { Container, Graphics } from "pixi.js";
import type { SceneLayout } from "../../areas";

/**
 * An area renderer draws everything that makes a water body recognizable.
 * Fishing mechanics, the angler, line, bobber and particles live in the
 * shared `FishingScene`; this seam only paints the world.
 */
export interface SceneRenderer {
  readonly layout: SceneLayout;
  /** Static water, shore, far bank and ice. */
  drawWorld(g: Graphics): void;
  /**
   * Trunks lying in the water. They get their own layer between the painted
   * world and the water motion, so the surface runs over them and they can be
   * rocked in {@link animate} without being repainted every frame.
   */
  drawFloating?(layer: Container): void;
  /** Trees, rocks, dock/raft, light fixture and other z-sorted props. */
  drawScenery(props: Container): void;
  /**
   * Per-frame water motion drawn above the static world. `cloudiness` (0..1)
   * lets overcast weather throw drifting cloud shadows over the water; the
   * scene smooths it, so a new front creeps in instead of popping.
   */
  drawMotion(g: Graphics, time: number, cloudiness?: number): void;
  /**
   * Optional per-frame animation of props the renderer owns, such as a boat
   * rocking on the swell or a trunk riding the chop. Called after
   * {@link drawMotion}.
   */
  animate?(time: number): void;
  /** True when the point is open water the bobber/cursor may use. */
  isWater(x: number, y: number): boolean;
}
