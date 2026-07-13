"""The Predictor Protocol — the behavioral contract every model implements.

Structural (`typing.Protocol`), not an ABC: predictors range from local ONNX
sessions to an external LLM API (no local weights). They share no sensible
base class, but they do share this interface, so structural typing lets the
registry treat them uniformly without an inheritance hierarchy.

Lifecycle contract:
  * Construction is cheap and never touches the artifact (lazy).
  * `load()` is idempotent and *non-fatal*: a missing/broken artifact leaves
    the process up with `model_loaded` False — it must not raise for that case.
  * `predict()` is only called when `model_loaded` is True (the router guards
    this), so implementations may assume readiness inside `predict()`.
"""

from typing import Protocol, runtime_checkable

from app.schemas import PredictionResult


@runtime_checkable
class Predictor(Protocol):
    """Behavioral contract for a single served model."""

    @property
    def model_id(self) -> str:
        """Registry key (e.g. 'distilbert-cfpb')."""
        ...

    @property
    def model_version(self) -> str:
        """Version string of the loaded artifact."""
        ...

    @property
    def model_loaded(self) -> bool:
        """True once the artifact is loaded and the predictor can serve.

        False before `load()` runs, or after a non-fatal load failure
        (e.g. missing artifact). Read by the registry and the readiness
        endpoint to gate demo mode.
        """
        ...

    def load(self) -> None:
        """
        A missing or unreadable artifact must NOT raise: set internal state so
        `model_loaded` reports False and let the process stay up. Raising is
        reserved for genuinely unexpected errors, not the expected
        artifact-absent case.
        """
        ...

    def predict(self, payload: str | bytes) -> PredictionResult:
        """Run inference on the input payload.

        `str` for text-based models (NLP), `bytes` for binary models (CV).
        Precondition: `model_loaded` is True (the router checks this before
        dispatch), so implementations need not re-check readiness here.
        Returns a per-model payload that fits the envelope's `result` field.
        """
        ...
