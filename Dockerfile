FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    PORT=8000

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY frontend ./frontend
# Sample dataset used before a user uploads their own file
COPY data/sales.csv ./data/sales.csv

# Uploads and the SQLite database live in /data: mount a volume here to keep them
RUN useradd --create-home appuser && mkdir -p /data && chown -R appuser /data /app
USER appuser
VOLUME ["/data"]

EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
