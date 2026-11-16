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

document.title = TEXT.page.title;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute("content", TEXT.page.description);

/** Last-resort message when the game cannot start at all. */
function showBootError(): void {
  const box = document.createElement("div");
  box.textContent = "НЕ УДАЛОСЬ ЗАГРУЗИТЬ";
  box.setAttribute("role", "alert");
  box.style.cssText = [
    "position:fixed",
    "inset:0",
    "display:grid",
    "place-items:center",
    "padding:24px",
    "background:#141d33",
    "color:#eef2ff",
    "z-index:10",
    "text-align:center",
    "letter-spacing:0.18em",
    "font:700 clamp(18px,4vw,30px)/1.2 'Courier New', monospace",
  ].join(";");
  document.body.appendChild(box);
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
    })
    .catch((error: unknown) => {
      console.error("[quiet-cove] failed to start", error);
      showBootError();
    });
} else {
  showBootError();
}
