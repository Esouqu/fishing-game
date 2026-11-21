import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const publicDir = join(root, "public");
const assetsDir = join(publicDir, "assets");
const fishingDir = join(assetsDir, "fishing");
const fishDir = join(fishingDir, "fish");
const soundsDir = join(fishingDir, "sounds");
const cursorsDir = join(assetsDir, "cursors");

const required = [
  join(assetsDir, "ice-480.webp"),
  join(fishingDir, "angler.png"),
  join(fishingDir, "boat.png"),
  join(fishingDir, "sign.png"),
  join(fishingDir, "tree-a.png"),
  join(fishingDir, "tree-b.png"),
  join(fishingDir, "tree-c.png"),
  join(fishingDir, "bush-a.png"),
  join(fishingDir, "mouse-lmb.png"),
  join(fishingDir, "rod-sheet.png"),
  join(fishingDir, "baits-sheet.png"),
  join(fishingDir, "pearls-sheet.png"),
  join(fishingDir, "tile_0016.png"),
  join(fishingDir, "tile_0023.png"),
  join(fishingDir, "cast.webp"),
  join(fishingDir, "fight.webp"),
  join(fishingDir, "counter.webp"),
  join(fishingDir, "land.webp"),
  join(fishingDir, "touch", "cast.webp"),
  join(fishingDir, "touch", "fight.webp"),
  join(fishingDir, "touch", "counter.webp"),
  join(fishingDir, "touch", "land.webp"),
  join(fishingDir, "sounds", "cast.wav"),
  join(fishingDir, "sounds", "bite.wav"),
  join(fishingDir, "sounds", "fish-hit.wav"),
  join(fishingDir, "sounds", "amb-frost.wav"),
  join(fishingDir, "fonts", "tiny5-cyrillic.woff2"),
  join(fishingDir, "fonts", "tiny5-cyrillic-ext.woff2"),
  join(fishingDir, "fonts", "tiny5-latin.woff2"),
  join(fishingDir, "fonts", "tiny5-latin-ext.woff2"),
  join(root, "src", "assets", "help", "cast.webp"),
  join(root, "src", "assets", "help", "fight.webp"),
  join(root, "src", "assets", "help", "counter.webp"),
  join(root, "src", "assets", "help", "land.webp"),
  join(publicDir, "favicon.png"),
  join(cursorsDir, "tile_0026-15x.png"),
  join(cursorsDir, "tile_0134-15x.png"),
  join(cursorsDir, "tile_0135-15x.png"),
  join(cursorsDir, "tile_0136-15x.png"),
  join(cursorsDir, "crosshair-000.png"),
];

const missing = required.filter((path) => !existsSync(path));
if (existsSync(fishDir)) {
  const fish = readdirSync(fishDir).filter((name) => name.endsWith(".png"));
  if (fish.length < 40) {
    missing.push(`${fishDir} (found ${fish.length} of 40 fish PNGs)`);
  }
} else {
  missing.push(fishDir);
}

// 24 after the perfect-catch fanfare and its jingle left the game; every WAV
// the sound catalog names has to be here.
const SOUND_COUNT = 24;

if (existsSync(soundsDir)) {
  const sounds = readdirSync(soundsDir).filter((name) => name.endsWith(".wav"));
  if (sounds.length < SOUND_COUNT) {
    missing.push(`${soundsDir} (found ${sounds.length} of ${SOUND_COUNT} WAVs)`);
  }
} else {
  missing.push(soundsDir);
}

if (missing.length > 0) {
  console.error("\n[pages] Deploy assets are missing:\n");
  for (const path of missing) {
    console.error(`  - ${path}`);
  }
  console.error(
    [
      "",
      "The third-party art packs are intentionally not committed to git.",
      "Run `pnpm assets` with your local `assetspacks/`, or provide the",
      "generated `public/assets/fishing/`, `public/assets/cursors/` and",
      "`public/favicon.png` files in the build checkout.",
      "",
      "For a public GitHub Pages site, check the licenses in CREDITS.md",
      "before publishing those files.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("[pages] All deploy assets are present.");
