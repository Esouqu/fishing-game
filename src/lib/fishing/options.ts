import type { FishingGameOptions, NormalizedOptions } from "./types";

/**
 * Resolves defaults that depend on the bundler (`import.meta.env`). Kept out
 * of `types.ts` so headless tools can compile the data layer without Vite.
 */
export function normalizeOptions(
  options: FishingGameOptions,
): NormalizedOptions {
  const base = options.assetBase ?? `${import.meta.env.BASE_URL}assets/fishing`;
  return {
    container: options.container,
    assetBase: base.replace(/\/+$/, ""),
    storagePrefix: options.storagePrefix ?? "quiet-cove",
    muted: options.muted ?? false,
    startScreen: options.startScreen ?? "menu",
    onExit: options.onExit,
    onCatch: options.onCatch,
    onProgress: options.onProgress,
    onReady: options.onReady,
    progress: options.progress,
  };
}
