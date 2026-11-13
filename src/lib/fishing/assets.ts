import { Assets, Rectangle, Texture } from "pixi.js";
import { FISH } from "./config";
import { FONT_OPTIONS, currentFont } from "./fonts";
import { TEXT } from "./texts";
import type { HelpPageId } from "./texts";
import { loadCursorTextures, type CursorTextures } from "./cursors";
import treeAUrl from "../../assets/fishing/tree-a.png";
import treeBUrl from "../../assets/fishing/tree-b.png";
import bushAUrl from "../../assets/fishing/bush-a.png";
import rockAUrl from "../../assets/fishing/rock-a.png";
import rockBUrl from "../../assets/fishing/rock-b.png";
import bucketUrl from "../../assets/fishing/bucket.png";
import helpCastUrl from "../../assets/help/cast.png";
import helpFightUrl from "../../assets/help/fight.png";
import helpCounterUrl from "../../assets/help/counter.png";
import helpLandUrl from "../../assets/help/land.png";

export interface AssetBag {
  base: string;
  fontLoaded: boolean;
  /** 4x4 character sheet, row-major, 32px frames. */
  angler: Texture[];
  trees: Texture[];
  bushes: Texture[];
  rocks: Texture[];
  bucket: Texture;
  fish: Record<string, Texture>;
  help: Record<HelpPageId, Texture>;
  cursors: CursorTextures;
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
  return Texture.from(canvas);
}

export async function loadGameAssets(
  base: string,
  onProgress: (progress: number, label: string) => void,
): Promise<AssetBag> {
  onProgress(0.02, TEXT.boot.font);
  const fontLoaded = await loadFonts(base);

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
      key: "bucket",
      url: bucketUrl,
      fallback: () => fallbackTexture(0x4c6885, 16, "rock"),
    },
    { key: "help:cast", url: helpCastUrl, fallback: () => Texture.WHITE },
    { key: "help:fight", url: helpFightUrl, fallback: () => Texture.WHITE },
    { key: "help:counter", url: helpCounterUrl, fallback: () => Texture.WHITE },
    { key: "help:land", url: helpLandUrl, fallback: () => Texture.WHITE },
    ...fishList.map((fish) => ({
      key: `fish:${fish.id}`,
      url: fish.url,
      fallback: () => fallbackTexture(fish.tint, 16, "fish"),
    })),
  ];

  const loaded = new Map<string, Texture>();
  let done = 0;
  for (const entry of textureEntries) {
    try {
      const texture = await Assets.load<Texture>(entry.url);
      loaded.set(entry.key, texture);
    } catch (error) {
      console.warn(`[fishing] missing texture ${entry.url}`, error);
      loaded.set(entry.key, entry.fallback());
    }
    done += 1;
    onProgress(0.05 + (done / textureEntries.length) * 0.95, TEXT.boot.loading);
  }

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

  const cursors = await loadCursorTextures();
  onProgress(1, TEXT.boot.loading);

  return {
    base,
    fontLoaded,
    angler,
    trees: [
      loaded.get("tree-a") ?? Texture.WHITE,
      loaded.get("tree-b") ?? Texture.WHITE,
    ],
    bushes: [loaded.get("bush-a") ?? Texture.WHITE],
    rocks: [
      loaded.get("rock-a") ?? Texture.WHITE,
      loaded.get("rock-b") ?? Texture.WHITE,
    ],
    bucket: loaded.get("bucket") ?? Texture.WHITE,
    fish,
    help: {
      cast: loaded.get("help:cast") ?? Texture.WHITE,
      fight: loaded.get("help:fight") ?? Texture.WHITE,
      counter: loaded.get("help:counter") ?? Texture.WHITE,
      land: loaded.get("help:land") ?? Texture.WHITE,
    },
    cursors,
  };
}
