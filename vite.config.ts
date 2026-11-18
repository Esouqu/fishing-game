import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/** File the dev audio panel writes its tuned balance into. */
const MIX_FILE = fileURLToPath(
  new URL("./src/lib/fishing/audioMix.ts", import.meta.url),
);
const BLOCK_START = "// #region audio-mix";
const BLOCK_END = "// #endregion audio-mix";

/**
 * Dev-only endpoint for the in-game audio panel (`F2`).
 *
 * The panel cannot touch the filesystem, so it POSTs the generated
 * `AUDIO_MIX` block here and this middleware swaps it into `audioMix.ts`.
 * Vite then reloads the page with the tuned values baked into the code, which
 * is the difference between "I moved some sliders" and a committed mix.
 *
 * The plugin is `apply: "serve"`, so a production build never ships it.
 */
function audioMixWriter(): Plugin {
  return {
    name: "fishing-audio-mix",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__fishing/audio-mix", (request, response) => {
        const reply = (status: number, body: unknown): void => {
          response.statusCode = status;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(body));
        };

        if (request.method !== "POST") {
          reply(405, { ok: false, error: "POST only" });
          return;
        }

        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          try {
            const payload: unknown = JSON.parse(
              Buffer.concat(chunks).toString("utf8"),
            );
            const block =
              typeof payload === "object" &&
              payload !== null &&
              typeof (payload as { block?: unknown }).block === "string"
                ? (payload as { block: string }).block
                : "";
            if (!isMixBlock(block)) {
              throw new Error("payload does not contain an audio-mix block");
            }
            const current = readFileSync(MIX_FILE, "utf8");
            writeFileSync(MIX_FILE, replaceMixBlock(current, block), "utf8");
            reply(200, { ok: true, file: "src/lib/fishing/audioMix.ts" });
          } catch (error) {
            reply(400, { ok: false, error: String(error) });
          }
        });
      });
    },
  };
}

/** True when `block` is one complete generated region. */
function isMixBlock(block: string): boolean {
  const start = block.indexOf(BLOCK_START);
  const end = block.indexOf(BLOCK_END);
  if (start !== 0 || end <= start) return false;
  return block.includes("export const AUDIO_MIX");
}

/** Swaps the region between the markers, keeping the rest of the file intact. */
function replaceMixBlock(source: string, block: string): string {
  const start = source.indexOf(BLOCK_START);
  const end = source.indexOf(BLOCK_END);
  if (start < 0 || end < start) {
    throw new Error(`${BLOCK_START} … ${BLOCK_END} markers are missing`);
  }
  const tail = source.slice(end + BLOCK_END.length).replace(/^\n+/, "\n\n");
  return `${source.slice(0, start)}${block.replace(/\s+$/, "")}\n${tail}`;
}

/**
 * File the zone tuner (`F8`) writes its shipped defaults into.
 *
 * Same idea as the audio mix: the panel is the only sane place to judge a feel,
 * so the values it lands on have to be able to become code. The file keeps a
 * marked region and the middleware swaps it; everything around it — the
 * interface, the helpers — stays untouched.
 */
const ZONE_FILE = fileURLToPath(
  new URL("./src/lib/fishing/game/fight/zoneTuning.ts", import.meta.url),
);
const ZONE_START = "// #region zone-mix";
const ZONE_END = "// #endregion zone-mix";

/** Dev-only endpoint for the zone tuner's «В КОД». */
function zoneTuningWriter(): Plugin {
  return {
    name: "fishing-zone-tuning",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__fishing/zone-mix", (request, response) => {
        const reply = (status: number, body: unknown): void => {
          response.statusCode = status;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(body));
        };

        if (request.method !== "POST") {
          reply(405, { ok: false, error: "POST only" });
          return;
        }

        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          try {
            const payload: unknown = JSON.parse(
              Buffer.concat(chunks).toString("utf8"),
            );
            const block =
              typeof payload === "object" &&
              payload !== null &&
              typeof (payload as { block?: unknown }).block === "string"
                ? (payload as { block: string }).block
                : "";
            if (!isZoneBlock(block)) {
              throw new Error("payload does not contain a zone-tuning block");
            }
            const current = readFileSync(ZONE_FILE, "utf8");
            writeFileSync(ZONE_FILE, replaceZoneBlock(current, block), "utf8");
            reply(200, {
              ok: true,
              file: "src/lib/fishing/game/fight/zoneTuning.ts",
            });
          } catch (error) {
            reply(400, { ok: false, error: String(error) });
          }
        });
      });
    },
  };
}

/** True when `block` is one complete defaults object, without the markers. */
function isZoneBlock(block: string): boolean {
  return (
    block.trimStart().startsWith("export const ZONE_DEFAULTS") &&
    block.includes("ZoneTuning") &&
    !block.includes(ZONE_START) &&
    !block.includes(ZONE_END)
  );
}

/** Swaps the region between the zone markers, keeping the rest of the file. */
function replaceZoneBlock(source: string, block: string): string {
  const start = source.indexOf(ZONE_START);
  const end = source.indexOf(ZONE_END);
  if (start < 0 || end < start) {
    throw new Error(`${ZONE_START} … ${ZONE_END} markers are missing`);
  }
  const body = block.replace(/\s+$/, "");
  const tail = source.slice(end + ZONE_END.length);
  return `${source.slice(0, start)}${ZONE_START}\n${body}\n${ZONE_END}${tail}`;
}

// https://vite.dev/config/
export default defineConfig({
  // Relative URLs keep the build working both at a custom domain root and at
  // https://<user>.github.io/<repo>/ without a hard-coded repository name.
  base: "./",
  plugins: [audioMixWriter(), zoneTuningWriter()],
  server: {
    port: 8080,
    open: false,
    watch: {
      // Browser profiles, sim builds and temporary verification files live in
      // the workspace; without this Vite reloads on every cache write. The
      // `.*.tmpdir` pattern is the atomic-save scratch folder editors create
      // next to a file; watching it made the dev server die with EBUSY.
      ignored: [
        "**/.tmp-esbuild/**",
        "**/.sim/**",
        "**/dist/**",
        "**/.*.tmpdir/**",
      ],
    },
  },
  build: {
    target: "es2020",
  },
});
