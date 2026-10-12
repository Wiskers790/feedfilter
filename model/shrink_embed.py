"""Replace the fp32 embedding table with int8 rows + one fp32 scale per row:
emb = Cast(Gather(W_int8, ids)) * Gather(scale, ids). 622 MB -> ~156 MB."""
import numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto
D = "/run/media/neo/miki/feedfilter/onnx"
m = onnx.load(f"{D}/backbone_q4.onnx")
g = m.graph
init = {t.name: t for t in g.initializer}
gather = next(n for n in g.node if n.op_type == "Gather" and n.input[0] in init and len(init[n.input[0]].dims) == 2 and init[n.input[0]].dims[0] > 100000)
W = numpy_helper.to_array(init[gather.input[0]]).astype(np.float32)
scale = np.maximum(np.abs(W).max(1, keepdims=True), 1e-8) / 127.0
Wq = np.clip(np.round(W / scale), -127, 127).astype(np.int8)
print("embed", W.shape, "max abs err", float(np.abs(Wq * scale - W).max()))
g.initializer.remove(init[gather.input[0]])
g.initializer.extend([numpy_helper.from_array(Wq, "embed_q8"), numpy_helper.from_array(scale.astype(np.float32), "embed_scale")])
out = gather.output[0]; ids = gather.input[1]
gather.input[0] = "embed_q8"; gather.output[0] = "embed_q8_rows"
idx = list(g.node).index(gather)
new = [helper.make_node("Cast", ["embed_q8_rows"], ["embed_rows_f"], to=TensorProto.FLOAT),
       helper.make_node("Gather", ["embed_scale", ids], ["embed_row_scale"], axis=0),
       helper.make_node("Mul", ["embed_rows_f", "embed_row_scale"], [out])]
for k, n in enumerate(new): g.node.insert(idx + 1 + k, n)
onnx.save_model(m, f"{D}/kai_q4.onnx", save_as_external_data=True, all_tensors_to_one_file=True, location="kai_q4.onnx.data")
print("saved")
