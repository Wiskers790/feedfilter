// Test page: run the in-browser engine on benchmark posts and print P(yes) per (post, rule) for parity checks.
import { startForTest, score } from "./engine.js";
const out = document.getElementById("out");
const log = (s) => { out.textContent += s + "\n"; };
(async () => {
  const cases = await (await fetch("http://127.0.0.1:8777/parity_cases.json")).json();
  const t0 = performance.now();
  const force = new URLSearchParams(location.search).get("model") || undefined;
  const eng = await startForTest("http://127.0.0.1:8777/", force);
  log(`loaded on ${eng.backend} in ${Math.round(performance.now() - t0)} ms`);
  const res = [];
  for (const c of cases) {
    const t = performance.now();
    const p = await score(c.text, c.questions);
    res.push({ id: c.id, p, ms: performance.now() - t });
  }
  window.__RESULT__ = { backend: eng.backend, model: force, res };
  log("done " + res.length);
})().catch((e) => { log("ERROR " + e); window.__RESULT__ = { error: String(e) }; });
