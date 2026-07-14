
# builder: resolve deps into a .venv with uv
FROM python:3.12-slim-bookworm AS builder

# Pull the uv binary from Astral's official image — no pip-installing uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# UV_COMPILE_BYTECODE: precompile .pyc at build time → faster cold start.
# UV_LINK_MODE=copy: copy packages into the venv instead of hardlinking
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# This layer re-runs only when uv.lock / pyproject.toml change —
# same caching idea as `dotnet restore` in the backend.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# runtime: just Python + the built venv + source
FROM python:3.12-slim-bookworm AS runtime

# Pull mc (MinIO client) for artifact-init release command.
COPY --from=minio/mc:RELEASE.2025-04-16T18-13-26Z /usr/bin/mc /usr/local/bin/mc

# Create a non-root user to run the app.
RUN useradd --create-home --uid 1001 appuser
WORKDIR /app

# Copy the whole built tree (venv + source) from the builder, owned by appuser.
# uv itself is NOT copied — it's only needed to build, not to run.
COPY --from=builder --chown=appuser:appuser /app /app

# Copy artifact-init script (used as Fly release command).
COPY --chown=appuser:appuser scripts/artifact-init.sh /app/scripts/artifact-init.sh
RUN chmod +x /app/scripts/artifact-init.sh

# Put the venv's binaries on PATH so `uvicorn` resolves without `uv run`.
ENV PATH="/app/.venv/bin:$PATH"

# Ensure the artifact mount point is owned by appuser (Fly volumes mount as root).
RUN mkdir -p /app/artifacts && chown appuser:appuser /app/artifacts

USER appuser
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]