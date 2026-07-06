"""One-time builder for the CI real-pull fixture bundle.

Produces a tiny but genuinely loadable DistilBERT-shaped bundle: an ONNX graph
taking (input_ids, attention_mask) -> 2-label logits, a real WordLevel
tokenizer, a config with id2label, and a calibration file. The graph is
nonsense numerically; it exists only so onnxruntime.InferenceSession and
Tokenizer.from_file succeed, which is exactly what flips model_loaded=True.

Run locally (NOT in CI):
    uv run --with onnx python ml-service/tests/fixtures/build_mini_bundle.py
Commit the resulting distilbert-cfpb-mini/ directory.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace

OUT = Path(__file__).parent / "distilbert-cfpb-mini"
VOCAB_SIZE = 16
NUM_LABELS = 2
LABELS = {0: "Credit card", 1: "Mortgage"}


def build_onnx(path: Path) -> None:
    """A minimal graph: mean-pool a one-hot of input_ids, apply a fixed linear
    head -> (1, NUM_LABELS) logits. attention_mask is accepted but unused
    (Identity into a dead output-free branch would complicate things; instead
    we consume it via Mul-by-zero-add so both declared inputs are real)."""
    input_ids = helper.make_tensor_value_info(
        "input_ids", TensorProto.INT64, ["batch", "seq"]
    )
    attention_mask = helper.make_tensor_value_info(
        "attention_mask", TensorProto.INT64, ["batch", "seq"]
    )
    logits = helper.make_tensor_value_info(
        "logits", TensorProto.FLOAT, ["batch", NUM_LABELS]
    )

    # Constant weight (VOCAB_SIZE -> NUM_LABELS) and bias.
    rng = np.random.default_rng(0)
    W = numpy_helper.from_array(
        rng.standard_normal((VOCAB_SIZE, NUM_LABELS)).astype(np.float32), name="W"
    )
    B = numpy_helper.from_array(np.zeros((NUM_LABELS,), dtype=np.float32), name="B")
    depth = numpy_helper.from_array(np.array(VOCAB_SIZE, dtype=np.int64), name="depth")
    on_off = numpy_helper.from_array(
        np.array([0.0, 1.0], dtype=np.float32), name="on_off"
    )
    axis1 = numpy_helper.from_array(np.array([1], dtype=np.int64), name="axis1")
    mask_f_scale = numpy_helper.from_array(
        np.array(0.0, dtype=np.float32), name="mask_f_scale"
    )

    nodes = [
        # one-hot(input_ids) -> (batch, seq, VOCAB_SIZE)
        helper.make_node(
            "OneHot", ["input_ids", "depth", "on_off"], ["onehot"], axis=-1
        ),
        # mean over seq -> (batch, VOCAB_SIZE)
        helper.make_node("ReduceMean", ["onehot"], ["pooled"], axes=[1], keepdims=0),
        # linear head -> (batch, NUM_LABELS)
        helper.make_node("MatMul", ["pooled", "W"], ["mm"]),
        helper.make_node("Add", ["mm", "B"], ["head"]),
        # consume attention_mask so it's a real input: cast, sum, *0, broadcast-add
        helper.make_node("Cast", ["attention_mask"], ["mask_f"], to=TensorProto.FLOAT),
        helper.make_node("ReduceSum", ["mask_f", "axis1"], ["mask_sum"], keepdims=1),
        helper.make_node("Mul", ["mask_sum", "mask_f_scale"], ["mask_zero"]),
        helper.make_node("Add", ["head", "mask_zero"], ["logits"]),
    ]

    graph = helper.make_graph(
        nodes,
        "mini-distilbert",
        [input_ids, attention_mask],
        [logits],
        initializer=[W, B, depth, on_off, axis1, mask_f_scale],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 9  # onnxruntime-compatible
    onnx.checker.check_model(model)
    onnx.save(model, str(path))


def build_tokenizer(path: Path) -> None:
    vocab = {"[UNK]": 0}
    for i in range(1, VOCAB_SIZE):
        vocab[f"tok{i}"] = i
    tok = Tokenizer(WordLevel(vocab=vocab, unk_token="[UNK]"))
    tok.pre_tokenizer = Whitespace()
    tok.save(str(path))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    build_onnx(OUT / "model.onnx")
    build_tokenizer(OUT / "tokenizer.json")
    (OUT / "config.json").write_text(
        json.dumps({"id2label": {str(k): v for k, v in LABELS.items()}}, indent=2)
    )
    (OUT / "calibration.json").write_text(
        json.dumps(
            {"temperature": 2.0, "band_threshold": 0.75, "model_version": "0.0.1-ci"},
            indent=2,
        )
    )
    print(f"wrote bundle to {OUT}")
    for f in sorted(OUT.iterdir()):
        print(f"  {f.name}  ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
