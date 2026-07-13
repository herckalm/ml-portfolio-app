"""Model registry — maps a public model_id to a lazily-loaded Predictor.

Adding a model is adding one row here plus a predictor module; the service
itself doesn't change. Each row decouples three things that can evolve
independently:
  * model_id     — the public URL identifier (/v1/models/{model_id}/predict)
  * relative_path — where the artifact lives under ARTIFACTS_DIR (domain layout)
  * predictor    — the class implementing the Predictor Protocol

Predictors are constructed and loaded on first request and cached thereafter.
Loading is non-fatal: a missing artifact yields a cached, unloaded predictor
(model_loaded=False) rather than an error, so the service degrades to demo mode.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from app.predictors import Predictor
from app.predictors.distilbert import DistilBertPredictor
from app.predictors.vit import ViTPredictor

logger = logging.getLogger(__name__)

# Default artifacts root when ARTIFACTS_DIR is unset (local dev). Resolved
# relative to the ml-service package root, i.e. ml-service/artifacts/.
_DEFAULT_ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"


@dataclass(frozen=True)
class ModelRegistration:
    """A single registered model: its id, on-disk path, and predictor factory."""

    model_id: str
    relative_path: str
    factory: Callable[[str, Path], Predictor]


# The registry. One row per served model.
_REGISTRATIONS: dict[str, ModelRegistration] = {
    "distilbert-cfpb": ModelRegistration(
        model_id="distilbert-cfpb",
        relative_path="nlp/distilbert-cfpb",
        factory=DistilBertPredictor,
    ),
    "vit-cifar10": ModelRegistration(
        model_id="vit-cifar10",
        relative_path="cv/vit-cifar10",
        factory=ViTPredictor,
    ),
}

# Cache of constructed predictors, keyed by model_id. Populated on first get().
_INSTANCES: dict[str, Predictor] = {}


def artifacts_dir() -> Path:
    """Resolve the artifacts root from ARTIFACTS_DIR, else the dev default."""
    env = os.environ.get("ARTIFACTS_DIR")
    return Path(env) if env else _DEFAULT_ARTIFACTS_DIR


def list_model_ids() -> list[str]:
    """All registered model_ids (for the readiness endpoint)."""
    return list(_REGISTRATIONS.keys())


def is_registered(model_id: str) -> bool:
    return model_id in _REGISTRATIONS


def get_predictor(model_id: str) -> Predictor:
    """Return the cached predictor for model_id, constructing+loading on first use.

    Raises KeyError if the model_id is not registered (the router translates
    that into a 404). Construction and load() are non-fatal w.r.t. a missing
    artifact: the returned predictor may have model_loaded=False, which the
    router uses to gate demo mode.
    """
    if model_id in _INSTANCES:
        return _INSTANCES[model_id]

    reg = _REGISTRATIONS[model_id]  # KeyError → unknown model → router 404s
    artifact_dir = artifacts_dir() / reg.relative_path
    predictor = reg.factory(reg.model_id, artifact_dir)
    predictor.load()  # non-fatal; sets model_loaded
    _INSTANCES[model_id] = predictor

    logger.info(
        "Registered predictor %s (artifact_dir=%s, model_loaded=%s).",
        model_id,
        artifact_dir,
        predictor.model_loaded,
    )
    return predictor
