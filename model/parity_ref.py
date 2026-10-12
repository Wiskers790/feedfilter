import json, sys
sys.path.insert(0, "/home/neo/Projects/feedfilter-bench")
import torch
from transformers import AutoModel
from kai_ref import Kai, KAI
from bench import ITEMS, RULES, rule_text
items = ITEMS[:20]; qs = {r: rule_text(r, "zero") for r in RULES}
ref = Kai()
pkg = AutoModel.from_pretrained(str(KAI), trust_remote_code=True); pkg = (pkg.cuda() if hasattr(pkg, "cuda") else pkg).eval()
diffs = []
for it in items:
    a = pkg.system_one(state=it["text"], questions={r: {"type": "noul", "instructions": q} for r, q in qs.items()})["answers"]
    for r, q in qs.items():
        diffs.append(abs(ref.p_yes(it["text"], q) - float(a[r]["noul"])))
print(f"max |diff| {max(diffs):.4f}  mean {sum(diffs)/len(diffs):.4f} over {len(diffs)} decisions")
