import { TEXT } from "./texts";
import { mixSource, type AudioMix } from "./audioMix";

/**
 * Getting a tuned balance out of the browser and back into the code.
 *
 * A dev server cannot be written to from a normal build, so there are three
 * paths and the panel picks the best one available:
 *
 * 1. `writeMixToSource` POSTs the mix to the Vite middleware configured in
 *    `vite.config.ts`, which replaces the generated block inside `audioMix.ts`.
 *    This is the real "save into code" path and ends with a page reload.
 * 2. The clipboard receives the same block, ready to paste over the region.
 * 3. A download of the block, for browsers that refuse clipboard access.
 */

/** Marker lines that delimit the generated block in `audioMix.ts`. */
const BLOCK_START = "// #region audio-mix";
const BLOCK_END = "// #endregion audio-mix";

/** Dev-server endpoint registered by the audio-mix Vite plugin. */
const ENDPOINT = `${import.meta.env.BASE_URL}__fishing/audio-mix`;

/** Writes the mix into `src/lib/fishing/audioMix.ts` through the dev server. */
export async function writeMixToSource(mix: AudioMix): Promise<boolean> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mix, block: mixSource(mix) }),
    });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { ok?: unknown }).ok === true
    );
  } catch {
    return false;
  }
}

/** Copies the generated block; false when the clipboard is unavailable. */
export async function copyMixSource(mix: AudioMix): Promise<boolean> {
  const text = mixSource(mix);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Saves the generated block as a file, the last-resort path. */
export function downloadMixSource(mix: AudioMix): void {
  const blob = new Blob([mixSource(mix)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "audio-mix.txt";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL dies.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Copy with a download fallback; returns the panel's status line. */
export async function copyOrDownloadMix(mix: AudioMix): Promise<string> {
  if (await copyMixSource(mix)) return TEXT.devtools.copied;
  downloadMixSource(mix);
  return TEXT.devtools.copyFailed;
}

/** Save to code with a download fallback; returns the panel's status line. */
export async function saveOrDownloadMix(mix: AudioMix): Promise<string> {
  if (await writeMixToSource(mix)) return TEXT.devtools.savedToCode;
  downloadMixSource(mix);
  return TEXT.devtools.savedToFile;
}

/** True when a block looks like a complete generated region. */
export function isMixBlock(text: string): boolean {
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END);
  return start >= 0 && end > start && text.includes("AUDIO_MIX");
}
