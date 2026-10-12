// Offscreen page: loads Kai-0.6B (4-bit ONNX backbone + decision head) once and answers
// {type:"score", text, questions} requests from the background worker. WebGPU only: on machines without a real
// GPU the engine reports "unsupported" instead of crawling on the CPU.
import * as ort from "onnxruntime-web/webgpu";
import { Tokenizer } from "@huggingface/tokenizers";

// Model files are downloaded once from the project's GitHub release and kept in the Cache API.
// (Development: set chrome.storage.local {modelBase: "http://127.0.0.1:8777/"} to use a local server instead.)
const DEFAULT_BASE = "https://github.com/Wiskers790/feedfilter/releases/download/model-v1/";
// 4-bit weights, fp32 math. (An fp16-math build would be faster but doesn't convert cleanly yet.)
const MODEL = { f32: { name: "kai_q4", bytes: 431674880 } };
const SHARED = ["head.bin", "head.json", "tokenizer.json", "tokenizer_config.json"];

ort.env.wasm.wasmPaths = chrome.runtime.getURL("ort/");
ort.env.wasm.numThreads = 1;   // extension pages are not cross-origin isolated
// Laptops/desktops with an integrated + a discrete GPU: use the discrete one. Chrome defaults to the low-power GPU,
// where a 0.6B model is slow enough to stall the page.
ort.env.webgpu.powerPreference = "high-performance";

let ready = null;          // Promise<{session, tok, head, backend}>
let status = { state: "idle", progress: 0, backend: null, error: null };
// Chrome: the engine lives in an offscreen page and reports to the background worker by message.
// Firefox: it lives in the background page itself, which swaps in a direct reporter (setReporter).
let reporter = (st) => chrome.runtime.sendMessage({ type: "engine-status", status: st }).catch(() => {});
const report = () => reporter(status);
export const setReporter = (fn) => { reporter = fn; };

async function fetchCached(base, name, onBytes) {
  const cache = await caches.open("feedfilter-model-v1");
  const url = base + name;
  let res = await cache.match(url);
  if (!res) {
    const net = await fetch(url);
    if (!net.ok) throw new Error(`download ${name}: HTTP ${net.status}`);
    const total = +net.headers.get("content-length") || 0;
    const reader = net.body.getReader(); const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onBytes(value.length, total);
    }
    const blob = new Blob(chunks);
    await cache.put(url, new Response(blob, { headers: { "content-length": String(blob.size) } }));
    res = await cache.match(url);
  } else {
    onBytes(+res.headers.get("content-length") || 0, 0);
  }
  return res;
}

// A usable GPU = a real (not software-emulated) WebGPU adapter. Chrome gives pages the low-power GPU unless asked,
// and falls back to SwiftShader (a CPU emulator, far too slow) after GPU-process crashes or on blocklisted drivers.
async function checkGpu() {
  if (!navigator.gpu) return { ok: false, reason: "WebGPU is turned off in this browser." };
  let ad = null;
  try { ad = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" }); } catch (e) {}
  if (!ad) return { ok: false, reason: "No GPU is available to the browser." };
  const info = ad.info || {};
  const name = [info.vendor, info.description || info.architecture].filter(Boolean).join(" ");   // empty in Firefox, which hides GPU names
  if (info.isFallbackAdapter || /swiftshader|llvmpipe|lavapipe/i.test(`${name} ${info.device || ""}`))
    return { ok: false, reason: "The browser only offers a software GPU emulator, which is too slow." };
  return { ok: true, name, f16: ad.features.has("shader-f16") };
}

async function load(base, force) {
  const gpu = await checkGpu();
  if (!gpu.ok) {
    status = { state: "unsupported", progress: 0, backend: null, error: gpu.reason }; report();
    throw new Error(gpu.reason);
  }
  status = { state: "downloading", progress: 0, backend: null, gpu: gpu.name, error: null }; report();
  const build = MODEL[force || "f32"];
  const expected = build.bytes + 11422650 + 4212736; let seen = 0;
  const onBytes = (n) => { seen += n; status.progress = Math.min(0.99, seen / expected); report(); };
  const files = [`${build.name}.onnx`, `${build.name}.onnx.data`, ...SHARED];
  const [onnx, data, headBin, headJson, tj, tc] = await Promise.all(files.map((f) => fetchCached(base, f, onBytes)));
  status.state = "loading"; report();
  const tok = new Tokenizer(await tj.json(), await tc.json());
  const head = parseHead(await headJson.json(), new Float32Array(await headBin.arrayBuffer()));
  const modelBytes = new Uint8Array(await onnx.arrayBuffer());
  const externalData = [{ path: `${build.name}.onnx.data`, data: new Uint8Array(await data.arrayBuffer()) }];
  const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["webgpu"], externalData, graphOptimizationLevel: "all" });
  status = { state: "ready", progress: 1, backend: "webgpu", gpu: gpu.name, model: build.name, error: null }; report();
  return { session, tok, head, backend: "webgpu" };
}

// ------------------------------------------------------------ the decision head (port of Kai's CandidateHead)

function parseHead(meta, buf) {
  const t = {};
  for (const [k, v] of Object.entries(meta.tensors)) {
    const n = v.shape.reduce((a, b) => a * b, 1);
    t[k] = { data: buf.subarray(v.offset, v.offset + n), shape: v.shape };
  }
  return { t, dim: meta.head_dim, temperature: meta.temperature || 1 };
}

