# One image for every deployment (staging, production): FastAPI serves the API, the
# WebSocket position hub and the built web app on a single port. Behaviour per environment
# comes from runtime variables (SYNCOPATE_ENV, DATA_DIR, ...); see core/src/syncopate/server.py.

# ---- Web app build ---------------------------------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# ---- Runtime ---------------------------------------------------------------------------
FROM python:3.12-slim

# ffmpeg decodes M4A/AAC uploads.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

# Hugging Face Spaces run containers as uid 1000.
RUN useradd -m -u 1000 user
USER user
WORKDIR /home/user/app
ENV HOME=/home/user \
    PATH=/home/user/app/.venv/bin:$PATH \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    TORCH_HOME=/home/user/models/torch \
    HF_HOME=/home/user/models/hf

# Build profile: "dev" (everything, incl. non-commercial MMS_FA and HT Demucs) or "commercial"
# (only artifacts in compliance/ with a commercial path; no restricted weights in any layer).
ARG PROFILE=dev
ENV SYNCOPATE_PROFILE=${PROFILE}

# Dependencies first so code changes don't reinstall PyTorch.
COPY --chown=user core/pyproject.toml core/uv.lock core/.python-version core/README.md ./
RUN if [ "$PROFILE" = "commercial" ]; then \
      uv sync --frozen --no-dev --no-default-groups --group qwen --no-install-project; \
    else \
      uv sync --frozen --no-dev --no-install-project; \
    fi
COPY --chown=user core/src ./src
RUN if [ "$PROFILE" = "commercial" ]; then \
      uv sync --frozen --no-dev --no-default-groups --group qwen; \
    else \
      uv sync --frozen --no-dev; \
    fi

# Bake pinned models into the image so the first job doesn't download anything.
RUN if [ "$PROFILE" = "commercial" ]; then \
      python -c "from syncopate.providers.qwen import _model; _model()"; \
    else \
      python -c "from torchaudio.pipelines import MMS_FA; MMS_FA.get_model(); \
from demucs.pretrained import get_model; get_model('htdemucs')"; \
    fi

# Commercial images: refuse uncleared providers, never download at runtime, and fail the build
# if the artifact gate finds anything shipped without approval.
COPY --chown=user compliance ./compliance
COPY --chown=user scripts ./scripts
COPY --chown=user app/package-lock.json ./app/package-lock.json
RUN python scripts/generate_sbom.py --npm-lock app/package-lock.json --out compliance/release
RUN if [ "$PROFILE" = "commercial" ]; then \
      python scripts/check_artifacts.py --profile commercial --repo /home/user/app --manifests-only; \
    fi
# Weights are baked in above; at runtime nothing may fall back to downloading a model.
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

COPY --from=web --chown=user /web/dist ./static

ENV SYNCOPATE_ENV=staging \
    STATIC_DIR=/home/user/app/static \
    DATA_DIR=/home/user/data \
    PORT=7860
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health')"
CMD ["sh", "-c", "exec uvicorn syncopate.server:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
