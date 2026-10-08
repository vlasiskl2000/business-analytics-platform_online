# Business Analytics Platform

## Run locally

```bash
python -m uvicorn backend.main:app --reload
```

Open http://127.0.0.1:8000/

The frontend automatically uses the local FastAPI server when opened from a file, and uses the current server origin when deployed.

## Deploy to Render

Build command:

```bash
pip install -r requirements.txt
```

Start command:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```
