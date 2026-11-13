/**
 * Compiles the pure fight model to CommonJS in `.sim/` and runs the balance
 * bot. Uses the TypeScript compiler API directly so no child process or shell
 * quoting is involved.
 *
 * Usage: pnpm sim
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, ".sim");
const files = [
  "src/lib/fishing/config.ts",
  "src/lib/fishing/types.ts",
  "src/lib/fishing/utils.ts",
  "src/lib/fishing/game/behaviors.ts",
  "src/lib/fishing/game/fightModel.ts",
  "scripts/simulate-fight.ts",
];

const options = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  esModuleInterop: true,
  skipLibCheck: true,
  strict: true,
  noEmitOnError: true,
  outDir: out,
  rootDir: root,
};

const program = ts.createProgram(
  files.map((file) => resolve(root, file)),
  options,
);
const emit = program.emit();
const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);

if (diagnostics.length > 0) {
  const host = {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  };
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, host),
  );
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "package.json"), '{ "type": "commonjs" }\n');
createRequire(import.meta.url)(resolve(out, "scripts/simulate-fight.js"));
