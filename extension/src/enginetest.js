// Test page: run the in-browser engine on benchmark posts and print P(yes) per (post, rule) for parity checks.
import { startForTest, score } from "./engine.js";
const out = document.getElementById("out");
const log = (s) => { out.textContent += s + "\n"; };
(async () => {
  const q = new URLSearchParams(location.search), base = q.get("base") || "http://127.0.0.1:8777/";
  const cases = await (await fetch(base + "parity_cases.json")).json();
  const t0 = performance.now();
  const eng = await startForTest(base, q.get("model") || undefined);
  log(`loaded on ${eng.backend} in ${Math.round(performance.now() - t0)} ms`);
  const res = [];
  for (const c of cases) {
    const t = performance.now();
    const p = await score(c.text, c.questions);
    res.push({ id: c.id, p, ms: performance.now() - t });
  }
  window.__RESULT__ = { backend: eng.backend, model: q.get("model"), res };
  log("done " + res.length);
})().catch((e) => { log("ERROR " + e); window.__RESULT__ = { error: String(e) }; });
