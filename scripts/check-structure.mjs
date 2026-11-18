/**
 * Structural guard for the refactor:
 *  - no source module has grown unjustifiably large (reported, not enforced);
 *  - the obsolete `game/Scene.ts` shim stays deleted;
 *  - the generated audio-mix markers are intact;
 *  - no runtime import cycles (type-only imports ignored);
 *  - relative links in AGENTS.md and docs/ resolve.
 *
 * Size is a smell, not a rule. A file that has one honest job may be long; a
 * file that has three jobs is the one to split. The check therefore *reports*
 * modules over `BIG_FILE` so a reviewer sees them, and fails only on structure
 * that is actually wrong (a cycle, a broken link, a lost marker, a resurrected
 * shim).
 *
 * Usage: pnpm check:structure
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
/** Files past this size are listed at the end as worth a look, not as errors. */
const BIG_FILE = 500;
const problems = [];
const big = [];

/** Every .ts under src, recursively. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

const files = sourceFiles(join(root, "src"));
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/).length;
  if (lines > BIG_FILE) big.push({ file: relative(root, file), lines });
}
big.sort((a, b) => b.lines - a.lines);

if (existsSync(join(root, "src/lib/fishing/game/Scene.ts"))) {
  problems.push("src/lib/fishing/game/Scene.ts is an obsolete shim; use scenes/");
}

const mixPath = join(root, "src/lib/fishing/audioMix.ts");
const mix = existsSync(mixPath) ? readFileSync(mixPath, "utf8") : "";
for (const marker of ["// #region audio-mix", "// #endregion audio-mix"]) {
  if (!mix.includes(marker)) problems.push(`audioMix.ts lost marker: ${marker}`);
}

/**
 * Runtime import graph. `import type` is erased by the compiler, so it does not
 * participate; ordinary imports and `export ... from` do.
 */
function resolveImport(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const graph = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const deps = [];
  const importRe = /(?:^|\n)\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/g;
  const exportRe = /(?:^|\n)\s*export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/g;
  for (const re of [importRe, exportRe]) {
    let match;
    while ((match = re.exec(text))) {
      const target = resolveImport(file, match[1]);
      if (target && !deps.includes(target)) deps.push(target);
    }
  }
  graph.set(file, deps);
}

const color = new Map();
const stack = [];
function dfs(node) {
  color.set(node, 1);
  stack.push(node);
  for (const dep of graph.get(node) ?? []) {
    const state = color.get(dep) ?? 0;
    if (state === 1) {
      const at = stack.indexOf(dep);
      problems.push(
        `runtime import cycle: ${[...stack.slice(at), dep]
          .map((p) => relative(root, p))
          .join(" -> ")}`,
      );
    } else if (state === 0) {
      dfs(dep);
    }
  }
  stack.pop();
  color.set(node, 2);
}
for (const file of files) if (!color.has(file)) dfs(file);

/** Relative markdown links must point at real files. */
const mdFiles = [
  join(root, "AGENTS.md"),
  ...readdirSync(join(root, "docs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(root, "docs", name)),
];
for (const file of mdFiles) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  const linkRe = /\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRe.exec(text))) {
    const target = match[1].trim();
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = resolve(dirname(file), decodeURI(target.split("#")[0]));
    if (!existsSync(path)) {
      problems.push(`${relative(root, file)}: broken link ${target}`);
    }
  }
}

for (const entry of big) {
  console.log(
    `[structure] note: ${entry.file} is ${entry.lines} lines — split it if it holds more than one job`,
  );
}

if (problems.length > 0) {
  console.error("[structure] problems:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `[structure] OK: ${files.length} modules, no cycles, links resolve`,
);
