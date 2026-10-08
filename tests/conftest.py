import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"
os.environ["CORS_ORIGINS"] = "http://localhost:5500"

from backend import database


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(database, "DATABASE_PATH", str(db_path))

    from backend.main import app
    database.create_tables()

    with TestClient(app) as test_client:
        yield test_client
