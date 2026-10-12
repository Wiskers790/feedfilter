"""Run extension/enginetest.html in the test browser (CDP :9555) and compare with the Python references.
  uv run --with numpy --with websockets python tests/browser_parity.py [f16|f32]"""
import asyncio, json, sys, time, urllib.request
import numpy as np, websockets
EXT = "dclonpofbjbccjmnfampfiidjclebmnd"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "f32"
async def main():
    t = json.load(urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:9555/json/new?chrome-extension://{EXT}/enginetest.html?model={MODEL}", method="PUT")))
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=2**26) as ws:
        n = 0
        async def ev(expr):
            nonlocal n; n += 1
            await ws.send(json.dumps({"id": n, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True}}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("id") == n: return m["result"]["result"].get("value")
        t0 = time.time()
        while time.time() - t0 < 600:
            r = await ev("JSON.stringify(window.__RESULT__ || null)")
            if r and r != "null": return json.loads(r), await ev("document.getElementById('out').textContent")
            await asyncio.sleep(3)
        return None, await ev("document.getElementById('out').textContent")
res, log = asyncio.run(main())
print(log.strip())
if res and "res" in res:
    cases = json.load(open("/run/media/neo/miki/feedfilter/assets/parity_cases.json"))
    got = np.array([r["p"] for r in res["res"]]); q4 = np.array([c["ref_q4"] for c in cases]); fp = np.array([c["ref"] for c in cases])
    ms = [r["ms"] for r in res["res"]]
    print(f"{MODEL}: vs ORT-q4 mean|d| {np.abs(got-q4).mean():.4f} max {np.abs(got-q4).max():.3f} | vs full precision mean|d| {np.abs(got-fp).mean():.3f} | "
          f"first {ms[0]:.0f} ms, median {np.median(ms[1:]):.0f} ms per post (8 rules)")
else:
    print(res)
