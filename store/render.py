"""Render store/shots.html sections to PNGs with headless Chrome for Testing (exact sizes, 1x).
  uv run --with websockets python store/render.py"""
import asyncio, base64, json, os, subprocess, tempfile, time, urllib.request
import websockets
CHROME = "/run/media/neo/miki/feedfilter/cft/chrome-linux64/chrome"
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = {"shot1": (1280, 800), "shot2": (1280, 800), "shot3": (1280, 800), "tile": (440, 280)}
async def main():
    prof = tempfile.mkdtemp()
    p = subprocess.Popen([CHROME, "--headless=new", f"--user-data-dir={prof}", "--remote-debugging-port=9566", "--hide-scrollbars",
                          "--force-device-scale-factor=1", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try: tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9566/json")); break
            except Exception: time.sleep(0.2)
        t = next(x for x in tabs if x["type"] == "page")
        async with websockets.connect(t["webSocketDebuggerUrl"], max_size=2**28) as ws:
            n = 0
            async def call(m, **params):
                nonlocal n; n += 1; await ws.send(json.dumps({"id": n, "method": m, "params": params}))
                while True:
                    r = json.loads(await ws.recv())
                    if r.get("id") == n: return r.get("result", {})
            await call("Page.enable")
            await call("Emulation.setDeviceMetricsOverride", width=1280, height=800, deviceScaleFactor=1, mobile=False)
            await call("Page.navigate", url="file://" + os.path.join(HERE, "shots.html")); await asyncio.sleep(1.5)
            for sid, (w, h) in SHOTS.items():
                box = (await call("Runtime.evaluate", expression=f"JSON.stringify(document.getElementById('{sid}').getBoundingClientRect())", returnByValue=True))["result"]["value"]
                b = json.loads(box)
                r = await call("Page.captureScreenshot", format="png", captureBeyondViewport=True,
                               clip={"x": b["x"], "y": b["y"] + 0, "width": w, "height": h, "scale": 1})
                open(os.path.join(HERE, f"{sid}.png"), "wb").write(base64.b64decode(r["data"])); print(sid, w, h)
    finally:
        p.terminate()
asyncio.run(main())
