import { Assets, Rectangle, Texture } from "pixi.js";
import { FISH } from "./config";
import { FONT_OPTIONS, currentFont } from "./fonts";
import { HELP_PAGES, TEXT } from "./texts";
import type { HelpPageId } from "./texts";
import { loadCursorTextures, type CursorTextures } from "./cursors";
import treeAUrl from "../../assets/fishing/tree-a.png";
import treeBUrl from "../../assets/fishing/tree-b.png";
import treeCUrl from "../../assets/fishing/tree-c.png";
import bushAUrl from "../../assets/fishing/bush-a.png";
import rockAUrl from "../../assets/fishing/rock-a.png";
import rockBUrl from "../../assets/fishing/rock-b.png";
import helpCastUrl from "../../assets/help/cast.webp";
import helpFightUrl from "../../assets/help/fight.webp";
import helpCounterUrl from "../../assets/help/counter.webp";
import helpLandUrl from "../../assets/help/land.webp";

export interface AssetBag {
  base: string;
  fontLoaded: boolean;
  /** 4x4 character sheet, row-major, 32px frames. */
  angler: Texture[];
  trees: Texture[];
  bushes: Texture[];
  rocks: Texture[];
  sign: Texture;
  rod: Texture;
  /** 8×4 sheet of 64px rowboat variants. */
  boat: Texture[];
  fish: Record<string, Texture>;
  cursors: CursorTextures;
}

/**
 * Help screenshots are 96 KB of WebP for four pages that are only visible
 * behind the «Как играть» screen. They are loaded on demand (and warmed up
 * while the menu is idle) instead of sitting on the boot path.
 */
const HELP_URLS: Record<HelpPageId, string> = {
  cast: helpCastUrl,
  fight: helpFightUrl,
  counter: helpCounterUrl,
  land: helpLandUrl,
};

const helpTextures = new Map<HelpPageId, Texture>();

/** Loads one help page, cached for the session. */
export async function loadHelpTexture(page: HelpPageId): Promise<Texture> {
  const cached = helpTextures.get(page);
  if (cached) return cached;
  try {
    const texture = await Assets.load<Texture>(HELP_URLS[page]);
    helpTextures.set(page, texture);
    return texture;
  } catch (error) {
    console.warn(`[fishing] missing help page ${page}`, error);
    return Texture.WHITE;
  }
}

/** Warms the whole help set during idle time, never on the boot path. */
export function prefetchHelpPages(): Promise<Texture[]> {
  return Promise.all(HELP_PAGES.map((page) => loadHelpTexture(page.id)));
}

async function loadFonts(base: string): Promise<boolean> {
  await Promise.allSettled(
    FONT_OPTIONS.flatMap((option) =>
      option.faces.map(async (face) => {
        const font = new FontFace(
          option.family,
          `url("${base}/fonts/${face.file}") format("${face.format}")`,
          {
            weight: face.weight ?? "400",
            style: "normal",
            display: "block",
            unicodeRange: face.unicodeRange,
          },
        );
        await font.load();
        document.fonts.add(font);
      }),
    ),
  );
  await document.fonts.ready;
  return document.fonts.check(`16px "${currentFont().family}"`);
}

function frame(
  sheet: Texture,
  x: number,
  y: number,
  width: number,
  height: number,
): Texture {
  return new Texture({
    source: sheet.source,
    frame: new Rectangle(x, y, width, height),
  });
}

type FallbackKind = "fish" | "person" | "plant" | "rock";

function fallbackTexture(
  color: number,
  size: number,
  kind: FallbackKind,
): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;
  const hex = `#${color.toString(16).padStart(6, "0")}`;
  const dark = `#${Math.max(0, color - 0x2a2a2a)
    .toString(16)
    .padStart(6, "0")}`;
  ctx.imageSmoothingEnabled = false;
  const px = Math.max(1, Math.floor(size / 16));
  const rect = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x * px, y * px, w * px, h * px);
  };
  if (kind === "fish") {
    rect(4, 5, 8, 6, hex);
    rect(3, 6, 1, 4, dark);
    rect(1, 5, 3, 2, dark);
    rect(1, 9, 3, 2, dark);
    rect(9, 6, 1, 1, "#f5ffe8");
    rect(6, 3, 4, 1, dark);
  } else if (kind === "person") {
    rect(11, 3, 10, 9, "#ffae70");
    rect(10, 2, 12, 3, "#2b2b45");
    rect(9, 11, 14, 13, "#e64539");
    rect(12, 24, 3, 6, "#2b2b45");
    rect(17, 24, 3, 6, "#2b2b45");
    rect(20, 0, 1, 20, "#ab5130");
  } else if (kind === "plant") {
    rect(5, 13, 6, 3, dark);
    rect(6, 6, 4, 8, hex);
    rect(2, 9, 4, 5, dark);
    rect(10, 8, 4, 6, dark);
    rect(4, 3, 8, 5, hex);
  } else if (kind === "rock") {
    rect(3, 7, 10, 7, hex);
    rect(5, 5, 6, 3, hex);
    rect(3, 12, 10, 2, dark);
  }
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}

