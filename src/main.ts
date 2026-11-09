import { createFishingGame } from "./lib/fishing";
import type { FishingGameInstance } from "./lib/fishing";

declare global {
  interface Window {
    /** Debug handle for the standalone demo page only. */
    __fishing?: FishingGameInstance;
  }
}

const host = document.getElementById("game");

if (host) {
  void createFishingGame({
    container: host,
    storagePrefix: "quiet-cove",
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
