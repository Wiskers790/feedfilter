// Builds the extension for Chrome (into extension/, loadable unpacked) and Firefox (into firefox/).
// Same sources; Firefox gets a Manifest V2 build whose persistent background page runs the model
// (Firefox has no offscreen documents) and uses the promise-based `browser` namespace.
import * as esbuild from "esbuild";
import fs from "fs";

const common = { bundle: true, minifySyntax: true,   // folds the FIREFOX constant so each build drops the other's code
  target: ["chrome120", "firefox128"], logLevel: "warning" };
const PAGES = ["popup", "welcome", "enginetest"];

async function bundles(out, firefox) {
  const opt = { ...common, define: { FIREFOX: String(firefox), ...(firefox ? { chrome: "browser" } : {}) } };
  const esm = (entry, file) => esbuild.build({ ...opt, entryPoints: [`extension/src/${entry}.js`], outfile: `${out}/${file}.js`, format: "esm" });
  if (firefox) await esm("background_firefox", "background");
  else { await esm("background", "background"); await esm("engine", "offscreen"); }
  for (const p of PAGES) await esm(p, p);
  await esbuild.build({ ...opt, entryPoints: ["extension/src/content_x.js"], outfile: `${out}/content_x.js`, format: "iife" });
  // onnxruntime-web loads its WebAssembly/JSEP runtime by URL: ship those files inside the extension
  fs.mkdirSync(`${out}/ort`, { recursive: true });
  for (const f of fs.readdirSync("node_modules/onnxruntime-web/dist"))
    if (/^ort-wasm-simd-threaded\.(jsep|asyncify)\.(wasm|mjs)$/.test(f)) fs.copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `${out}/ort/${f}`);
}

function firefoxManifest(m) {
  return {
    manifest_version: 2,
    name: m.name, version: m.version, description: m.description,
    permissions: [...m.permissions.filter((p) => p !== "offscreen"), ...m.host_permissions],
    background: { page: "background.html", persistent: true },
    content_scripts: m.content_scripts,
    browser_action: m.action,
    content_security_policy: m.content_security_policy.extension_pages,
    icons: m.icons,
    browser_specific_settings: {
      gecko: {
        id: "feedfilter@wiskers790",
        strict_min_version: "141.0",            // first Firefox with WebGPU on by default (Windows)
        update_url: "https://github.com/Wiskers790/feedfilter/releases/latest/download/updates.json",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}

await bundles("extension", false);

const ff = "firefox";
fs.rmSync(ff, { recursive: true, force: true });
fs.mkdirSync(ff);
for (const f of fs.readdirSync("extension"))
  if (/\.(html|css|png)$/.test(f) && f !== "offscreen.html") fs.copyFileSync(`extension/${f}`, `${ff}/${f}`);
fs.writeFileSync(`${ff}/background.html`, '<!doctype html><meta charset="utf-8"><script type="module" src="background.js"></script>\n');
fs.writeFileSync(`${ff}/manifest.json`, JSON.stringify(firefoxManifest(JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"))), null, 2));
await bundles(ff, true);
console.log("built");
