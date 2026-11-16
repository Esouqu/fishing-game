/**
 * Copies the third-party art we use into `public/assets/fishing`. The original
 * packs are NOT committed to git (see .gitignore), so this script is the
 * single source of truth for the runtime art folder. Fonts are not copied: the
 * game loads only the hand-placed woff2 subsets of Tiny5.
 *
 * Sounds are copied as the pack's WAVs and then squeezed by
 * `scripts/squeeze-audio.mjs` (see the `assets` script in package.json).
 *
 * Usage: pnpm assets
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "public", "assets", "fishing");

const tinyCoast = join(root, "assetspacks", "Tiny Coast Pack");
const crittersRoot = join(
  root,
  "assetspacks",
  "Critters of Yonder - Gone Fishing",
);
const critters = join(crittersRoot, "Freshwater Fish");

/**
 * Only art that is addressed by a runtime URL lives here. Single-use images
 * (winter trees, bushes, help pages) are imported from `src/assets/` instead,
 * so the bundler can hash or inline them.
 *
 * @type {Array<[string, string]>} source → destination (relative to out)
 */
const files = [
  // char2 is the angler: same 4×4 / 32 px sheet as the rest of the pack, so the
  // pose frames and rod-tip offsets in `ANGLER_POSES` stay valid.
  [
    join(tinyCoast, "Characters", "char2_fishingrod_animation_32x32.png"),
    "angler.png",
  ],
  [
    join(tinyCoast, "Tiny Adventure Pack", "Other", "Misc", "Sign.png"),
    "sign.png",
  ],
  [join(tinyCoast, "Boat", "boat_base_64x64.png"), "boat.png"],
];

/**
 * Every species in "Critters of Yonder - Gone Fishing": all 18 freshwater
 * icons and all 22 saltwater icons. The destination name is the lowercased
 * source name, which is also the fish id used by the game data.
 */
const fish = [
  ["Freshwater Fish", "Angelfish"],
  ["Freshwater Fish", "Bluegill"],
  ["Freshwater Fish", "Carp"],
  ["Freshwater Fish", "Catfish"],
  ["Freshwater Fish", "Chub"],
  ["Freshwater Fish", "Koi"],
  ["Freshwater Fish", "LargemouthBass"],
  ["Freshwater Fish", "Minnow"],
  ["Freshwater Fish", "Mudskipper"],
  ["Freshwater Fish", "Perch"],
  ["Freshwater Fish", "Pike"],
  ["Freshwater Fish", "RainbowTrout"],
  ["Freshwater Fish", "Salmon"],
  ["Freshwater Fish", "SmallmouthBass"],
  ["Freshwater Fish", "Sturgeon"],
  ["Freshwater Fish", "Tigerfish"],
  ["Freshwater Fish", "Tilapia"],
  ["Freshwater Fish", "Walleye"],
  ["Saltwater Fish", "Anchovy"],
  ["Saltwater Fish", "Barracuda"],
  ["Saltwater Fish", "ButterflyFish"],
  ["Saltwater Fish", "Capelin"],
  ["Saltwater Fish", "Clownfish"],
  ["Saltwater Fish", "Cod"],
  ["Saltwater Fish", "Eel"],
  ["Saltwater Fish", "Flounder"],
  ["Saltwater Fish", "Grouper"],
  ["Saltwater Fish", "Haddock"],
  ["Saltwater Fish", "Halibut"],
  ["Saltwater Fish", "Lionfish"],
  ["Saltwater Fish", "Mackerel"],
  ["Saltwater Fish", "Marlin"],
  ["Saltwater Fish", "Oarfish"],
  ["Saltwater Fish", "OceanSunfish"],
  ["Saltwater Fish", "RedSnapper"],
  ["Saltwater Fish", "Sardine"],
  ["Saltwater Fish", "Seabass"],
  ["Saltwater Fish", "Shrimp"],
  ["Saltwater Fish", "Swordfish"],
  ["Saltwater Fish", "Tuna"],
];

for (const [folder, name] of fish) {
  files.push([
    join(crittersRoot, folder, `${name}.png`),
    `fish/${name.toLowerCase()}.png`,
  ]);
}

const soundRoot = join(root, "assetspacks", "stardew valley sounds");

/**
 * Curated Stardew Valley cues: UI, fishing, fight feedback, one ambience loop
 * per water body and one per weather front. Flattened names keep the runtime
 * path predictable.
 *
 * Keep this list in step with `SOUND_FILES` in `audio/catalog.ts`: a cue that is copied
 * here but never played is dead weight in the repository (`pnpm assets` is the
 * only thing that puts files into `public/`, so an entry that is not needed at
 * runtime should not be here at all).
 */
const sounds = [
  ["Interface/smallSelect.wav", "select.wav"],
  ["Interface/button1.wav", "button.wav"],
  ["Interface/cancel.wav", "cancel.wav"],
  ["Interface/blips1.wav", "blip1.wav"],
  ["Miscellaneous/cast.wav", "cast.wav"],
  ["Miscellaneous/water_scoop1.wav", "water-scoop.wav"],
  ["Miscellaneous/bob.wav", "bob.wav"],
  ["Characters/fishBite.wav", "bite.wav"],
  // The strike that sets the hook: the pack's hit cue. The jingle that stood in
  // for it belonged to the catch fanfare, not to the rod answering a bite.
  ["Characters/FishHit.wav", "fish-hit.wav"],
  ["Characters/fishEscape.wav", "escape.wav"],
  ["Miscellaneous/slowReel.wav", "reel.wav"],
  ["Miscellaneous/water_lap2.wav", "water-lap.wav"],
  ["Interface/achievement.wav", "achievement.wav"],
  ["Miscellaneous/reward.wav", "reward.wav"],
  // Answered dash: the rod snapping the line taut. A quarter-second, very
  // bright swipe sits under the eye's "the pull connected" beat; the metallic
  // parry that used to play here read as a sword, not as a fishing rod.
  ["Miscellaneous/daggerswipe.wav", "line-snap.wav"],
  ["Miscellaneous/shiny4.wav", "shiny.wav"],
  ["Miscellaneous/crit.wav", "crit.wav"],
  // The perfect-catch jingle: a short reply that lands just after the fanfare.
  ["Miscellaneous/jingle1.wav", "jingle1.wav"],
  // The cast that lands in the luck zone: a short "objective complete" chime,
  // played over the throw instead of ticking while the meter crosses the band.
  ["Interface/objectiveComplete.wav", "objective-complete.wav"],
  ["Miscellaneous/thudStep.wav", "thud.wav"],
  ["Interface/newRecord.wav", "new-record.wav"],
  // Water beds, one per water body: the brook for the river, the pool's calm
  // laps for the lake and the open swell for the sea.
  ["Ambience/babbling_brook.wav", "amb-brook.wav"],
  ["Ambience/pool.wav", "amb-pool.wav"],
  ["Ambience/ocean.wav", "amb-ocean.wav"],
  // Weather beds: quiet winter air for a clear sky, wind for the fronts.
  ["Ambience/winter_day.wav", "amb-winter.wav"],
  ["Ambience/frost.wav", "amb-frost.wav"],
];

for (const [src, dest] of sounds) {
  files.push([join(soundRoot, src), `sounds/${dest}`]);
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

// Do not wipe the destination: it also holds the self-hosted pixel font
// (`tiny5.ttf`), which is not part of the downloaded art packs. Copying over
// the managed files keeps that font and any other hand-placed extras intact.
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
