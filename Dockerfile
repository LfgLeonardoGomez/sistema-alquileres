FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
COPY scripts ./scripts
COPY tests ./tests

RUN pip install --no-cache-dir -e ".[dev]"

EXPOSE 8000

CMD ["fastapi", "run", "--host", "0.0.0.0", "--port", "8000"]
