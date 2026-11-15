/**
 * Backwards-compatible entry point. The actual fishing stage lives in
 * `game/scenes`; each area supplies its own renderer.
 */
export { FishingScene, createFishingScene } from "./scenes";
export type { SceneRenderer } from "./scenes";
