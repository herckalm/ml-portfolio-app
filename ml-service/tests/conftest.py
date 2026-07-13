"""Shared test fixtures.

The key fixture points ARTIFACTS_DIR at a guaranteed-empty temp dir and resets
the registry's instance cache, so every test sees models as *not loaded*
regardless of whether the real bundle is mounted on this machine. This makes
the 404/422/503 contract tests deterministic in CI and locally alike.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from app import registry


@pytest.fixture
def empty_artifacts(tmp_path, monkeypatch):
    """Force the registry to resolve artifacts to an empty dir, uncached."""
    monkeypatch.setenv("ARTIFACTS_DIR", str(tmp_path))
    registry._INSTANCES.clear()
    yield tmp_path
    registry._INSTANCES.clear()


@pytest.fixture
def live_artifacts(monkeypatch):
    """Point the registry at a real NLP bundle for live-inference tests.

    Opt-in via the LIVE_ARTIFACTS_DIR env var, which must name a directory
    containing nlp/distilbert-cfpb/model.onnx. When unset or the bundle is
    absent, the test using this fixture is skipped.
    """
    root = os.environ.get("LIVE_ARTIFACTS_DIR")
    if not root:
        pytest.skip("LIVE_ARTIFACTS_DIR not set; live inference test skipped.")
    bundle = Path(root) / "nlp" / "distilbert-cfpb" / "model.onnx"
    if not bundle.is_file():
        pytest.skip(f"No distilbert-cfpb bundle under {root}; skipped.")
    monkeypatch.setenv("ARTIFACTS_DIR", root)
    registry._INSTANCES.clear()
    yield Path(root)
    registry._INSTANCES.clear()


@pytest.fixture
def live_cv_artifacts(monkeypatch):
    """Point the registry at a real CV bundle for live-inference tests.

    Opt-in via the LIVE_ARTIFACTS_DIR env var, which must name a directory
    containing cv/vit-cifar10/vit_best.onnx. When unset or the bundle is
    absent, the test using this fixture is skipped.
    """
    root = os.environ.get("LIVE_ARTIFACTS_DIR")
    if not root:
        pytest.skip("LIVE_ARTIFACTS_DIR not set; live CV inference test skipped.")
    bundle = Path(root) / "cv" / "vit-cifar10" / "vit_best.onnx"
    if not bundle.is_file():
        pytest.skip(f"No vit-cifar10 bundle under {root}; skipped.")
    monkeypatch.setenv("ARTIFACTS_DIR", root)
    registry._INSTANCES.clear()
    yield Path(root)
    registry._INSTANCES.clear()
