/**
 * Copies the third-party art we use into `public/assets/fishing` and prepares
 * the self-hosted pixel font. The original packs are NOT committed to git
 * (see .gitignore), so this script is the single source of truth for the
 * runtime asset folder.
 *
 * Usage: pnpm assets
 */
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "public", "assets", "fishing");

const tinyCoast = join(root, "assetspacks", "Tiny Coast Pack");
const critters = join(
  root,
  "assetspacks",
  "Critters of Yonder - Gone Fishing",
  "Freshwater Fish",
);
const fontFiles = join(
  root,
  "node_modules",
  "@fontsource-variable",
  "handjet",
  "files",
);

/** @type {Array<[string, string]>} source → destination (relative to out) */
const files = [
  [
    join(tinyCoast, "Characters", "char1_fishingrod_animation_32x32.png"),
    "angler.png",
  ],
  [join(tinyCoast, "Water", "water_misc_16x16.png"), "water-misc.png"],
  [
    join(tinyCoast, "Tiny Adventure Pack", "Other", "Misc", "Chest.png"),
    "chest.png",
  ],
  [
    join(tinyCoast, "Tiny Adventure Pack", "Other", "Misc", "Tree", "Tree.png"),
    "tree.png",
  ],
  [
    join(tinyCoast, "Tiny Adventure Pack", "Other", "Misc", "Bush.png"),
    "bush.png",
  ],
  [
    join(tinyCoast, "Tiny Adventure Pack", "Other", "Misc", "Rock.png"),
    "rock.png",
  ],
  [
    join(fontFiles, "handjet-latin-wght-normal.woff2"),
    "fonts/handjet-latin.woff2",
  ],
  [
    join(fontFiles, "handjet-latin-ext-wght-normal.woff2"),
    "fonts/handjet-latin-ext.woff2",
  ],
  [
    join(fontFiles, "handjet-cyrillic-wght-normal.woff2"),
    "fonts/handjet-cyrillic.woff2",
  ],
  [
    join(fontFiles, "handjet-cyrillic-ext-wght-normal.woff2"),
    "fonts/handjet-cyrillic-ext.woff2",
  ],
];

const fish = [
  "Minnow",
  "Perch",
  "Bluegill",
  "Carp",
  "Chub",
  "Pike",
  "Walleye",
  "Catfish",
  "Salmon",
  "Koi",
  "Sturgeon",
];

for (const name of fish) {
  files.push([join(critters, `${name}.png`), `fish/${name.toLowerCase()}.png`]);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(tinyCoast)) || !(await exists(critters))) {
  console.error(
    [
      "Missing asset packs.",
      "",
      "Put the downloaded packs here:",
      `  ${tinyCoast}`,
      `  ${join(root, "assetspacks", "Critters of Yonder - Gone Fishing")}`,
      "",
      "Downloads:",
      "  https://vryell.itch.io/tiny-coast-pack",
      "  https://ajiyuu.itch.io/critters-of-yonder-gone-fishing",
    ].join("\n"),
  );
  process.exit(1);
}

await rm(out, { recursive: true, force: true });

let copied = 0;
for (const [src, dest] of files) {
  if (!(await exists(src))) {
    console.warn(`skip (not found): ${src}`);
    continue;
  }
  const target = join(out, dest);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(src, target);
  copied += 1;
}

console.log(`Copied ${copied}/${files.length} files to public/assets/fishing`);

const faviconSource = join(critters, "Minnow.png");
if (await exists(faviconSource)) {
  await copyFile(faviconSource, join(root, "public", "favicon.png"));
}
