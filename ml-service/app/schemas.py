"""Pydantic contracts for the inference layer.

Two layers:
  * The *uniform envelope* (PredictResponse) — identical across all models,
    so the backend can proxy any predictor through one code path.
  * Per-model result payloads (e.g. ClassificationResult) — model-specific,
    carried inside the envelope's `result` field.
"""

from enum import Enum
from typing import Union

from pydantic import BaseModel, ConfigDict, Field

# Requests


class PredictRequest(BaseModel):
    """Request body for POST /v1/models/{model_id}/predict.

    Generic over models for now: text-in is the only modality shipping
    (DistilBERT). Future predictors with different inputs can introduce
    their own request models without touching the envelope.
    """

    text: str = Field(
        ...,
        description="Raw input text. Cleaning/validation is applied server-side.",
    )


# per-model result payloads


class ConfidenceBand(str, Enum):
    """Coarse, presentation-facing confidence bucket.

    The frontend renders this band — never the raw calibrated score — so the
    UI cannot invent its own thresholds that drift from model calibration.
    """

    low = "low"
    high = "high"


class ClassificationResult(BaseModel):
    """DistilBERT (predictor #1) result payload.

    `score` is the calibrated probability for `label` (honest model output,
    used for logging/monitoring). `confidence_band` is the de-risked bucket
    shown to users. `calibrated` records whether temperature scaling was
    applied, so consumers can tell raw from calibrated outputs.
    """

    label: str = Field(..., description="Predicted class label.")
    score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Calibrated probability for `label`.",
    )
    calibrated: bool = Field(
        ...,
        description="True if temperature scaling was applied to the score.",
    )
    confidence_band: ConfidenceBand = Field(
        ...,
        description="Presentation-facing bucket derived from `score`.",
    )


# union of all per-model result shapes. Extend as predictors are added.
PredictionResult = Union[ClassificationResult]


# uniform response envelope


class PredictResponse(BaseModel):
    """Uniform envelope returned by every predictor.

    Shape is constant across all four projects; only `result` varies by model.
    """

    # The `model_` field names below are fixed by the README contract; opt out
    # of Pydantic's protected-namespace guard so they don't emit warnings.
    model_config = ConfigDict(protected_namespaces=())

    model_id: str = Field(..., description="Registry key of the predictor used.")
    model_version: str = Field(
        ..., description="Version string of the served artifact."
    )
    result: PredictionResult = Field(
        ..., description="Model-specific prediction payload."
    )
    meta: dict = Field(
        default_factory=dict,
        description="Non-contractual diagnostics (timings, input length, etc.).",
    )
