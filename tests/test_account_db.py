import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend import database


def make_db(tmp_path):
    database.DATABASE_PATH = str(tmp_path / "t.db")
    database.create_tables()


def test_recovery_hash_and_password_update(tmp_path):
    make_db(tmp_path)
    database.create_user("ann", "hash-1", "2026-01-01")
    assert database.get_recovery_hash("ann") is None
    database.set_recovery_hash("ann", "rec-1")
    assert database.get_recovery_hash("ann") == "rec-1"

    database.update_password("ann", "hash-2", "rec-2")
    assert database.get_user("ann")[2] == "hash-2" and database.get_recovery_hash("ann") == "rec-2"
    database.update_password("ann", "hash-3")
    assert database.get_user("ann")[2] == "hash-3" and database.get_recovery_hash("ann") == "rec-2"
    assert database.get_recovery_hash("nobody") is None


def test_export_has_no_password_data(tmp_path):
    make_db(tmp_path)
    database.create_user("bob", "secret-hash", "2026-01-01")
    database.set_recovery_hash("bob", "secret-recovery")
    database.save_dataset("d", "d.csv", "2026-01-02", 5, "bob")
    database.create_goal("bob", "revenue", 100, "2026-01-03")
    database.create_alert("bob", "t", "m", "high", "2026-01-04")
    out = database.export_account("bob")
    assert out["account"]["username"] == "bob"
    assert out["datasets"][0]["filename"] == "d.csv" and out["goals"][0]["target"] == 100
    assert "secret-hash" not in str(out) and "secret-recovery" not in str(out)
    assert database.export_account("nobody")["account"] is None


def test_delete_account_removes_only_that_user(tmp_path):
    make_db(tmp_path)
    for name in ("cat", "dan"):
        database.create_user(name, "h", "2026-01-01")
        database.save_dataset(name, f"{name}.csv", "2026-01-02", 1, name)
        database.create_goal(name, "revenue", 1, "2026-01-03")
        database.create_alert(name, "t", "m", "low", "2026-01-04")
        database.create_dashboard_widget(name, "w", "kpi", "revenue", None, 0, "2026-01-05")

    assert database.delete_account("cat") == ["cat.csv"]
    assert database.get_user("cat") is None
    assert database.get_datasets("cat") == [] and database.get_goals("cat") == []
    assert database.get_alerts("cat") == [] and database.get_dashboard_widgets("cat") == []
    assert database.get_user("dan") is not None
    assert len(database.get_datasets("dan")) == 1 and len(database.get_goals("dan")) == 1
