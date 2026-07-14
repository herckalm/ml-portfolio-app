#!/bin/sh
# entrypoint.sh — container startup wrapper for ml-service.
# Pulls model artifacts from R2 into the Fly volume on first boot,
# skips if already present, then hands off to uvicorn.
set -e

NLP_MARKER="/app/artifacts/nlp/distilbert-cfpb/SHA256SUMS"
CV_MARKER="/app/artifacts/cv/vit-cifar10/SHA256SUMS"

if [ ! -f "$NLP_MARKER" ] || [ ! -f "$CV_MARKER" ]; then
  echo "Artifacts absent — running artifact-init..."
  /bin/sh /app/scripts/artifact-init.sh
else
  echo "Artifacts already present — skipping download."
fi

exec uvicorn app.main:app --host "${UVICORN_HOST:-0.0.0.0}" --port 8000