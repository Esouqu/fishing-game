import { Assets, Rectangle, Texture } from "pixi.js";
import { FISH, FONT_FAMILY } from "./config";

export interface AssetBag {
  base: string;
  fontLoaded: boolean;
  /** 4x4 character sheet, row-major, 32px frames. */
  angler: Texture[];
  chest: Texture[];
  tree: Texture;
  bush: Texture;
  rock: Texture;
  fish: Record<string, Texture>;
}

const FONT_FILES: Array<{ file: string; range: string }> = [
  {
    file: "latin",
    range:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
  {
    file: "latin-ext",
    range:
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF",
  },
  {
    file: "cyrillic",
    range: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
  },
  {
    file: "cyrillic-ext",
    range: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
  },
];

async function loadFont(base: string): Promise<boolean> {
  try {
    await Promise.all(
      FONT_FILES.map(async ({ file, range }) => {
        const face = new FontFace(
          FONT_FAMILY,
          `url("${base}/fonts/handjet-${file}.woff2") format("woff2")`,
          {
            weight: "100 900",
            style: "normal",
            display: "block",
            unicodeRange: range,
          },
        );
        await face.load();
        document.fonts.add(face);
      }),
    );
    await document.fonts.ready;
    return document.fonts.check(`16px "${FONT_FAMILY}"`);
  } catch (error) {
    console.warn("[fishing] font failed to load, using fallback", error);
    return false;
  }
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

type FallbackKind = "fish" | "person" | "plant" | "rock" | "chest";

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
  } else if (kind === "chest") {
    rect(2, 6, 12, 8, hex);
    rect(2, 4, 12, 3, dark);
    rect(7, 8, 2, 3, "#f0b541");
    rect(2, 6, 12, 1, "#ffee83");
  }
  return Texture.from(canvas);
}

export async function loadGameAssets(
  base: string,
  onProgress: (progress: number, label: string) => void,
): Promise<AssetBag> {
  onProgress(0.02, "ШРИФТ");
  const fontLoaded = await loadFont(base);

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
      key: "chest",
      url: `${base}/chest.png`,
      fallback: () => fallbackTexture(0xab5130, 16, "chest"),
    },
    {
      key: "tree",
      url: `${base}/tree.png`,
      fallback: () => fallbackTexture(0x63ab3f, 48, "plant"),
    },
    {
      key: "bush",
      url: `${base}/bush.png`,
      fallback: () => fallbackTexture(0x3b7d4f, 16, "plant"),
    },
    {
      key: "rock",
      url: `${base}/rock.png`,
      fallback: () => fallbackTexture(0x686f99, 16, "rock"),
    },
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
    onProgress(0.05 + (done / textureEntries.length) * 0.95, "ЗАГРУЗКА");
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

  const chestSheet = loaded.get("chest") ?? Texture.WHITE;
  const chest: Texture[] = [];
  if (chestSheet.width >= 96) {
    for (let i = 0; i < 6; i += 1)
      chest.push(frame(chestSheet, i * 16, 0, 16, 16));
  } else {
    chest.push(chestSheet);
  }

  const fish: Record<string, Texture> = {};
  for (const fishItem of fishList) {
    fish[fishItem.id] = loaded.get(`fish:${fishItem.id}`) ?? Texture.WHITE;
  }

  return {
    base,
    fontLoaded,
    angler,
    chest,
    tree: loaded.get("tree") ?? Texture.WHITE,
    bush: loaded.get("bush") ?? Texture.WHITE,
    rock: loaded.get("rock") ?? Texture.WHITE,
    fish,
  };
}