function layerNorm(x, w, b) {
  const n = x.length; let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
  let v = 0; for (let i = 0; i < n; i++) v += (x[i] - mean) ** 2; v /= n;
  const inv = 1 / Math.sqrt(v + 1e-5), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (x[i] - mean) * inv * w[i] + b[i];
  return out;
}

function matvec(W, x, bias) {          // W: [out, in] row-major, like torch Linear.weight
  const [o, n] = W.shape, out = new Float32Array(o);
  for (let r = 0; r < o; r++) {
    let s = bias ? bias[r] : 0; const off = r * n;
    for (let c = 0; c < n; c++) s += W.data[off + c] * x[c];
    out[r] = s;
  }
  return out;
}

const erf = (x) => {   // Abramowitz-Stegun 7.1.26, |err| < 1.5e-7
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
const gelu = (x) => 0.5 * x * (1 + erf(x / Math.SQRT2));

function headLogits(H, candidates, query) {
  const t = H.t, q = layerNorm(query, t["query_norm.weight"].data, t["query_norm.bias"].data);
  const qk = matvec(t["query.weight"], q), qm = matvec(t["query_mlp.weight"], q);
  return candidates.map((cand) => {
    const c = layerNorm(cand, t["candidate_norm.weight"].data, t["candidate_norm.bias"].data);
    const k = matvec(t["key.weight"], c), m = matvec(t["candidate_mlp.weight"], c, t["candidate_mlp.bias"].data);
    let bil = 0; for (let i = 0; i < k.length; i++) bil += k[i] * qk[i];
    let non = 0; const sw = t["scalar.weight"].data;
    for (let i = 0; i < m.length; i++) non += sw[i] * gelu(m[i] + qm[i]);
    return bil / Math.sqrt(H.dim) + non;
  });
}

// ------------------------------------------------------------ prompt (identical to Kai's training format)

const canonical = (o) => JSON.stringify(Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])));
function encode(tok, state, instructions) {
  const prefix = `Context:\n${state}\n\nTask type: noul\nQuestion:\n${instructions}\nOptions:`;
  const options = [["false", "No"], ["true", "Yes"]].map(([key, description]) => "\n<option>\n" + canonical({ key, description }) + "\n</option>");
  const suffix = "\n\nSelect the single option best supported by the context and instructions.\nDecision:";
  const enc = (s) => tok.encode(s, { add_special_tokens: false }).ids;
  const ids = enc(prefix), ends = [];
  for (const o of options) { ids.push(...enc(o)); ends.push(ids.length - 1); }
  ids.push(...enc(suffix));
  return { ids, ends, query: ids.length - 1 };
}

// One post, many questions: one padded batch through the backbone, then the head per question.
async function score(text, questions) {
  const { session, tok, head } = await ready;
  const post = text.length > 1200 ? text.slice(0, 1200) : text;
  const rows = questions.map((q) => encode(tok, post, q));
  const B = rows.length, L = Math.max(...rows.map((r) => r.ids.length)), pad = 151643;
  const ids = new BigInt64Array(B * L).fill(BigInt(pad)), am = new BigInt64Array(B * L);
  rows.forEach((r, b) => r.ids.forEach((id, i) => { ids[b * L + i] = BigInt(id); am[b * L + i] = 1n; }));
  const out = await session.run({
    input_ids: new ort.Tensor("int64", ids, [B, L]),
    attention_mask: new ort.Tensor("int64", am, [B, L]),
  });
  const h = out.last_hidden_state, D = h.dims[2], data = await h.getData();
  const vec = (b, p) => data.subarray((b * L + p) * D, (b * L + p + 1) * D);
  return rows.map((r, b) => {
    const lg = headLogits(head, r.ends.map((p) => vec(b, p)), vec(b, r.query)).map((x) => x / head.temperature);
    const m = Math.max(...lg), e = lg.map((x) => Math.exp(x - m));
    return e[1] / (e[0] + e[1]);     // P(true)
  });
}

export { load, score };
export function startForTest(base, force) { ready = load(base, force); return ready; }

// ------------------------------------------------------------ requests (one at a time keeps the GPU calm)

let queue = Promise.resolve();
export function handle(msg) {
  if (msg.type === "init") {
    if (!ready) {
      ready = load(msg.modelBase || DEFAULT_BASE).catch((e) => {
        if (status.state !== "unsupported") { status = { state: "error", error: String(e.message || e) }; report(); }
        ready = null; throw e;
      });
      ready.catch(() => {});
    }
    return Promise.resolve(status);
  }
  if (msg.type === "status") return Promise.resolve(status);
  if (msg.type === "score") {
    if (!ready) return Promise.resolve({ error: "model not loaded" });
    const t0 = performance.now();
    const timed = () => Promise.race([score(msg.text, msg.questions), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 20000))]);
    const out = queue.then(timed).then((p) => ({ p, ms: performance.now() - t0 }), (e) => ({ error: String(e) }));
    queue = out;
    return out;
  }
  return null;
}

if (!FIREFOX) chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.target !== "offscreen") return;
  const r = handle(msg);
  if (!r) return;
  r.then(reply);
  return true;   // async reply
});
