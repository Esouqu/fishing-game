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

// Stand-in for the host application's player store. In a real embed, pass the
// signed-in nickname here and it will be saved with every session result.
const playerName = TEXT.common.playerFallback;

document.title = TEXT.page.title;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute("content", TEXT.page.description);

if (host) {
  void createFishingGame({
    container: host,
    storagePrefix: "quiet-cove",
    playerName,
    onScore: (result) => {
      console.info(
        `[quiet-cove] session finished: ${result.score} points, ${result.caught}/${result.casts} fish`,
      );
    },
  })
    .then((game) => {
      window.__fishing = game;
    })
    .catch((error: unknown) => {
      console.error("[quiet-cove] failed to start", error);
    });
}
