# Credits

## Tiny Coast Pack

- Author: **Vryell** ([@Vryell](https://twitter.com/Vryell))
- Used for: angler sprite sheet, boat, sign and fishing rod (runtime art in `public/assets/fishing/`).
- License: free for commercial and non-commercial games and personal projects; modification allowed; credit is appreciated but not required.
- Restrictions: do not resell, repackage or redistribute the asset (even modified).
- The original pack is **not** included in this repository. Run `pnpm assets` with your own copy of `assetspacks/Tiny Coast Pack` to generate `public/assets/fishing`.

## Critters of Yonder — Gone Fishing

- Used for: all 40 freshwater and saltwater fish icons in the three-water-body roster (18 freshwater + 22 saltwater, including the shrimp).
- License: commercial and non-commercial games, personal projects and promotional materials; modification allowed; credit appreciated.
- Restrictions: do not resell, repackage or redistribute the asset (even modified); do not use it to train AI image generators; do not use it in logos, trademarks or service marks; do not include it in game-making tools or code templates; do not use it in crypto, NFT, p2e or meta projects.
- The original pack is **not** included in this repository. Run `pnpm assets` with your own copy of `assetspacks/Critters of Yonder - Gone Fishing` to generate `public/assets/fishing`.

## Stardew Valley sound effects

- Source: `assetspacks/stardew valley sounds` (sound effects and ambience from **Stardew Valley**, © ConcernedApe).
- Used for: UI clicks, cast/bite/reel/catch feedback and one ambience loop per water body.
- Rights remain with the author. These files are included only because the project owner supplied them; do not redistribute the audio separately from this project.

## Input Prompts Pixel

- Author: **Kenney** (<https://www.kenney.nl>), pack «Input Prompts Pixel» (1.0).
- Used for: the mouse-with-pressed-left-button pictogram beside the cast prompt (`src/assets/fishing/mouse-lmb.png`, taken from `Tiles/tile_0077.png` of the pack; only the outline pixels are recoloured to the interface ink `UI.ink`, so the badge sits in the UI's own 1 px line), and the close and fullscreen marks of the HUD (`tile_0016.png` and `tile_0023.png` in `public/assets/fishing/`, recoloured to `UI.ink`, `UI.primary` and `UI.periwinklePale`).
- License: Creative Commons Zero (CC0) — <http://creativecommons.org/publicdomain/zero/1.0/>.
- The original pack is **not** included in this repository.

## Tiny5

- Self-hosted as four woff2 subsets in `public/assets/fishing/fonts/` (`tiny5-latin`, `tiny5-latin-ext`, `tiny5-cyrillic`, `tiny5-cyrillic-ext`), split by `unicode-range` and loaded by `src/lib/fishing/fonts.ts`. The original single TTF was 230 KB on the boot path; the subsets are ~18 KB together.
- License: SIL Open Font License 1.1 (OFL), source: <https://fonts.google.com/specimen/Tiny5>.

## Other

- All game code, UI layout, procedural Web Audio effects and Russian copy were written for this project.
- The frost veil ships as `public/assets/ice-480.webp` (99 KB), baked from the original 2560×1440 cut-out in `assets-src/ice.png` by `scripts/bake-veil.mjs`; the Canvas downscale keeps the alpha silhouette bit-for-bit, and `src/lib/fishing/ui/IceVeil.ts` only re-shapes the alpha at runtime.
- The winter trees and bush in `src/assets/fishing/` are procedurally generated pixel art. `scripts/make-nature-assets.py` rebuilds the bush from the project's earlier procedural sprite (kept in `scripts/nature-originals/`) with a restored crown and a snow cap; `scripts/make-spruce-assets.py` draws the two trees from scratch. Shore stones are painted at runtime (`drawShoreStone`), so they have no sprite files.
- The DTF article “13 базовых принципов геймдизайна” was used as a design reference; no text from the article is reproduced.
