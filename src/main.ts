import { createFishingGame } from "./lib/fishing";
import type { FishingGameInstance } from "./lib/fishing";
import { TEXT } from "./lib/fishing/texts";

declare global {
  interface Window {
    /** Debug handle for the standalone demo page only. */
    __fishing?: FishingGameInstance;
  }
}

const host = document.getElementById("game");
const splash = document.getElementById("boot-splash");

document.title = TEXT.page.title;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute("content", TEXT.page.description);

/**
 * The splash is plain HTML painted before any script, so it is the first thing
 * on screen and does not wait for Pixi, the font or the assets. It leaves once
 * the menu exists; on failure it stays with the error state instead of a
 * forever-loading bar.
 */
function dismissSplash(failed = false): void {
  if (!splash) return;
  splash.dataset.state = failed ? "error" : "done";
  if (failed) {
    splash.querySelector(".boot-note")?.replaceChildren("не удалось загрузить");
    return;
  }
  window.setTimeout(() => splash.remove(), 280);
}

if (host) {
  void createFishingGame({
    container: host,
    storagePrefix: "quiet-cove",
    onCatch: (event) => {
      console.info(
        `[quiet-cove] caught ${event.fishId} (${event.weightKg.toFixed(2)} kg)` +
          `${event.firstCatch ? " — new species!" : ""}`,
      );
    },
  })
    .then((game) => {
      window.__fishing = game;
      dismissSplash();
    })
    .catch((error: unknown) => {
      console.error("[quiet-cove] failed to start", error);
      dismissSplash(true);
    });
} else {
  dismissSplash(true);
}
