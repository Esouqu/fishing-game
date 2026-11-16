import type { FightState } from "./state";

/**
 * Resolves the pull direction for this frame: keyboard overrides the pointer,
 * then the cursor relative to the fish, then the last sticky direction, then
 * straight back toward the ring centre.
 */
export function pullVector(state: FightState): { x: number; y: number } | null {
  const s = state;
  if (!s.hold) return null;
  const dirLength = Math.hypot(s.directionX, s.directionY);
  if (dirLength > 0.1) {
    return {
      x: s.directionX / dirLength,
      y: s.directionY / dirLength,
    };
  }

  const fishX = s.centerX + s.fishX;
  const fishY = s.centerY + s.fishY;
  if (s.pointerX !== null && s.pointerY !== null) {
    const dx = s.pointerX - fishX;
    const dy = s.pointerY - fishY;
    const length = Math.hypot(dx, dy);
    if (length > 10) {
      s.stickyX = dx / length;
      s.stickyY = dy / length;
      return { x: s.stickyX, y: s.stickyY };
    }
  }

  // Keep pulling in the last valid direction when the cursor sits on the
  // fish itself, so the catch never slips out from under the pointer. With
  // no recorded aim yet, pull straight back toward the ring centre.
  if (s.stickyX !== 0 || s.stickyY !== 0) {
    return { x: s.stickyX, y: s.stickyY };
  }
  const radius = Math.hypot(s.fishX, s.fishY);
  if (radius > 1) {
    return { x: -s.fishX / radius, y: -s.fishY / radius };
  }
  return null;
}
