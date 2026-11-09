export const clamp = (value: number, min = 0, max = 1): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

export const randRange = (min: number, max: number): number =>
  min + Math.random() * (max - min);

export const randInt = (min: number, max: number): number =>
  Math.floor(randRange(min, max + 1));

export const chance = (probability: number): boolean =>
  Math.random() < probability;

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function pickWeighted<T>(
  items: readonly T[],
  weight: (item: T) => number,
): T {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, weight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export function formatScore(score: number): string {
  const rounded = Math.round(score);
  return rounded.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

export function formatMultiplier(value: number): string {
  return `×${value}`;
}

export function formatNumber(value: number): string {
  return Math.round(value).toString();
}

export function shakeIndex(length: number): number {
  return randInt(0, Math.max(0, length - 1));
}
