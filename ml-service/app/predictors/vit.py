"""Predictor #2 — ViT-Tiny CIFAR-10 image classifier.

Serves the frozen ONNX export (no torch): onnxruntime + Pillow + numpy.
Loads lazily and non-fatally — a missing/broken artifact leaves the process up
with `model_loaded` False so the service can still serve demo mode.

Preprocessing mirrors the BundlePredictor contract in export.py:
  PIL Image → RGB → resize 96×96 → ToTensor → ImageNet normalisation → CHW float32.
No temperature calibration was applied to this model; score is raw softmax.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from app.schemas import ImageClassificationResult

if TYPE_CHECKING:
    import onnxruntime as ort

logger = logging.getLogger(__name__)

# Filename inside the export bundle.
_ONNX_FILE = "vit_best.onnx"

# Spatial resolution used during ViT-Tiny training.
_IMAGE_SIZE = 96

# ImageNet stats used during training (from export.py).
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)

# CIFAR-10 index → label (mirrors CIFAR10_CLASSES in export.py).
_CIFAR10_CLASSES = [
    "airplane",
    "automobile",
    "bird",
    "cat",
    "deer",
    "dog",
    "frog",
    "horse",
    "ship",
    "truck",
]


class ViTPredictor:
    """CIFAR-10 image classifier over a frozen ViT-Tiny ONNX export."""

    def __init__(self, model_id: str, artifact_dir: Path) -> None:
        self._model_id = model_id
        self._artifact_dir = artifact_dir

        # Populated by load(); stay None/False until a successful load.
        self._session: ort.InferenceSession | None = None
        self._input_name: str = "pixel_values"
        self._model_version: str = "unknown"
        self._loaded: bool = False

    # protocol surface

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def model_loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """Lazily load the ONNX session.

        Idempotent and non-fatal: if the artifact dir or ONNX file is
        missing/unreadable, log a warning, leave `model_loaded` False, and
        return without raising — the process stays up for demo mode.
        """
        if self._loaded:
            return

        onnx_path = self._artifact_dir / _ONNX_FILE

        if not onnx_path.is_file():
            logger.warning(
                "Artifact incomplete for %s at %s — serving without this model "
                "(model_loaded=False).",
                self._model_id,
                self._artifact_dir,
            )
            return

        try:
            import onnxruntime as ort

            self._session = ort.InferenceSession(
                str(onnx_path),
                providers=["CPUExecutionProvider"],
            )
            # Verify the input name matches the export contract; fall back to
            # the known export.py value if the graph differs unexpectedly.
            graph_input = self._session.get_inputs()[0].name
            if graph_input != self._input_name:
                logger.warning(
                    "Unexpected ONNX input name '%s' for %s — expected '%s'. "
                    "Using graph value.",
                    graph_input,
                    self._model_id,
                    self._input_name,
                )
                self._input_name = graph_input

            self._model_version = "1.0.0"
            self._loaded = True
            logger.info(
                "Loaded %s (version=%s, image_size=%d, %d classes).",
                self._model_id,
                self._model_version,
                _IMAGE_SIZE,
                len(_CIFAR10_CLASSES),
            )
        except Exception:
            logger.exception(
                "Failed to load %s — serving without this model.", self._model_id
            )
            self._reset()

    def predict(self, payload: str | bytes) -> ImageClassificationResult:
        """Classify one image supplied as raw bytes.

        Precondition: model_loaded is True (the router guards this).
        Pipeline: bytes → PIL RGB → resize 96×96 → CHW float32 → ImageNet
        normalise → ONNX Runtime → softmax → label + score.
        """
        assert self._session is not None
        assert isinstance(payload, bytes)

        from PIL import Image

        image = Image.open(io.BytesIO(payload)).convert("RGB")
        arr = self._preprocess(image)

        outputs = self._session.run(None, {self._input_name: arr})
        logits = np.asarray(outputs[0])[0]  # shape (10,)
        probs = self._softmax(logits)

        idx = int(np.argmax(probs))
        return ImageClassificationResult(
            label=_CIFAR10_CLASSES[idx],
            score=round(float(probs[idx]), 4),
        )

    # internals

    @staticmethod
    def _preprocess(image: object) -> np.ndarray:
        """PIL Image → normalised CHW float32 array with batch dim."""
        from PIL import Image

        img = image if isinstance(image, Image.Image) else image  # type: ignore[redundant-expr]
        img = img.resize((_IMAGE_SIZE, _IMAGE_SIZE))  # type: ignore[union-attr]

        arr = np.asarray(img, dtype=np.float32) / 255.0  # HWC [0,1]
        arr = arr.transpose(2, 0, 1)  # CHW
        arr = (arr - _MEAN) / _STD  # ImageNet normalise
        return arr[np.newaxis]  # NCHW batch dim

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        """Numerically stable softmax over a 1-D logit vector."""
        e = np.exp(x - np.max(x))
        return e / e.sum()

    def _reset(self) -> None:
        self._session = None
        self._input_name = "pixel_values"
        self._loaded = False
