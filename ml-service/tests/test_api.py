"""API contract tests via FastAPI's TestClient.

Covers the error contract this service owns — 404 (unknown model), 422 (input
below MIN_CHARS after cleaning), 503 (model registered but not loaded) — plus
liveness, readiness, and the response-envelope shape on the demo path.

A live 200 prediction needs the ~268 MB artifact mounted, which is gitignored
and absent in CI, so that case is skipped unless the bundle is present.
"""

from __future__ import annotations

import pytest
from app import registry
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

_LONG_COMPLAINT = "My credit card was charged twice for the same transaction."


def test_root_liveness():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json() == {"service": "ml-service", "status": "ok"}


def test_health_liveness():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy"}


def test_readiness_reports_per_model(empty_artifacts):
    r = client.get("/health/ready")
    assert r.status_code == 200
    body = r.json()
    assert "ready" in body
    assert "distilbert-cfpb" in body["models"]
    assert body["models"]["distilbert-cfpb"]["loaded"] is False
    # With no artifact mounted, the service is not ready.
    assert body["ready"] is False


def test_predict_unknown_model_404(empty_artifacts):
    r = client.post("/v1/models/bogus/predict", json={"text": _LONG_COMPLAINT})
    assert r.status_code == 404


def test_predict_too_short_422(empty_artifacts):
    r = client.post("/v1/models/distilbert-cfpb/predict", json={"text": "XX"})
    assert r.status_code == 422


def test_predict_not_loaded_503(empty_artifacts):
    r = client.post(
        "/v1/models/distilbert-cfpb/predict", json={"text": _LONG_COMPLAINT}
    )
    assert r.status_code == 503


def _artifact_present() -> bool:
    """True only if the real distilbert-cfpb bundle is at the default path."""
    bundle = registry.artifacts_dir() / "nlp" / "distilbert-cfpb" / "model.onnx"
    return bundle.is_file()


@pytest.mark.skipif(
    not _artifact_present(),
    reason="distilbert-cfpb artifact not mounted; live inference test skipped.",
)
def test_predict_success_envelope():
    """Live inference — runs only when the artifact is present locally."""
    registry._INSTANCES.clear()
    r = client.post(
        "/v1/models/distilbert-cfpb/predict", json={"text": _LONG_COMPLAINT}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["model_id"] == "distilbert-cfpb"
    assert set(body["result"].keys()) == {
        "label",
        "score",
        "calibrated",
        "confidence_band",
    }
    assert body["meta"]["demo_mode"] is False
    assert body["result"]["confidence_band"] in {"low", "high"}
