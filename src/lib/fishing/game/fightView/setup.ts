export const FISH_SCALE = 1;
/**
 * The hooked fish is never shown in its own colours: through the water it is a
 * shadow, and the fight is about reading its motion, not its livery. The tint is
 * almost black rather than the old blue-teal, and the sprite sits below full
 * opacity so it stays a dark shape *in* the water instead of a sticker on top of
 * it — the red float and the warning arrow must remain the brightest things in
 * the ring.
 */
export const SILHOUETTE = 0x05080b;
/** The warning only lifts the shadow to a cold slate; the arrow carries the cue. */
export const SILHOUETTE_WARN = 0x1b2830;
/** Opacity of that shadow; low enough that the water reads through the fish. */
export const SILHOUETTE_ALPHA = 0.55;
export const TAU = Math.PI * 2;
export const INTRO_DURATION = 0.42;
/** How far above the tired fish its "land it" mark hangs, in pixels. */
export const LAND_MARK_LIFT = 17;
