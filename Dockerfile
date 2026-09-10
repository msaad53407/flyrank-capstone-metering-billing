# Multi-stage FastAPI image (uv). No BuildKit-only syntax, builds anywhere.
# Layer order: lockfiles -> deps -> source, so dependency layers cache well.

# ---------- builder: resolve + install locked deps, byte-compiled ----------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /code

# Deps first (cached until lockfiles change).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY app ./app
COPY scripts ./scripts

# ---------- runtime: slim, no uv, no build tools, non-root ----------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/code/.venv/bin:$PATH"

WORKDIR /code

RUN useradd --create-home --shell /bin/bash app

COPY --from=builder --chown=app:app /code/.venv /code/.venv
COPY --chown=app:app app ./app
COPY --chown=app:app scripts ./scripts

USER app

# Smoke test: app imports under the runtime interpreter.
RUN python -V && python -c "import app.main; print('import ok')"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status == 200 else 1)"

STOPSIGNAL SIGINT

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
