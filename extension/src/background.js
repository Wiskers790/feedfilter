// Background service worker: owns the offscreen model page, routes content-script requests to it, caches verdicts.
import { loadSettings, question } from "./rules.js";

const OFFSCREEN = "offscreen.html";
let creating = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creating ??= chrome.offscreen.createDocument({
    url: OFFSCREEN, reasons: ["WORKERS"], justification: "Runs the feed-filter model locally (WebGPU/WASM).",
  }).finally(() => { creating = null; });
  await creating;
}

// How requests reach the model. Chrome: the offscreen page. Firefox: background_firefox.js calls the engine directly.
let engineCall = FIREFOX ? null : async (msg) => { await ensureOffscreen(); return chrome.runtime.sendMessage({ target: "offscreen", ...msg }); };
export const setEngine = (fn) => { engineCall = fn; };

async function initEngine() {
  const { modelBase } = await loadSettings();
  return engineCall({ type: "init", modelBase });
}

// post id -> {rulesKey, p: {ruleId: prob}}; kept for the session so scrolling back never re-runs the model
const cache = new Map();
// Counters live in session storage: the service worker sleeps after ~30 s idle and would lose them otherwise.
// Updates run one after another so concurrent messages never overwrite each other's read-modify-write.
let writes = Promise.resolve();
function bump(fields, hiddenPost) {
  writes = writes.then(async () => {
    const { stats = { checked: 0, hidden: 0, msTotal: 0 }, recent = [] } = await chrome.storage.session.get(["stats", "recent"]);
    for (const [k, v] of Object.entries(fields)) stats[k] = (stats[k] || 0) + v;
    const next = { stats };
    if (hiddenPost) next.recent = [{ ...hiddenPost, at: Date.now() }, ...recent].slice(0, 30);
    await chrome.storage.session.set(next);
  }).catch((e) => console.warn("stats", e));
  return writes;
}

async function scorePost(id, text) {
  const { rules, enabled } = await loadSettings();
  const active = rules.filter((r) => r.on);
  if (!enabled || !active.length || !text.trim()) return { p: {} };
  const key = active.map((r) => r.id + ":" + r.text).join("|");
  const hit = cache.get(id);
  if (hit && hit.key === key) return { p: hit.p };
  await initEngine();
  const res = await engineCall({ type: "score", text, questions: active.map(question) });
  if (res?.error) return { error: res.error };
  const p = Object.fromEntries(active.map((r, i) => [r.id, res.p[i]]));
  cache.set(id, { key, p }); bump({ checked: 1, msTotal: res.ms });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return { p };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === "offscreen") return;
  if (msg.type === "score-post") { scorePost(msg.id, msg.text).then(reply); return true; }
  if (msg.type === "hidden") {
    bump({ hidden: 1 }, { rule: msg.rule, text: msg.text, id: msg.id });
    return;
  }
  if (msg.type === "stats") { chrome.storage.session.get("stats").then(({ stats }) => reply(stats || { checked: 0, hidden: 0, msTotal: 0 })); return true; }
  if (msg.type === "init-engine") { initEngine().then(reply).catch((e) => reply({ state: "error", error: String(e) })); return true; }
  if (msg.type === "engine-status") { chrome.storage.session.set({ engine: msg.status }); return; }
  if (msg.type === "rules-changed") { cache.clear(); return; }
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  loadSettings().then(initEngine).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { initEngine().catch(() => {}); });
