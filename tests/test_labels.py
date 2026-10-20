import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend import labels


def test_defaults_when_no_file(tmp_path):
    assert labels.read_labels(str(tmp_path / "missing.json")) == {"product": "Product", "region": "Region"}


def test_save_and_read_custom_names(tmp_path):
    path = str(tmp_path / "a.csv.labels.json")
    labels.save_labels(path, "Κατηγορία", "  Κατάστημα   Πόλης ")
    assert labels.read_labels(path) == {"product": "Κατηγορία", "region": "Κατάστημα Πόλης"}


def test_generic_or_empty_names_keep_defaults(tmp_path):
    path = str(tmp_path / "b.json")
    labels.save_labels(path, "product", None)
    assert labels.read_labels(path) == {"product": "Product", "region": "Region"}


def test_broken_file_gives_defaults(tmp_path):
    path = tmp_path / "c.json"
    path.write_text("{not json", encoding="utf-8")
    assert labels.read_labels(str(path))["product"] == "Product"


def test_copy_and_remove(tmp_path):
    src, dst = str(tmp_path / "s.json"), str(tmp_path / "d.json")
    labels.save_labels(src, "Brand", "Store")
    labels.copy_labels(src, dst)
    assert labels.read_labels(dst)["region"] == "Store"
    labels.remove_labels(src)
    labels.copy_labels(src, dst)            # source gone -> destination removed
    assert labels.read_labels(dst) == {"product": "Product", "region": "Region"}


def test_name_longer_than_limit_is_cut(tmp_path):
    path = str(tmp_path / "e.json")
    labels.save_labels(path, "x" * 100, None)
    assert len(labels.read_labels(path)["product"]) == labels.MAX_LENGTH
