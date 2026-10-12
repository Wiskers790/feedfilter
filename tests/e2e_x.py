"""End-to-end on X in the test browser: open the home feed, scroll, then read what the extension did and what the popup says.
  uv run --with websockets python tests/e2e_x.py [scroll_steps]"""
import asyncio, json, sys, time, urllib.request
import websockets
EXT = "dclonpofbjbccjmnfampfiidjclebmnd"
STEPS = int(sys.argv[1]) if len(sys.argv) > 1 else 12

def new_tab(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:9555/json/new?{url}", method="PUT")))

class Tab:
    def __init__(self, ws): self.ws, self.n = ws, 0
    async def ev(self, expr):
        self.n += 1
        await self.ws.send(json.dumps({"id": self.n, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
        while True:
            m = json.loads(await self.ws.recv())
            if m.get("id") == self.n: return m.get("result", {}).get("result", {}).get("value")

COUNT = """JSON.stringify((() => { const c = {}; document.querySelectorAll('article[data-testid="tweet"]').forEach(a => { const k = a.getAttribute('data-ff') || 'none'; c[k] = (c[k]||0)+1; });
  return {counts: c, bars: [...document.querySelectorAll('.ff-bar b')].map(b => b.textContent)}; })())"""

async def main():
    x = new_tab("https://x.com/home")
    async with websockets.connect(x["webSocketDebuggerUrl"], max_size=2**26) as ws:
        t = Tab(ws); await asyncio.sleep(8)
        for i in range(STEPS):
            await t.ev("window.scrollBy(0, innerHeight * 0.8)"); await asyncio.sleep(2.5)
            print(i, await t.ev(COUNT), flush=True)
        await asyncio.sleep(5); print("final", await t.ev(COUNT))
    p = new_tab(f"chrome-extension://{EXT}/popup.html")
    async with websockets.connect(p["webSocketDebuggerUrl"], max_size=2**26) as ws:
        t = Tab(ws); await asyncio.sleep(2.5)
        print("popup:", await t.ev("document.getElementById('status').textContent"))
        print("recent:", await t.ev("[...document.querySelectorAll('#recent-list li')].map(l => l.textContent.slice(0,90)).join('\\n')"))
asyncio.run(main())
