from fastapi import APIRouter

from app import registry

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check() -> dict:
    """Liveness — the process is up. This is the Docker HEALTHCHECK target."""
    return {"status": "healthy"}


@router.get("/ready")
async def readiness_check() -> dict:
    """Readiness — reports model_loaded per registered model.

    Informational (always 200): the per-request 503 on /predict is what gates
    demo mode. This endpoint lets operators see, at a glance, which models have
    their artifacts loaded. Querying a predictor constructs+lazy-loads it via
    the registry (cached thereafter), so this also warms the registry.
    """
    models = {}
    all_ready = True
    for model_id in registry.list_model_ids():
        predictor = registry.get_predictor(model_id)
        loaded = predictor.model_loaded
        models[model_id] = {
            "loaded": loaded,
            "model_version": predictor.model_version,
        }
        all_ready = all_ready and loaded
    return {"ready": all_ready, "models": models}
