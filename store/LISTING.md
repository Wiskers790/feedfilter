# Chrome Web Store listing

Upload: `dist/feedfilter-v<version>.zip` (`npm run package`).

## Store listing tab
**Name:** Feed Filter

**Summary (≤132 chars):**
Hide posts you don't want to see on X with plain-English rules. A small AI model runs privately on your own computer.

**Category:** Social Networking · **Language:** English

**Description:**
```
Feed Filter hides the posts you don't want to see on X, using rules you write in plain English.

"Hide crypto and trading posts." "Hide engagement bait." "Hide posts about celebrity gossip." Turn on a built-in rule or write your own, and a small AI model checks each post as your feed loads. Matching posts fold into a slim "Hidden" bar, so nothing is ever lost: one click shows the post again.

PRIVATE BY DESIGN
The AI runs inside your browser, on your own graphics card. The posts you read, your rules and your settings never leave your computer. No account, no servers, no tracking, no analytics.

LEARNS YOUR TASTE
Click "Show" on a hidden post and that rule gets a little less strict. Click "Hide like this" on a post it missed and the rule catches more. Each rule also has a "Hide less / Hide more" slider.

BUILT-IN RULES
• Crypto & trading
• Engagement bait (beta)
• AI slop (beta)
• Politics & outrage (off by default)
• Self-promotion (beta, off by default)
• Sexual / NSFW (off by default)

REQUIREMENTS
A computer with a graphics card that supports WebGPU (most computers from the last several years). The model (about 450 MB) downloads once, the first time you use the extension. On a typical GPU each post takes about half a second and is usually decided before you scroll to it.

Open source: https://github.com/Wiskers790/feedfilter
Feed Filter is an independent project and is not affiliated with X Corp.
```

**Graphics:** icon `store/icon128.png` · screenshots `store/shot1.png`, `shot2.png`, `shot3.png` (1280×800) ·
small promo tile `store/tile.png` (440×280).

**Website / support:** https://github.com/Wiskers790/feedfilter

## Privacy practices tab
**Single purpose:** Hide posts on X that match the user's own plain-English rules, using an AI model that runs locally.

**Permission justifications:**
- `storage`: saves the user's rules, settings and a short list of recently hidden posts on the device.
- `offscreen`: runs the AI model in an offscreen document (WebGPU inference) so it is shared by all X tabs and does not slow down the page.
- `unlimitedStorage`: keeps the downloaded AI model (~450 MB) in the browser cache so it is downloaded only once.
- Host `https://x.com/*`, `https://twitter.com/*`: the content script reads post text on the page to check it against the user's rules and collapses matching posts.
- Host `https://github.com/*`, `https://release-assets.githubusercontent.com/*`: downloads the AI model files from the project's public GitHub release (GitHub redirects downloads to release-assets.githubusercontent.com).

**Remote code:** No, I am not using remote code. (All JavaScript and WebAssembly ship in the package. The downloaded files are model weights and tokenizer data, not code.)

**Data usage:** collects none of the listed data types. Certify all three statements (no selling, no unrelated use, no creditworthiness).

**Privacy policy URL:** https://github.com/Wiskers790/feedfilter/blob/main/PRIVACY.md

## Distribution tab
Free · Public · All regions.
