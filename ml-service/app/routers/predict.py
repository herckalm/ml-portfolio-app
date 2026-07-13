"""Inference routes — POST /v1/models/{model_id}/predict (text)
                      POST /v1/models/{model_id}/predict-image (CV).

Enforces the error contract this service owns (FastAPI-native; the backend
proxy reshapes these into RFC 7807 + demo mode):
  * unknown model_id                -> 404
  * input below MIN_CHARS (text)    -> 422
  * unsupported media type (image)  -> 415
  * model registered but not loaded -> 503 (backend converts to demo 200)

On success, wraps the predictor's result in the uniform envelope.
"""

from fastapi import APIRouter, HTTPException, UploadFile, status

from app import registry
from app.cleaning import MIN_CHARS, clean_text, is_valid
from app.schemas import PredictRequest, PredictResponse

router = APIRouter(prefix="/v1/models", tags=["inference"])

# Accepted MIME types for the image endpoint.
_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/{model_id}/predict", response_model=PredictResponse)
async def predict(model_id: str, request: PredictRequest) -> PredictResponse:
    # 404 — unknown model.
    if not registry.is_registered(model_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown model_id '{model_id}'.",
        )

    # 422 — input fails the cleaning contract's MIN_CHARS floor. We validate on
    # the *cleaned* text, since that is what the model would actually see.
    cleaned = clean_text(request.text)
    if not is_valid(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"Input too short after cleaning: need at least {MIN_CHARS} "
                f"characters, got {len(cleaned)}."
            ),
        )

    # 503 — model registered but its artifact isn't loaded. The backend proxy
    # converts this into a demo-mode 200 envelope.
    predictor = registry.get_predictor(model_id)
    if not predictor.model_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Model '{model_id}' is not loaded (artifact unavailable).",
        )

    # Success — run inference and wrap in the uniform envelope.
    result = predictor.predict(request.text)
    return PredictResponse(
        model_id=predictor.model_id,
        model_version=predictor.model_version,
        result=result,
        meta={"demo_mode": False, "input_chars": len(cleaned)},
    )


@router.post("/{model_id}/predict-image", response_model=PredictResponse)
async def predict_image(model_id: str, file: UploadFile) -> PredictResponse:
    # 404 — unknown model.
    if not registry.is_registered(model_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown model_id '{model_id}'.",
        )

    # 415 — reject non-image uploads early before reading the body.
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported media type '{file.content_type}'. "
                f"Accepted: {sorted(_ALLOWED_IMAGE_TYPES)}."
            ),
        )

    # 503 — model registered but its artifact isn't loaded.
    predictor = registry.get_predictor(model_id)
    if not predictor.model_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Model '{model_id}' is not loaded (artifact unavailable).",
        )

    # Read the upload and dispatch — bytes go straight to the predictor.
    image_bytes = await file.read()
    result = predictor.predict(image_bytes)
    return PredictResponse(
        model_id=predictor.model_id,
        model_version=predictor.model_version,
        result=result,
        meta={"demo_mode": False, "file_bytes": len(image_bytes)},
    )
