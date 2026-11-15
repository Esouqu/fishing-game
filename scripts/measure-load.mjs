#!/usr/bin/env node
/**
 * Cold-load timing for the built game: fresh Chrome profile, production URL.
 *
 * Usage:
 *   pnpm build && pnpm preview          # terminal 1
 *   node scripts/measure-load.mjs       # terminal 2
 *
 *   node scripts/measure-load.mjs http://localhost:4173/ \
 *     --throttle=fast3g --software --json
 *
 * Every run starts Chrome with a new `--user-data-dir`, so the disk cache is
 * empty: this is the first visit, not a reload. `ready` is the moment
 * `window.__fishing` exists, i.e. the menu has been mounted and the boot screen
 * has finished.
 *
 * Note on workers: Pixi loads textures in a web worker, and those requests are
 * invisible both to `performance.getEntriesByType("resource")` and to CDP
 * network events. `--throttle` therefore underestimates the cost of the ~50
 * texture requests; `server-throttle` style pacing is the only way to include
 * them. The per-file bytes are still reported by the server's access layer when
 * that is needed.
 *
 * Requires Node 22+ (global WebSocket/fetch) and a local Chrome.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const json = args.includes("--json");
const software = args.includes("--software");
const throttle = args.find((arg) => arg.startsWith("--throttle="))?.split("=")[1] ?? "none";
const url = args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:4173/";

const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((path) => existsSync(path)) ?? "chrome";

const port = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), "fishing-load-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--window-size=1200,675",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-lcd-text",
    ...(software
      ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
      : ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]),
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

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

function connect(wsUrl, onEvent) {
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
      return;
    }
    if (message.method && onEvent) onEvent(message.method, message.params);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const messageId = ++id;
      pending.set(messageId, { done, fail });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  return { ready, send, close: () => ws.close() };
}

async function main() {
  const target = await pageTarget();
  const requests = new Map();
  const cdp = connect(target.webSocketDebuggerUrl, (method, params) => {
    if (method === "Network.requestWillBeSent") {
      requests.set(params.requestId, {
        url: params.request.url,
        type: params.type,
        start: params.timestamp,
      });
    } else if (method === "Network.loadingFinished") {
      const entry = requests.get(params.requestId);
      if (entry) {
        entry.end = params.timestamp;
        entry.bytes = params.encodedDataLength;
      }
    }
  });
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__longTasks = [];
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__longTasks.push({
              start: Math.round(entry.startTime),
              duration: Math.round(entry.duration),
            });
          }
        }).observe({ entryTypes: ["longtask"] });
      } catch {}
    `,
  });
  if (throttle !== "none") {
    const presets = {
      fast3g: {
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (0.75 * 1024 * 1024) / 8,
      },
      slow4g: {
        latency: 85,
        downloadThroughput: (4 * 1024 * 1024) / 8,
        uploadThroughput: (1.5 * 1024 * 1024) / 8,
      },
    };
    const preset = presets[throttle];
    if (!preset) throw new Error(`unknown throttle: ${throttle}`);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...preset });
  }

  await cdp.send("Page.navigate", { url });
  let ready = null;
  for (let attempt = 0; attempt < 1800; attempt += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify({ ready: Boolean(window.__fishing), now: Math.round(performance.now()) })`,
      returnByValue: true,
    });
    const value = JSON.parse(result.result.value);
    if (value.ready) {
      ready = value.now;
      break;
    }
    await sleep(50);
  }
  await sleep(600);

  const metrics = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      paints: performance.getEntriesByType("paint").map((p) => ({ name: p.name, at: Math.round(p.startTime) })),
      longTasks: window.__longTasks,
    })`,
    returnByValue: true,
  });
  const page = JSON.parse(metrics.result.value);

  const entries = [...requests.values()].filter((entry) => entry.url !== url);
  const totalBytes = entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
  const byType = {};
  for (const entry of entries) {
    byType[entry.type] = byType[entry.type] ?? { count: 0, bytes: 0 };
    byType[entry.type].count += 1;
    byType[entry.type].bytes += entry.bytes ?? 0;
  }
  const top = [...entries]
    .sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
    .slice(0, 5)
    .map((entry) => ({
      name: entry.url.split("/").pop(),
      bytes: entry.bytes ?? 0,
    }));

  const report = {
    url,
    mode: { throttle, software },
    readyMs: ready,
    fcpMs: page.paints.find((paint) => paint.name === "first-contentful-paint")?.at ?? null,
    longTasksMs: page.longTasks.reduce((sum, task) => sum + task.duration, 0),
    requests: entries.length,
    bytes: totalBytes,
    byType,
    top,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`cold load: ${url}`);
    console.log(`  mode            ${software ? "swiftshader" : "gpu"}, throttle ${throttle}`);
    console.log(`  first paint     ${report.fcpMs} ms`);
    console.log(`  game ready      ${report.readyMs} ms`);
    console.log(`  long tasks      ${report.longTasksMs} ms`);
    console.log(`  requests        ${report.requests}`);
    console.log(`  transfer        ${(report.bytes / 1024).toFixed(0)} KB`);
    for (const [type, stat] of Object.entries(report.byType)) {
      console.log(`    ${type.padEnd(12)} ${String(stat.count).padStart(3)} × ${(stat.bytes / 1024).toFixed(0)} KB`);
    }
    console.log("  largest:");
    for (const entry of report.top) {
      console.log(`    ${(entry.bytes / 1024).toFixed(0).padStart(6)} KB  ${entry.name}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    chrome.kill();
    // Chrome may still hold a lock on the profile for a moment after SIGTERM;
    // the directory lives in the OS temp folder and is disposable either way.
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Best effort: a locked temp profile is not a measurement failure.
    }
  });
