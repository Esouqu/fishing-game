export interface FontFaceDef {
  file: string;
  format: "woff2" | "truetype";
  weight?: string;
  unicodeRange?: string;
}

export interface FontOption {
  id: string;
  family: string;
  scale: number;
  faces: readonly FontFaceDef[];
}

export const FONT_OPTIONS: readonly FontOption[] = [
  {
    id: "tiny5",
    family: "Tiny5",
    scale: 1,
    faces: [
      {
        file: "tiny5.ttf",
        format: "truetype",
        weight: "400",
      },
    ],
  },
];

export function currentFont(): FontOption {
  return FONT_OPTIONS[0];
}

export function currentFontStack(): string {
  return `"${currentFont().family}", "Courier New", monospace`;
}

export function currentFontScale(): number {
  return currentFont().scale;
}
