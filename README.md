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

## 3D frontend

The frontend has a modern 3D layer on top of the original pages:

- `frontend/modern.css` – glass cards, floating sidebar, new login screen
- `frontend/scene3d.js` – Three.js background scene + interactive 3D revenue skyline (Overview)
- `frontend/modern-ui.js` – Chart.js theme, 3D tilt on tiles, KPI count-up, scroll reveal

Three.js is loaded from a CDN (jsDelivr) as an ES module, so open the app through the
FastAPI server (`http://127.0.0.1:8000/`) and not by double-clicking the HTML files.
If WebGL or the CDN is unavailable the app still works, just without the 3D scene.
