/**
 * Wrapper for `pnpm build`: typecheck, then a production Vite build.
 *
 * esbuild spills inputs larger than 1 MiB into a temp file in `os.tmpdir()`,
 * reads it and deletes it again. Inside a restricted sandbox that child process
 * may only touch the project folder, so the delete fails and `vite build` dies
 * with `remove C:\...\Temp\esbuild-...: Access is denied`. Pointing the temp
 * dir at `.tmp-esbuild/temp` (gitignored) keeps that handoff writable; outside
 * a sandbox the override is harmless.
 *
 * Usage: pnpm build
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = join(root, ".tmp-esbuild", "temp");
mkdirSync(temp, { recursive: true });

const env = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp };

const steps = [
  { bin: join(root, "node_modules", "typescript", "bin", "tsc"), args: [] },
  { bin: join(root, "node_modules", "vite", "bin", "vite.js"), args: ["build"] },
];

for (const step of steps) {
  if (!existsSync(step.bin)) {
    console.error(`[build] missing ${step.bin}; run \`pnpm install\` first.`);
    process.exit(1);
  }
  const code = await run(step.bin, step.args);
  if (code !== 0) process.exit(code);
}

/**
 * Runs one step to completion and resolves with its exit code.
 *
 * @param {string} bin
 * @param {string[]} args
 * @returns {Promise<number>}
 */
function run(bin, args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", (error) => {
      console.error(`[build] ${error.message}`);
      done(1);
    });
    child.on("exit", (code, signal) => done(signal ? 1 : (code ?? 1)));
  });
}
