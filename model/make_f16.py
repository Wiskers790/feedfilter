"""backbone.onnx (fp32) -> kai_q4f16.onnx: fp16 activations + 4-bit MatMul weights + int8 embedding rows.
Same recipe as kai_q4 (quantize.py + shrink_embed.py), with an fp16 conversion first. IO stays int64 / fp32."""
import numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto
from onnxconverter_common import float16
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
D = "/run/media/neo/miki/feedfilter/onnx"
m = onnx.load(f"{D}/backbone.onnx")
# RMSNorm squares activations: keep every *norm* node in fp32 (fp16 would overflow); the converter adds the casts.
block = [n.name for n in m.graph.node if "norm" in n.name.lower()]
m = float16.convert_float_to_float16(m, keep_io_types=True, disable_shape_infer=True, node_block_list=block)
print("fp16 converted")
q = MatMulNBitsQuantizer(m, block_size=32, is_symmetric=True, accuracy_level=4); q.process(); m = q.model.model
print("q4 quantized")
g = m.graph; init = {t.name: t for t in g.initializer}
gather = next(n for n in g.node if n.op_type == "Gather" and n.input[0] in init and len(init[n.input[0]].dims) == 2 and init[n.input[0]].dims[0] > 100000)
W = numpy_helper.to_array(init[gather.input[0]]).astype(np.float32)
scale = np.maximum(np.abs(W).max(1, keepdims=True), 1e-8) / 127.0
Wq = np.clip(np.round(W / scale), -127, 127).astype(np.int8)
g.initializer.remove(init[gather.input[0]])
g.initializer.extend([numpy_helper.from_array(Wq, "embed_q8"), numpy_helper.from_array(scale.astype(np.float16), "embed_scale")])
out, ids = gather.output[0], gather.input[1]
gather.input[0] = "embed_q8"; gather.output[0] = "embed_q8_rows"
idx = list(g.node).index(gather)
for k, n in enumerate([helper.make_node("Cast", ["embed_q8_rows"], ["embed_rows_h"], to=TensorProto.FLOAT16),
                       helper.make_node("Gather", ["embed_scale", ids], ["embed_row_scale"], axis=0),
                       helper.make_node("Mul", ["embed_rows_h", "embed_row_scale"], [out])]):
    g.node.insert(idx + 1 + k, n)
onnx.save_model(m, f"{D}/kai_q4f16.onnx", save_as_external_data=True, all_tensors_to_one_file=True, location="kai_q4f16.onnx.data")
print("saved")
