"""backbone.onnx (fp32) -> backbone_q4.onnx: 4-bit MatMul weights (block 32, symmetric) via ORT's MatMulNBits."""
import onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
D = "/run/media/neo/miki/feedfilter/onnx"
m = onnx.load(f"{D}/backbone.onnx")
q = MatMulNBitsQuantizer(m, block_size=32, is_symmetric=True, accuracy_level=4)
q.process()
onnx.save_model(q.model.model, f"{D}/backbone_q4.onnx", save_as_external_data=True, all_tensors_to_one_file=True, location="backbone_q4.onnx.data")
print("q4 saved")
