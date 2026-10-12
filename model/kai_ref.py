"""Kai-0.6B (vllm-sr Decision-2.0) re-implemented from its published inference code, without the package:
prompt -> Qwen3 backbone last_hidden_state -> candidate head -> softmax. Used as the spec for the browser port."""
import json, math
from pathlib import Path
import torch, torch.nn.functional as F
from safetensors.torch import load_file
from transformers import AutoModel, AutoTokenizer

KAI = Path("/run/media/neo/miki/sift/compare/models/kai-0.6b")


def canonical(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def noul_segments(state, instructions):
    """The exact text Kai sees for a yes/no ("noul") question: options false=No, true=Yes, in that order."""
    prefix = f"Context:\n{state}\n\nTask type: noul\nQuestion:\n{instructions}\nOptions:"
    options = ["\n<option>\n" + canonical({"key": k, "description": d}) + "\n</option>" for k, d in (("false", "No"), ("true", "Yes"))]
    suffix = "\n\nSelect the single option best supported by the context and instructions.\nDecision:"
    return prefix, options, suffix


def encode(tok, state, instructions):
    prefix, options, suffix = noul_segments(state, instructions)
    ids = tok.encode(prefix, add_special_tokens=False); ends = []
    for o in options:
        ids += tok.encode(o, add_special_tokens=False); ends.append(len(ids) - 1)
    ids += tok.encode(suffix, add_special_tokens=False)
    return ids, ends, len(ids) - 1


class Head:
    def __init__(self, path, dim=256):
        w = load_file(str(path)); self.w = {k.removeprefix("head."): v.float() for k, v in w.items()}; self.dim = dim
    def __call__(self, cand, query):          # cand [n, H], query [H] -> [n] logits
        w = self.w
        c = F.layer_norm(cand, (cand.shape[-1],), w["candidate_norm.weight"], w["candidate_norm.bias"])
        q = F.layer_norm(query, (query.shape[-1],), w["query_norm.weight"], w["query_norm.bias"])
        bil = ((c @ w["key.weight"].T) * (q @ w["query.weight"].T)).sum(-1) / math.sqrt(self.dim)
        non = (F.gelu(c @ w["candidate_mlp.weight"].T + w["candidate_mlp.bias"] + q @ w["query_mlp.weight"].T) @ w["scalar.weight"].T).squeeze(-1)
        return bil + non


class Kai:
    def __init__(self, device="cuda"):
        self.tok = AutoTokenizer.from_pretrained(KAI)
        self.bb = AutoModel.from_pretrained(KAI / "backbone", dtype=torch.float32).to(device).eval()
        self.head = Head(KAI / "decision_head.safetensors"); self.device = device
    @torch.no_grad()
    def p_yes(self, state, instructions):
        ids, ends, qpos = encode(self.tok, state, instructions)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=self.device == "cuda"):
            h = self.bb(input_ids=torch.tensor([ids], device=self.device)).last_hidden_state[0].float()
        logits = self.head(h[ends].cpu(), h[qpos].cpu())
        return torch.softmax(logits, -1)[1].item()


if __name__ == "__main__":
    import sys
    print(sorted(load_file(str(KAI / "decision_head.safetensors")).keys()))