export async function loadGameAssets(
  base: string,
  onProgress: (progress: number, label: string) => void,
): Promise<AssetBag> {
  onProgress(0.02, TEXT.boot.font);

  const fishList = FISH.map((fish) => ({
    id: fish.id,
    url: `${base}/fish/${fish.id}.png`,
    tint: fish.tint,
  }));

  const textureEntries: Array<{
    key: string;
    url: string;
    fallback: () => Texture;
  }> = [
    {
      key: "angler",
      url: `${base}/angler.png`,
      fallback: () => fallbackTexture(0xe64539, 32, "person"),
    },
    {
      key: "tree-a",
      url: treeAUrl,
      fallback: () => fallbackTexture(0x63ab3f, 48, "plant"),
    },
    {
      key: "tree-b",
      url: treeBUrl,
      fallback: () => fallbackTexture(0x63ab3f, 48, "plant"),
    },
    {
      key: "tree-c",
      url: treeCUrl,
      fallback: () => fallbackTexture(0x63ab3f, 48, "plant"),
    },
    {
      key: "bush-a",
      url: bushAUrl,
      fallback: () => fallbackTexture(0x3b7d4f, 16, "plant"),
    },
    {
      key: "rock-a",
      url: rockAUrl,
      fallback: () => fallbackTexture(0x686f99, 16, "rock"),
    },
    {
      key: "rock-b",
      url: rockBUrl,
      fallback: () => fallbackTexture(0x686f99, 16, "rock"),
    },
    {
      key: "sign",
      url: `${base}/sign.png`,
      fallback: () => fallbackTexture(0xcf752b, 16, "rock"),
    },
    {
      key: "boat",
      url: `${base}/boat.png`,
      fallback: () => fallbackTexture(0x4c6885, 64, "rock"),
    },
    {
      key: "fishing-rod",
      url: `${base}/fishing-rod.png`,
      fallback: () => fallbackTexture(0xab5130, 16, "rock"),
    },
    ...fishList.map((fish) => ({
      key: `fish:${fish.id}`,
      url: fish.url,
      fallback: () => fallbackTexture(fish.tint, 16, "fish"),
    })),
  ];

  // Fonts and textures are independent: start both now. Awaiting the font
  // first used to put a 230 KB TTF in front of every other request.
  const fontPromise = loadFonts(base);
  const loaded = new Map<string, Texture>();
  let done = 0;

  // The loader walked this list one `await` at a time. Every texture is tiny,
  // so the cost was pure latency: on a 150 ms-RTT phone the ~50 files meant
  // seconds of dead waiting. A small pool keeps the worker busy without
  // flooding it, and the progress bar still advances once per file.
  await mapLimit(textureEntries, LOAD_CONCURRENCY, async (entry) => {
    try {
      const texture = await Assets.load<Texture>(entry.url);
      // Every sprite in the game is pixel art, and the world is scaled up to
      // the host size (2.5× at 1200×675) on top of the per-sprite scales.
      // Pixi samples textures linearly by default, which turns those few
      // texels into a soft mush; nearest keeps the pixels square.
      texture.source.scaleMode = "nearest";
      loaded.set(entry.key, texture);
    } catch (error) {
      console.warn(`[fishing] missing texture ${entry.url}`, error);
      loaded.set(entry.key, entry.fallback());
    }
    done += 1;
    onProgress(0.05 + (done / textureEntries.length) * 0.95, TEXT.boot.loading);
  });

  const fontLoaded = await fontPromise;

  const anglerSheet = loaded.get("angler") ?? Texture.WHITE;
  const angler: Texture[] = [];
  if (anglerSheet.width >= 128 && anglerSheet.height >= 128) {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        angler.push(frame(anglerSheet, col * 32, row * 32, 32, 32));
      }
    }
  } else {
    for (let index = 0; index < 16; index += 1) angler.push(anglerSheet);
  }

  const fish: Record<string, Texture> = {};
  for (const fishItem of fishList) {
    fish[fishItem.id] = loaded.get(`fish:${fishItem.id}`) ?? Texture.WHITE;
  }

  const boatSheet = loaded.get("boat") ?? Texture.WHITE;
  const boat: Texture[] = [];
  if (boatSheet.width >= 64 && boatSheet.height >= 64) {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        boat.push(frame(boatSheet, col * 64, row * 64, 64, 64));
      }
    }
  } else {
    boat.push(boatSheet);
  }

  const rodSheet = loaded.get("fishing-rod") ?? Texture.WHITE;
  const rod = rodSheet.width >= 16 ? frame(rodSheet, 0, 0, 16, 16) : rodSheet;

  const cursors = await loadCursorTextures();
  onProgress(1, TEXT.boot.loading);

  return {
    base,
    fontLoaded,
    angler,
    trees: [
      loaded.get("tree-a") ?? Texture.WHITE,
      loaded.get("tree-b") ?? Texture.WHITE,
      loaded.get("tree-c") ?? Texture.WHITE,
    ],
    bushes: [loaded.get("bush-a") ?? Texture.WHITE],
    rocks: [
      loaded.get("rock-a") ?? Texture.WHITE,
      loaded.get("rock-b") ?? Texture.WHITE,
    ],
    sign: loaded.get("sign") ?? Texture.WHITE,
    rod,
    boat,
    fish,
    cursors,
  };
}

/** How many textures the loader keeps in flight at once. */
const LOAD_CONCURRENCY = 8;

/**
 * Runs `task` over `items` with at most `limit` promises in flight, preserving
 * the input order of the results. A bounded pool is enough here: the list is
 * small, and the point is only to overlap the per-file request latency.
 */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await task(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
