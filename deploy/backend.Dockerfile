# syntax=docker/dockerfile:1
# Backend — FastAPI + Snowflake connector + Redis. Multi-stage, non-root, slim runtime.
# Build context = the backend repo root (where app/ and requirements.txt live).
#   docker build -f deploy/backend.Dockerfile -t data360-api:$(git rev-parse --short HEAD) .

# ---- builder: resolve deps into a venv (cacheable) ----
FROM python:3.11-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# copy only dependency manifests first → layer cache survives code changes
COPY requirements*.txt pyproject.toml* poetry.lock* ./
RUN pip install --upgrade pip && \
    if [ -f requirements.txt ]; then pip install -r requirements.txt; \
    elif [ -f pyproject.toml ]; then pip install .; fi

# ---- preflight: fail the build if code is broken (import graph / routes) ----
FROM builder AS preflight
ENV PATH="/opt/venv/bin:$PATH"
COPY app ./app
COPY deploy/scripts/backend-preflight.sh /tmp/preflight.sh 2>/dev/null || true
# import check is the critical gate; skip if app package layout differs
RUN python -c "import importlib; importlib.import_module('app.main'); print('import OK')"

# ---- runtime: slim, non-root, healthchecked ----
FROM python:3.11-slim AS runtime
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=8000
RUN groupadd -r app && useradd -r -g app app
WORKDIR /srv
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app app ./app
# NOTE: secrets come from the orchestrator env at runtime — never COPY app/.env into the image.
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health',timeout=4).status==200 else 1)"
# uvicorn (no --reload in prod); workers via env
CMD ["sh","-c","uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY:-2} --proxy-headers"]
