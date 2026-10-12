// Rules: plain-English "hide posts that..." checks, each scored by the decision model as a yes/no question.

// Default thresholds come from the feed-filter benchmark (feedfilter-bench), measured on the 4-bit browser build:
// the cut-off at which each rule wrongly hides about 3% of posts that don't match it.
export const PRESETS = [
  { id: "crypto", name: "Crypto & trading", on: true, threshold: 0.1988,
    text: "Hide crypto and trading posts: tokens, coins, prices, trading bots, trading profits or financial referral links." },
  { id: "politics", name: "Politics & outrage", on: false, threshold: 0.3987,
    text: "Hide politics and outrage: posts about politics, government, elections, culture-war topics, or outrage at people or groups." },
  { id: "bait", name: "Engagement bait", on: true, beta: true, threshold: 0.2142,
    text: "Hide engagement bait: posts written mainly to farm likes, replies, follows or bookmarks (\"comment X to get the link\", \"most people won't read this\", \"this is INSANE\", rage-bait questions, hype with no real content)." },
  { id: "slop", name: "AI slop", on: true, beta: true, threshold: 0.3968,
    text: "Hide AI slop: low-effort, generic, AI-generated-sounding filler such as vague hype, emoji-bullet listicles of tools, \"N tools that will replace X\", or motivational fluff with no specific information." },
  { id: "promo", name: "Self-promotion", on: false, beta: true, threshold: 0.4135,
    text: "Hide self-promotion: posts whose main purpose is to sell or promote the author's own product, course, newsletter, service, channel or paid offer." },
  { id: "nsfw", name: "Sexual / NSFW", on: false, threshold: 0.3228,
    text: "Hide sexual or NSFW content: posts that are sexual, erotic, or adult-oriented." },
];

export const CUSTOM_THRESHOLD = 0.4;

// The question the model sees, phrased exactly like the benchmark ("Hide ..." -> "Does this post match: ...").
export function question(rule) {
  const t = rule.text.trim();
  return /^hide\b/i.test(t) ? "Does this post match: " + t.replace(/^hide\s*/i, "") : "Does this post match: " + t;
}

// Sensitivity is a per-rule offset in logit space: +1 hides noticeably more, -1 noticeably less.
// Feedback nudges it: "Show" on a hidden post -0.25, "Hide" on a visible post +0.25.
export function effectiveThreshold(rule) {
  const base = Math.min(Math.max(rule.threshold, 1e-4), 1 - 1e-4);
  const logit = Math.log(base / (1 - base)) - 0.8 * (rule.sensitivity || 0);
  return 1 / (1 + Math.exp(-logit));
}

export async function loadSettings() {
  const s = await chrome.storage.local.get(["rules", "enabled", "modelBase"]);
  let rules = s.rules;
  if (!rules) {
    rules = PRESETS.map((p) => ({ ...p, sensitivity: 0, custom: false }));
    await chrome.storage.local.set({ rules });
  }
  return { rules, enabled: s.enabled !== false, modelBase: s.modelBase };
}
