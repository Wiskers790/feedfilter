import * as esbuild from "esbuild";
import fs from "fs";
const out = "extension";
const common = { bundle: true, minify: false, target: "chrome120", logLevel: "warning" };
await esbuild.build({ ...common, entryPoints: ["extension/src/engine.js"], outfile: `${out}/offscreen.js`, format: "esm" });
await esbuild.build({ ...common, entryPoints: ["extension/src/background.js"], outfile: `${out}/background.js`, format: "esm" });
await esbuild.build({ ...common, entryPoints: ["extension/src/content_x.js"], outfile: `${out}/content_x.js`, format: "iife" });
await esbuild.build({ ...common, entryPoints: ["extension/src/enginetest.js"], outfile: `${out}/enginetest.js`, format: "esm" });
await esbuild.build({ ...common, entryPoints: ["extension/src/welcome.js"], outfile: `${out}/welcome.js`, format: "esm" });
await esbuild.build({ ...common, entryPoints: ["extension/src/popup.js"], outfile: `${out}/popup.js`, format: "esm" });
// onnxruntime-web loads its WebAssembly/JSEP runtime by URL: ship those files inside the extension
fs.mkdirSync(`${out}/ort`, { recursive: true });
for (const f of fs.readdirSync("node_modules/onnxruntime-web/dist"))
  if (/^ort-wasm-simd-threaded\.(jsep|asyncify)\.(wasm|mjs)$/.test(f)) fs.copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `${out}/ort/${f}`);
console.log("built");
