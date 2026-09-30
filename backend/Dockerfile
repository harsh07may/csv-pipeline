FROM python:3.13-slim

# uv is a single static binary: copy it in from the official image.

COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /uvx /bin/


WORKDIR /code
ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never


# 1) Dependencies only. This layer is cached until pyproject.toml or uv.lock change,
#    so editing code doesn't reinstall packages.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# 2) Our code.
COPY app ./app


# Put the project's virtualenv first on PATH: `python`, `uvicorn`, `rq` all come from it.
ENV PATH="/code/.venv/bin:$PATH"