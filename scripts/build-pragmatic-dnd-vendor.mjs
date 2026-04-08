import { mkdir } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

const rootDir = process.cwd();
const entryFile = path.join(rootDir, "src/vendor/pragmatic-dnd-browser-entry.js");
const outFile = path.join(rootDir, "public/vendor/pragmatic-dnd.js");

await mkdir(path.dirname(outFile), { recursive: true });

await build({
  entryPoints: [entryFile],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  sourcemap: false,
  logLevel: "info",
});
