"""Predictor #1 — DistilBERT CFPB consumer-complaint classifier.

Serves the frozen ONNX export (no torch): onnxruntime + tokenizers + numpy.
Loads lazily and non-fatally — a missing/broken artifact leaves the process up
with `model_loaded` False so the service can still serve demo mode.

Calibration: logits are divided by the artifact's temperature before softmax
(Guo et al., 2017). Argmax is invariant, so only the confidence score is
recalibrated, not the predicted label.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from app.cleaning import clean_text
from app.schemas import ClassificationResult, ConfidenceBand

if TYPE_CHECKING:
    import onnxruntime as ort
    from tokenizers import Tokenizer

logger = logging.getLogger(__name__)

# Filenames inside the export bundle (the mounted artifact dir).
_ONNX_FILE = "model.onnx"
_TOKENIZER_FILE = "tokenizer.json"
_CONFIG_FILE = "config.json"
_CALIBRATION_FILE = "calibration.json"

# Service-side default when the artifact carries no `band_threshold`.
# Calibrated score at/above this → "high" confidence, else "low".
_DEFAULT_BAND_THRESHOLD = 0.75

# DistilBERT has no segment embeddings: inputs are input_ids + attention_mask.
_MAX_SEQ_LEN = 512


class DistilBertPredictor:
    """CFPB complaint-category classifier over a frozen ONNX export."""

    def __init__(self, model_id: str, artifact_dir: Path) -> None:
        self._model_id = model_id
        self._artifact_dir = artifact_dir

        # Populated by load(); stay None/False until a successful load.
        self._session: ort.InferenceSession | None = None
        self._tokenizer: Tokenizer | None = None
        self._id2label: dict[int, str] = {}
        self._input_names: list[str] = []
        self._temperature: float = 1.0
        self._calibrated: bool = False
        self._band_threshold: float = _DEFAULT_BAND_THRESHOLD
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
        """Lazily load the ONNX session, tokenizer, labels, and calibration.

        Idempotent and non-fatal: if the artifact dir or any required file is
        missing/unreadable, log a warning, leave `model_loaded` False, and
        return without raising — the process stays up for demo mode.
        """
        if self._loaded:
            return

        onnx_path = self._artifact_dir / _ONNX_FILE
        tok_path = self._artifact_dir / _TOKENIZER_FILE
        cfg_path = self._artifact_dir / _CONFIG_FILE

        if not (onnx_path.is_file() and tok_path.is_file() and cfg_path.is_file()):
            logger.warning(
                "Artifact incomplete for %s at %s — serving without this model "
                "(model_loaded=False).",
                self._model_id,
                self._artifact_dir,
            )
            return

        try:
            # Heavy deps imported lazily so a missing artifact never blocks
            # process startup, and import cost is paid only on first load.
            import onnxruntime as ort
            from tokenizers import Tokenizer

            self._tokenizer = Tokenizer.from_file(str(tok_path))
            self._tokenizer.enable_truncation(max_length=_MAX_SEQ_LEN)

            self._session = ort.InferenceSession(
                str(onnx_path),
                providers=["CPUExecutionProvider"],
            )
            self._input_names = [i.name for i in self._session.get_inputs()]

            with cfg_path.open(encoding="utf-8") as fh:
                cfg = json.load(fh)
            # id2label keys are strings in JSON; coerce to int indices.
            self._id2label = {int(k): v for k, v in cfg["id2label"].items()}

            self._load_calibration()
            self._model_version = self._read_version()

            self._loaded = True
            logger.info(
                "Loaded %s (version=%s, T=%.4f, calibrated=%s, "
                "band_threshold=%.2f, %d labels).",
                self._model_id,
                self._model_version,
                self._temperature,
                self._calibrated,
                self._band_threshold,
                len(self._id2label),
            )
        except Exception:
            # Unexpected failure during load: stay up, log with traceback.
            logger.exception(
                "Failed to load %s — serving without this model.", self._model_id
            )
            self._reset()

    def predict(self, text: str) -> ClassificationResult:
        """Classify one complaint narrative.

        Precondition: model_loaded is True (the router guards this). Cleaning
        and the MIN_CHARS floor are enforced by the router before dispatch, so
        `text` arrives already validated; we clean again defensively
        (clean_text is idempotent).
        """

        # Precondition (router-enforced): the model is loaded. Assert it so the
        # type-checker narrows _tokenizer/_session from Optional, and so a
        # contract violation fails loudly rather than as an AttributeError.
        assert self._tokenizer is not None and self._session is not None

        cleaned = clean_text(text)

        enc = self._tokenizer.encode(cleaned)

        input_ids = np.asarray([enc.ids], dtype=np.int64)
        attention_mask = np.asarray([enc.attention_mask], dtype=np.int64)

        feeds = {}
        for name in self._input_names:
            if name == "input_ids":
                feeds[name] = input_ids
            elif name == "attention_mask":
                feeds[name] = attention_mask

        # ORT's run() return type is a broad union; this graph yields a single
        # dense float array of logits. Cast so the checker accepts indexing.
        outputs = self._session.run(None, feeds)
        logits = np.asarray(outputs[0])[0]  # shape (num_labels,)
        probs = self._softmax(logits / self._temperature)

        idx = int(np.argmax(probs))
        score = float(probs[idx])
        label = self._id2label[idx]
        band = (
            ConfidenceBand.high if score >= self._band_threshold else ConfidenceBand.low
        )

        return ClassificationResult(
            label=label,
            score=score,
            calibrated=self._calibrated,
            confidence_band=band,
        )

    # internals

    def _load_calibration(self) -> None:
        """Read temperature + optional band_threshold from calibration.json.

        Missing file or keys fall back to safe defaults (T=1.0 → no-op scaling,
        default service threshold) so a partial artifact still serves. The
        `calibrated` flag is True only when a real temperature (≠ 1.0) applies.
        """
        cal_path = self._artifact_dir / _CALIBRATION_FILE
        if not cal_path.is_file():
            logger.warning(
                "No calibration.json for %s — T=1.0 (uncalibrated), default band.",
                self._model_id,
            )
            return
        with cal_path.open(encoding="utf-8") as fh:
            cal = json.load(fh)
        self._temperature = float(cal.get("temperature", 1.0))
        self._calibrated = self._temperature != 1.0
        # Artifact owns the threshold when present; else service default.
        self._band_threshold = float(cal.get("band_threshold", _DEFAULT_BAND_THRESHOLD))

    def _read_version(self) -> str:
        """Version string for the envelope. Prefer an explicit artifact field;
        fall back to the contract's documented 1.0.0 if none is present."""
        cal_path = self._artifact_dir / _CALIBRATION_FILE
        if cal_path.is_file():
            with cal_path.open(encoding="utf-8") as fh:
                cal = json.load(fh)
            if "model_version" in cal:
                return str(cal["model_version"])
        return "1.0.0"

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        """Numerically stable softmax over a 1-D logit vector."""
        z = x - np.max(x)
        e = np.exp(z)
        return e / e.sum()

    def _reset(self) -> None:
        self._session = None
        self._tokenizer = None
        self._id2label = {}
        self._input_names = []
        self._calibrated = False
        self._loaded = False
