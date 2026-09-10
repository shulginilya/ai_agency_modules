FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir -e ".[dev]"

EXPOSE 8000
CMD ["uvicorn", "aim_core.app:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
