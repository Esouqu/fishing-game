import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const publicDir = join(root, "public");
const assetsDir = join(publicDir, "assets");
const fishingDir = join(assetsDir, "fishing");
const fishDir = join(fishingDir, "fish");
const cursorsDir = join(assetsDir, "cursors");

const required = [
  join(fishingDir, "angler.png"),
  join(fishingDir, "fonts", "tiny5.ttf"),
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
  if (fish.length < 20) {
    missing.push(`${fishDir} (found ${fish.length} of 20 fish PNGs)`);
  }
} else {
  missing.push(fishDir);
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
