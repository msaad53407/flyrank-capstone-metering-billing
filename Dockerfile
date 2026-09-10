FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uv

WORKDIR /code
ENV UV_LINK_MODE=copy

COPY pyproject.toml uv.lock .python-version ./
RUN /uv sync --frozen --no-dev

COPY app ./app
COPY scripts ./scripts

EXPOSE 8000
CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
