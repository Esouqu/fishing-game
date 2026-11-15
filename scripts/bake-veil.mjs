#!/usr/bin/env node
/**
 * Bakes the frost-veil texture from the original source art.
 *
 * The source is a 2560×1440 cut-out PNG (`assets-src/ice.png`, 1.55 MB) that the
 * game only ever needs at 480×270: the veil is drawn at that size and upscaled
 * with the rest of the pixel art. Shipping the photo meant downloading 1.5 MB
 * for a ~100 KB texture.
 *
 * The resize has to happen in a browser: the original runtime drawing used
 * `ctx.drawImage` at exactly this size, and any other filter (Pillow's LANCZOS,
 * BICUBIC, …) produces a visibly different silhouette on the cut-out edges.
 * Chrome also does the WebP encode, and WebP keeps the alpha lossless, so the
 * shape of the frost is preserved bit for bit. The runtime keeps applying the
 * edge fade to the alpha, so tuning `FEATHER`/`BASE` in `IceVeil.ts` still does
 * not need a re-bake — only replacing the source art does.
 *
 * Usage:
 *   node scripts/bake-veil.mjs [--quality=0.92]
 *
 * Requires Node 22+ (global WebSocket/fetch) and a local Chrome.
 */
import { spawn } from "node:child_process";
import {
  createServer,
} from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const SOURCE = join(root, "assets-src", "ice.png");
const OUTPUT = join(root, "public", "assets", "ice-480.webp");
const QUALITY = Number(
  process.argv.find((arg) => arg.startsWith("--quality="))?.split("=")[1] ?? 0.92,
);
const SIZE = 480;

if (!existsSync(SOURCE)) {
  console.error(`[veil] missing source art: ${SOURCE}`);
  process.exit(1);
}

const MIME = { ".png": "image/png", ".html": "text/html" };
const server = createServer((request, response) => {
  const url = decodeURIComponent((request.url ?? "/").split("?")[0]);
  if (url === "/bake") {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><meta charset="utf-8"><script>
      (async () => {
        const image = new Image();
        image.src = ${JSON.stringify("/assets-src/ice.png")};
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = ${SIZE};
        canvas.height = ${Math.round((SIZE * 9) / 16)};
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        window.__veil = canvas.toDataURL("image/webp", ${QUALITY});
      })().catch((error) => {
        window.__veil = "error: " + error;
      });
    <\/script>`);
    return;
  }
  const file = join(root, normalize(url));
  if (!existsSync(file)) {
    response.statusCode = 404;
    response.end("not found");
    return;
  }
  response.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
  response.end(readFileSync(file));
});

await new Promise((done) => server.listen(4310, "127.0.0.1", done));

const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((path) => existsSync(path)) ??
  "chrome";

const port = 9500 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), "veil-bake-"));
const child = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "http://127.0.0.1:4310/bake",
  ],
  { stdio: "ignore", windowsHide: true },
);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

try {
  const target = await pageTarget();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Runtime.enable");
  let dataUrl = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "window.__veil ?? null",
      returnByValue: true,
    });
    dataUrl = result.result.value;
    if (typeof dataUrl === "string") break;
    await sleep(100);
  }
  cdp.close();
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/webp")) {
    throw new Error(String(dataUrl));
  }
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(OUTPUT, bytes);
  console.log(
    `[veil] ${OUTPUT.replace(root, ".")}: ${(bytes.length / 1024).toFixed(1)} KB ` +
      `(source ${(readFileSync(SOURCE).length / 1024 / 1024).toFixed(2)} MB)`,
  );
} finally {
  child.kill();
  server.close();
}

async function pageTarget() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Chrome is still starting.
    }
    await sleep(120);
  }
  throw new Error("no page target");
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { done, fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(JSON.stringify(message.error)));
      else done(message.result);
    }
  });
  const ready = new Promise((done, fail) => {
    ws.addEventListener("open", done);
    ws.addEventListener("error", fail);
  });
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const messageId = ++id;
      pending.set(messageId, { done, fail });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  return { ready, send, close: () => ws.close() };
}
