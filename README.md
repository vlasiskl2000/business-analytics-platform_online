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


## Uploading your own data

Upload a `.csv` or `.xlsx` file from the **Upload data** button. Column names and order do not matter (English or Greek names are recognised, extra columns are ignored, European number formats and Excel dates work). The app suggests which column is the date, sales, category, group, cost and units; you can change each choice before importing. Only **date** and **sales** are required. Old `.xls` files must be saved as `.xlsx` first.

## Production checklist

| Setting | What it does |
|---|---|
| `SECRET_KEY` | Signs login tokens. Set a long random value (Render generates one). If it is missing, a random key is created at each start and everyone is logged out on restart. |
| `DATA_DIR` | Folder for the SQLite database and uploaded CSV files. Point it to a persistent disk (default: `data`). |
| `CONTACT_EMAIL` / `OPERATOR_NAME` | Shown on the Privacy Policy and Terms pages as the contact for data requests. **Set these before going public.** |
| `CORS_ORIGINS` | Only needed if the frontend is served from another domain. |
| `LOGIN_MAX_FAILURES` / `LOGIN_WINDOW_SECONDS` | Failed logins allowed per IP + username in the window (default 5 per 900 s), then HTTP 429. |

Login and registration send the credentials in the JSON request body (`POST /api/login`, `POST /api/register`), never in the URL.

### Demo, accounts and legal pages

- **Demo:** the landing page has a *Try the demo* button. It signs in to a shared read-only account (`demo-visitor`) that shows `data/demo_sales.csv`; uploads and other changes are refused by the server.
- **Recovery codes:** there is no e-mail. Registration shows a one-time recovery code; *Forgot password?* uses it to set a new password (and issues a new code). Signed-in users can create a new code in Settings.
- **Privacy and deletion:** `/privacy` and `/terms` are served by the app. Settings has *Download my data* (JSON) and *Delete my account* (removes the account, goals and uploaded files). The legal texts are templates, not legal advice: have them reviewed for your situation.

### Docker

```bash
docker build -t business-analytics .
docker run -p 8000:8000 -e SECRET_KEY=change-me -v ba-data:/data business-analytics
```

### Being found on Google

- `/` is a public landing page (title, description, structured data). The app itself is at `/app` and is marked `noindex`.
- `/robots.txt` and `/sitemap.xml` are generated automatically from the domain the site is served on.
- After deploying on your own domain: add it in Google Search Console, verify ownership, submit `https://YOUR-DOMAIN/sitemap.xml` and request indexing of the home page.

### Tests

```bash
pip install -r requirements-dev.txt
pytest
```
