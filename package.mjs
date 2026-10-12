// Packages the built extension for release / Chrome Web Store: dist/feedfilter-v<version>.zip
// Leaves out sources and the dev-only engine test page, and drops the localhost permission used for local model serving.
import fs from "fs";
import { execFileSync } from "child_process";
const ver = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8")).version;
const dir = "dist/feedfilter";
fs.rmSync("dist", { recursive: true, force: true });
fs.cpSync("extension", dir, { recursive: true, filter: (p) => !/(^|\/)(src|enginetest\.(html|js))$/.test(p) });
const m = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, "utf8"));
m.host_permissions = m.host_permissions.filter((h) => !h.startsWith("http://127.0.0.1"));
fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(m, null, 2));
execFileSync("zip", ["-qr", `feedfilter-v${ver}.zip`, "feedfilter"], { cwd: "dist" });
console.log(`dist/feedfilter-v${ver}.zip`);
