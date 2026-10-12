// Packages the built extension for release / stores: dist/feedfilter-v<version>.zip (Chrome) and
// dist/feedfilter-firefox-v<version>.zip (Firefox, signed into an .xpi by the release workflow).
// Leaves out sources and the dev-only engine test page, and drops the localhost permission used for local model serving.
import fs from "fs";
import { execFileSync } from "child_process";
const ver = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8")).version;
fs.rmSync("dist", { recursive: true, force: true });
const local = (h) => h.startsWith("http://127.0.0.1");

function pack(src, name, fixManifest) {
  const dir = `dist/${name}`;
  fs.cpSync(src, dir, { recursive: true, filter: (p) => !/(^|\/)(src|enginetest\.(html|js))$/.test(p) });
  const m = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, "utf8"));
  fixManifest(m);
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(m, null, 2));
  return dir;
}
pack("extension", "feedfilter", (m) => { m.host_permissions = m.host_permissions.filter((h) => !local(h)); });
execFileSync("zip", ["-qr", `feedfilter-v${ver}.zip`, "feedfilter"], { cwd: "dist" });
const ff = pack("firefox", "feedfilter-firefox", (m) => { m.permissions = m.permissions.filter((h) => !local(h)); });
execFileSync("zip", ["-qr", `../feedfilter-firefox-v${ver}.zip`, "."], { cwd: ff });   // Firefox wants files at the zip root
console.log(`dist/feedfilter-v${ver}.zip dist/feedfilter-firefox-v${ver}.zip`);
