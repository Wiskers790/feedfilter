import { loadSettings, CUSTOM_THRESHOLD } from "./rules.js";

const $ = (s) => document.querySelector(s);

async function render() {
  const { rules, enabled } = await loadSettings();
  $("#enabled").checked = enabled;
  const list = $("#rules"); list.textContent = "";
  for (const r of rules) {
    const row = document.createElement("div"); row.className = "rule" + (r.on ? " on" : "");
    row.innerHTML = `
      <label class="sw"><input type="checkbox"><span></span></label>
      <div class="body"><div class="name"></div><div class="text"></div>
        <div class="sens"><span>Hide less</span><input type="range" min="-3" max="3" step="0.25"><span>Hide more</span></div></div>
      <button class="del" title="Remove">×</button>`;
    row.querySelector(".name").textContent = r.name + (r.beta ? "  · beta, learns from you" : "");
    row.querySelector(".text").textContent = r.text;
    const cb = row.querySelector("input[type=checkbox]"); cb.checked = r.on;
    cb.addEventListener("change", () => save(rules, (x) => x.id === r.id && (x.on = cb.checked)));
    const sl = row.querySelector("input[type=range]"); sl.value = r.sensitivity || 0;
    sl.addEventListener("change", () => save(rules, (x) => x.id === r.id && (x.sensitivity = +sl.value)));
    const del = row.querySelector(".del");
    if (!r.custom) del.remove();
    else del.addEventListener("click", async () => { await chrome.storage.local.set({ rules: rules.filter((x) => x.id !== r.id) }); notify(); render(); });
    list.appendChild(row);
  }
}

async function save(rules, mut) {
  rules.forEach(mut);
  await chrome.storage.local.set({ rules });
  notify(); render();
}
const notify = () => chrome.runtime.sendMessage({ type: "rules-changed" }).catch(() => {});

$("#enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));

$("#add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#newrule").value.trim();
  if (!text) return;
  const { rules } = await loadSettings();
  const name = text.replace(/^hide\s*/i, "").replace(/[:.].*$/, "").slice(0, 40) || "Custom rule";
  rules.push({ id: "c" + Date.now(), name: name[0].toUpperCase() + name.slice(1), text: /^hide/i.test(text) ? text : "Hide " + text,
               on: true, custom: true, threshold: CUSTOM_THRESHOLD, sensitivity: 0 });
  await chrome.storage.local.set({ rules });
  $("#newrule").value = ""; notify(); render();
});

async function status() {
  const { engine, recent = [] } = await chrome.storage.session.get(["engine", "recent"]);
  const stats = await chrome.runtime.sendMessage({ type: "stats" }).catch(() => null);
  const el = $("#status"); el.className = "status";
  if (!engine || engine.state === "idle") el.textContent = "Starting the local model…";
  else if (engine.state === "downloading") el.textContent = `Downloading the model once (~440 MB): ${Math.round(engine.progress * 100)}%`;
  else if (engine.state === "loading") el.textContent = "Loading the model onto your GPU…";
  else if (engine.state === "unsupported") { el.className = "status warn"; el.textContent = "This computer can't run the filter yet: " + engine.error + " It needs a browser with WebGPU on a real graphics card."; }
  else if (engine.state === "error") { el.className = "status warn"; el.textContent = "Couldn't start the model: " + engine.error; }
  else {
    const ms = stats?.checked ? ` · ${Math.round(stats.msTotal / stats.checked)} ms per post` : "";
    el.textContent = `Ready on ${engine.gpu || "your GPU"} · ${stats?.checked ?? 0} posts checked, ${stats?.hidden ?? 0} hidden${ms}`;
  }
  const box = $("#recent");
  box.hidden = !recent.length;
  const list = $("#recent-list"); list.textContent = "";
  for (const r of recent.slice(0, 8)) {
    const li = document.createElement("li");
    const b = document.createElement("b"); b.textContent = r.rule;
    const span = document.createElement("span"); span.textContent = " " + (r.text || "(no text)");
    li.append(b, span);
    if (r.id) { li.title = "Open this post"; li.addEventListener("click", () => chrome.tabs.create({ url: "https://x.com" + r.id })); }
    list.appendChild(li);
  }
}

chrome.runtime.sendMessage({ type: "init-engine" }).catch(() => {});
render(); status(); setInterval(status, 1000);
