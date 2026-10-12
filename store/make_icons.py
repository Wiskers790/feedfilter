"""Toolbar/store icons: lavender rounded square with a white funnel. Store rule: 96 px artwork inside a 128 px canvas."""
from PIL import Image, ImageDraw
def icon(size, pad_frac):
    S = 1024; im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    p = int(S * pad_frac); d.rounded_rectangle([p, p, S - p, S - p], radius=int((S - 2 * p) * 0.24), fill=(123, 107, 240, 255))
    c, w = S / 2, (S - 2 * p)
    top, mid, bot = p + w * 0.27, p + w * 0.52, p + w * 0.78
    d.polygon([(c - w * 0.30, top), (c + w * 0.30, top), (c + w * 0.075, mid), (c + w * 0.075, bot - w * 0.04), (c - w * 0.075, bot), (c - w * 0.075, mid)], fill="white")
    return im.resize((size, size), Image.LANCZOS)
for s, pad in [(16, 0.0), (32, 0.02), (48, 0.06), (128, 0.125)]:
    icon(s, pad).save(f"extension/icon{s}.png")
icon(128, 0.125).save("store/icon128.png")
