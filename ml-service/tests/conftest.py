"""Shared test fixtures.

The key fixture points ARTIFACTS_DIR at a guaranteed-empty temp dir and resets
the registry's instance cache, so every test sees models as *not loaded*
regardless of whether the real 268 MB bundle is mounted on this machine. This
makes the 404/422/503 contract tests deterministic in CI and locally alike.
"""

from __future__ import annotations

import pytest
from app import registry


@pytest.fixture
def empty_artifacts(tmp_path, monkeypatch):
    """Force the registry to resolve artifacts to an empty dir, uncached."""
    monkeypatch.setenv("ARTIFACTS_DIR", str(tmp_path))
    # Clear any predictors cached by earlier tests/imports so they re-resolve
    # against the now-empty ARTIFACTS_DIR.
    registry._INSTANCES.clear()
    yield tmp_path
    registry._INSTANCES.clear()
