const $ = (s) => document.querySelector(s);
const set = (id, cls, text) => { const li = $("#" + id); li.className = cls; if (text != null) li.querySelector("small").textContent = text; };
chrome.runtime.sendMessage({ type: "init-engine" }).catch(() => {});
async function tick() {
  const { engine } = await chrome.storage.session.get("engine");
  if (!engine) return set("s-gpu", "active", "Starting…");
  if (engine.state === "unsupported") {
    set("s-gpu", "fail", engine.error + " Feed Filter needs WebGPU on a real graphics card (most Windows and Mac computers have it). On Linux, WebGPU may need to be switched on in chrome://flags.");
    return;
  }
  if (engine.state === "error") { set("s-dl", "fail", engine.error); return; }
  set("s-gpu", "done", engine.gpu ? `Using ${engine.gpu}.` : "A GPU is available.");
  if (engine.state === "downloading") { set("s-dl", "active", `${Math.round(engine.progress * 100)}%`); $("#bar").style.width = engine.progress * 100 + "%"; }
  if (engine.state === "loading") { set("s-dl", "active", "Loading onto your GPU…"); $("#bar").style.width = "100%"; }
  if (engine.state === "ready") { set("s-dl", "done", "Downloaded and loaded."); $("#bar").style.width = "100%"; set("s-go", "done"); $("#go").hidden = false; return; }
}
tick(); setInterval(tick, 700);
