#!/bin/sh
# artifact-init.sh — Fly release command for ml-service.
# Pulls model artifacts from R2 (or any S3-compatible store) into the
# Fly volume at /app/artifacts, then verifies SHA256 checksums.
# Tolerant by contract: a missing prefix logs and exits 0 (demo mode).
set -e

mc alias set "$MC_ALIAS_NAME" "$MC_ALIAS_URL" "$MC_ACCESS_KEY" "$MC_SECRET_KEY"

# --- NLP: distilbert-cfpb ---
NLP_SRC="$MC_ALIAS_NAME/$ARTIFACT_BUCKET/nlp/distilbert-cfpb/$ARTIFACT_VERSION/"
if mc stat "${NLP_SRC}model.onnx" >/dev/null 2>&1; then
  mkdir -p /app/artifacts/nlp/distilbert-cfpb
  mc cp --recursive "$NLP_SRC" /app/artifacts/nlp/distilbert-cfpb/
  cd /app/artifacts/nlp/distilbert-cfpb
  sha256sum -c SHA256SUMS
  echo "nlp artifact pulled and verified"
else
  echo "nlp artifact prefix absent ($NLP_SRC) — leaving demo mode"
fi

# --- CV: vit-cifar10 ---
CV_SRC="$MC_ALIAS_NAME/$ARTIFACT_BUCKET/cv/vit-cifar10/$ARTIFACT_VERSION/"
if mc stat "${CV_SRC}vit_best.onnx" >/dev/null 2>&1; then
  mkdir -p /app/artifacts/cv/vit-cifar10
  mc cp --recursive "$CV_SRC" /app/artifacts/cv/vit-cifar10/
  cd /app/artifacts/cv/vit-cifar10
  sha256sum -c SHA256SUMS
  echo "cv artifact pulled and verified"
else
  echo "cv artifact prefix absent ($CV_SRC) — leaving demo mode"
fi