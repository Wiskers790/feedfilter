"""Export Kai's Qwen3 backbone (input_ids, attention_mask -> last_hidden_state) to ONNX, fp32, dynamic batch/seq."""
import torch
from transformers import AutoModel
from kai_ref import KAI
OUT = "/run/media/neo/miki/feedfilter/onnx"
import os; os.makedirs(OUT, exist_ok=True)
m = AutoModel.from_pretrained(KAI / "backbone", dtype=torch.float32, attn_implementation="eager").eval()
class Wrap(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, input_ids, attention_mask):
        return s.m(input_ids=input_ids, attention_mask=attention_mask, use_cache=False).last_hidden_state
ids = torch.randint(0, 1000, (2, 48)); am = torch.ones_like(ids)
torch.onnx.export(Wrap(m), (ids, am), f"{OUT}/backbone.onnx", input_names=["input_ids", "attention_mask"],
                  output_names=["last_hidden_state"], opset_version=18, dynamo=False,
                  dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"}, "last_hidden_state": {0: "b", 1: "s"}},
                  external_data=True)
print("exported")
