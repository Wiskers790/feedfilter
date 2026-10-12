"""Firefox test harness (WebDriver BiDi, no geckodriver): starts Firefox on the NVIDIA GPU with a scratch profile,
installs firefox/ as a temporary add-on, and runs a page of the extension.
  uv run --with websockets python tests/firefox.py enginetest     # engine parity + speed on WebGPU
  uv run --with websockets python tests/firefox.py popup          # popup status after init
  uv run --with websockets python tests/firefox.py eval '<js>' [page]"""
import asyncio, json, os, subprocess, sys, time
import websockets
PROFILE = "/run/media/neo/miki/feedfilter/ff-profile"
UUID = "0f0f0f0f-1111-2222-3333-444444444444"
EXT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "firefox")
PREFS = {
    "dom.webgpu.enabled": True, "network.lna.enabled": False, "network.lna.blocking": False,  # local model server in tests
    "gfx.webgpu.ignore-blocklist": True,
    "extensions.webextensions.uuids": json.dumps({"feedfilter@wiskers790": UUID}),
    "browser.shell.checkDefaultBrowser": False, "datareporting.policy.dataSubmissionEnabled": False,
    "browser.aboutwelcome.enabled": False, "toolkit.telemetry.reportingpolicy.firstRun": False,
}

CORS_PORT = 8778
def cors_server():
    """Static server for the model files with CORS (Firefox ignores the port in the localhost host permission)."""
    code = ("import http.server, functools\n"
            "class H(http.server.SimpleHTTPRequestHandler):\n"
            "    def end_headers(self): self.send_header('Access-Control-Allow-Origin', '*'); super().end_headers()\n"
            "    def log_message(self, *a): pass\n"
            f"http.server.ThreadingHTTPServer(('127.0.0.1', {CORS_PORT}), functools.partial(H, directory='/run/media/neo/miki/feedfilter/assets')).serve_forever()")
    return subprocess.Popen([sys.executable, "-c", code], start_new_session=True)

def start():
    os.makedirs(PROFILE, exist_ok=True)
    with open(f"{PROFILE}/user.js", "w") as f:
        for k, v in PREFS.items(): f.write(f"user_pref({json.dumps(k)}, {json.dumps(v)});\n")
    env = dict(os.environ, __NV_PRIME_RENDER_OFFLOAD="1", __GLX_VENDOR_LIBRARY_NAME="nvidia", __VK_LAYER_NV_optimus="NVIDIA_only")
    env.pop("LD_PRELOAD", None)
    return subprocess.Popen(["firefox", "--profile", PROFILE, "--no-remote", "--remote-debugging-port", "9333", "-remote-allow-system-access", "about:blank"],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)

class Bidi:
    def __init__(self, ws): self.ws, self.n = ws, 0
    async def call(self, method, **params):
        self.n += 1; await self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            m = json.loads(await self.ws.recv())
            if m.get("id") == self.n:
                if m.get("type") == "error": raise RuntimeError(f"{method}: {m.get('error')} {m.get('message')}")
                return m["result"]
    async def ev(self, ctx, expr):
        r = await self.call("script.evaluate", expression=expr, target={"context": ctx}, awaitPromise=True, resultOwnership="none")
        return r.get("result", {}).get("value", r.get("exceptionDetails", {}).get("text"))

async def main():
    global PROC, SRV
    SRV = cors_server(); PROC = start()
    for _ in range(100):
        try: ws = await websockets.connect("ws://127.0.0.1:9333/session", max_size=2**26); break
        except Exception: time.sleep(0.3)
    async with ws:
        b = Bidi(ws)
        await b.call("session.new", capabilities={})
        ext = await b.call("webExtension.install", extensionData={"type": "path", "path": os.path.abspath(EXT)})
        print("installed", ext)
        # BiDi may not navigate to moz-extension: pages, so drive the welcome tab the extension opens on install
        ctx = None
        for _ in range(40):
            for c in (await b.call("browsingContext.getTree"))["contexts"]:
                if c["url"].startswith("moz-extension://"): ctx = c["context"]
            if ctx: break
            await asyncio.sleep(0.5)
        async def go(page):
            await b.ev(ctx, f"location.href = 'moz-extension://{UUID}/{page}'; 1"); await asyncio.sleep(1.5)
        mode = sys.argv[1] if len(sys.argv) > 1 else "popup"
        if mode == "enginetest":
            await go(f"enginetest.html?model=f32&base=http://127.0.0.1:{CORS_PORT}/")
            t0 = time.time()
            while time.time() - t0 < 900:
                r = await b.ev(ctx, "JSON.stringify(window.__RESULT__ || null)")
                if r and r != "null": break
                await asyncio.sleep(3)
            print(await b.ev(ctx, "document.getElementById('out').textContent"))
            json.dump(json.loads(r) if r and r != "null" else None, open("/tmp/claude-ff-result.json", "w"))
        else:
            page = sys.argv[3] if len(sys.argv) > 3 else "popup.html"
            await go(page)
            if mode == "eval": print(await b.ev(ctx, sys.argv[2]))
            else:
                await b.ev(ctx, "browser.storage.local.set({modelBase: 'http://127.0.0.1:%d/'})" % CORS_PORT + "")
                t0 = time.time()
                while time.time() - t0 < 600:
                    s = await b.ev(ctx, "document.getElementById('status').textContent")
                    print(round(time.time() - t0), s, flush=True)
                    if s.startswith(("Ready", "This computer", "Couldn't")): break
                    await asyncio.sleep(5)
                # the same request the X content script sends
                for text in ["Just aped into $PEPE2, 100x incoming, don't miss the presale 🚀🚀", "Made sourdough for the first time this weekend. The crumb is a bit dense but I'm proud of it."]:
                    print(await b.ev(ctx, "browser.runtime.sendMessage({type: 'score-post', id: '/t/status/' + Math.random(), text: %s}).then(r => JSON.stringify(r))" % json.dumps(text)))
                await asyncio.sleep(1.5)
                print(await b.ev(ctx, "document.getElementById('status').textContent"))
        input_wait = float(os.environ.get("KEEP", "0"))
        if input_wait: await asyncio.sleep(input_wait)
PROC = SRV = None
try: asyncio.run(main())
finally:
    if PROC: os.killpg(PROC.pid, 15)
    if SRV: os.killpg(SRV.pid, 15)
