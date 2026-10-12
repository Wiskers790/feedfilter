// X / Twitter: score each post as it scrolls into the feed and collapse the ones your rules catch.
import { loadSettings, effectiveThreshold } from "./rules.js";

const SEEN = "data-ff";            // pending | shown | hidden
let settings = null;
const refresh = async () => { settings = await loadSettings(); };
chrome.storage.onChanged.addListener(refresh);

const postId = (a) => [...a.querySelectorAll('a[href*="/status/"]')].map((x) => x.getAttribute("href")).find((h) => /^\/[^/]+\/status\/\d+$/.test(h || ""));

function postText(a) {
  const parts = [...a.querySelectorAll('[data-testid="tweetText"]')].map((n) => n.innerText.trim()).filter(Boolean);
  const card = a.querySelector('[data-testid="card.wrapper"]');
  if (card) parts.push(card.innerText.trim().slice(0, 300));
  return parts.join("\n\n");
}

function verdict(p) {
  if (!settings) return null;
  let best = null;
  for (const r of settings.rules) {
    if (!r.on || p[r.id] == null) continue;
    const t = effectiveThreshold(r), margin = p[r.id] - t;
    if (margin >= 0 && (!best || margin > best.margin)) best = { rule: r, margin, p: p[r.id] };
  }
  return best;
}

async function nudge(ruleId, delta) {
  const { rules } = await loadSettings();
  const r = rules.find((x) => x.id === ruleId);
  if (!r) return;
  r.sensitivity = Math.max(-3, Math.min(3, (r.sensitivity || 0) + delta));
  await chrome.storage.local.set({ rules });
}

function collapse(article, hit, text = "") {
  const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
  if (cell.querySelector(":scope > .ff-bar")) return;
  const bar = document.createElement("div");
  bar.className = "ff-bar";
  bar.innerHTML = `<span class="ff-dot"></span><span>Hidden · <b></b></span><button class="ff-show">Show</button>`;
  bar.querySelector("b").textContent = hit.rule.name;
  bar.title = `Feed Filter: ${Math.round(hit.p * 100)}% match for "${hit.rule.name}"`;
  bar.querySelector(".ff-show").addEventListener("click", (e) => {
    e.stopPropagation();
    article.classList.remove("ff-hidden"); bar.remove(); article.setAttribute(SEEN, "shown");
    nudge(hit.rule.id, -0.25);            // "this one was fine": hide a little less for this rule
  });
  article.classList.add("ff-hidden");
  cell.prepend(bar);
  chrome.runtime.sendMessage({ type: "hidden", rule: hit.rule.name, text: text.replace(/\s+/g, " ").slice(0, 160), id: postId(article) }).catch(() => {});
}

function addHideButton(article, p, text = "") {
  if (article.querySelector(".ff-hide")) return;
  const btn = document.createElement("button");
  btn.className = "ff-hide"; btn.textContent = "Hide like this"; btn.title = "Feed Filter: teach a rule to catch posts like this";
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); e.preventDefault();
    const on = settings.rules.filter((r) => r.on);
    if (!on.length) return;
    // the rule this post came closest to is the one that should learn from it
    const near = on.reduce((a, r) => ((p[r.id] ?? 0) - effectiveThreshold(r) > (p[a.id] ?? 0) - effectiveThreshold(a) ? r : a), on[0]);
    nudge(near.id, 0.25);
    collapse(article, { rule: near, p: p[near.id] ?? 0 }, text);
  });
  article.appendChild(btn);
}

// ------------------------------------------------------------ scheduling
// One request at a time (the model runs one post per pass anyway), always the waiting post closest to the screen,
// so posts X has already loaded just below the viewport are usually decided before you scroll to them.
const waiting = new Set();
let busy = false;
const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };   // false after an extension update

function distance(a) {
  const r = a.getBoundingClientRect();
  if (r.bottom < 0) return Infinity;                 // already scrolled past: not worth the time any more
  return r.top < innerHeight ? 0 : r.top - innerHeight;
}

async function pump() {
  if (busy || !alive()) return;
  busy = true;
  try {
    for (;;) {
      let next = null, best = Infinity;
      for (const a of waiting) {
        if (!a.isConnected) { waiting.delete(a); continue; }
        const d = distance(a);
        if (d < best) { best = d; next = a; }
      }
      if (!next || best > 3 * innerHeight) break;    // nothing close enough: wait for scrolling
      waiting.delete(next);
      await handle(next);
    }
  } finally { busy = false; }
}

async function handle(article) {
  const id = postId(article), text = postText(article);
  if (!id || !text) { article.setAttribute(SEEN, "skipped"); return; }
  article.setAttribute(SEEN, "pending");
  let res = null;
  try { res = await chrome.runtime.sendMessage({ type: "score-post", id, text }); } catch { res = null; }
  if (!res || res.error) { article.setAttribute(SEEN, "error"); return; }
  const hit = verdict(res.p);
  if (hit) { collapse(article, hit, text); article.setAttribute(SEEN, "hidden"); }
  else { article.setAttribute(SEEN, "shown"); addHideButton(article, res.p, text); }
}

function enqueue() {
  for (const a of document.querySelectorAll('article[data-testid="tweet"]:not([data-ff])')) {
    a.setAttribute(SEEN, "queued"); waiting.add(a);
  }
  pump();
}

const style = document.createElement("style");
style.textContent = `
  article.ff-hidden { display: none !important; }
  .ff-bar { display:flex; align-items:center; gap:8px; padding:8px 16px; font: 13px/1.3 -apple-system, "Segoe UI", sans-serif;
            color:#8b98a5; border-bottom:1px solid rgba(127,127,127,.2); }
  .ff-bar b { color: inherit; font-weight:600; }
  .ff-dot { width:7px; height:7px; border-radius:50%; background:#a99bff; }
  .ff-show { margin-left:auto; border:1px solid rgba(127,127,127,.35); background:transparent; color:inherit; border-radius:999px;
             padding:3px 12px; cursor:pointer; font:inherit; }
  .ff-show:hover { background: rgba(127,127,127,.12); }
  article { position: relative; }
  .ff-hide { position:absolute; top:8px; right:44px; opacity:0; transition:opacity .15s; z-index:2; border:none; cursor:pointer;
             background:rgba(20,20,28,.85); color:#c9c0ff; border-radius:999px; padding:3px 10px; font:12px -apple-system, "Segoe UI", sans-serif; }
  article:hover .ff-hide { opacity:1; }
`;
document.documentElement.appendChild(style);

(async () => {
  await refresh();
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(enqueue, 80); }).observe(document.body, { childList: true, subtree: true });
  addEventListener("scroll", () => pump(), { passive: true });
  enqueue();
})();
