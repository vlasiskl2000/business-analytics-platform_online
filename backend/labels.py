"""Display names for the 'product' and 'region' fields.

The analytics always use the standard columns `product` and `region`, but the
user's own file may call them "Κατηγορία", "Store", ... The names the user chose
are saved next to the dataset so the pages can show them instead of the generic
words.  Stored as a tiny JSON file:  {"product": "Κατηγορία", "region": "Κατάστημα"}
"""

import json
import os

DEFAULT_LABELS = {"product": "Product", "region": "Region"}
MAX_LENGTH = 40


def _clean(value) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())[:MAX_LENGTH]
    if text.lower() in ("product", "products", "region", "regions"):
        return None                      # the generic words need no custom name
    return text or None


def sidecar_path(csv_path: str) -> str:
    return csv_path + ".labels.json"


def save_labels(path: str, product=None, region=None) -> None:
    """Write the labels file (an empty one when nothing custom was chosen)."""
    labels = {"product": _clean(product), "region": _clean(region)}
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(labels, handle, ensure_ascii=False)


def read_labels(path: str) -> dict:
    """Labels to show: custom names where saved, generic words otherwise."""
    result = dict(DEFAULT_LABELS)
    try:
        with open(path, encoding="utf-8") as handle:
            saved = json.load(handle)
    except (OSError, ValueError):
        return result
    if isinstance(saved, dict):
        for key in result:
            result[key] = _clean(saved.get(key)) or result[key]
    return result


def copy_labels(source: str, destination: str) -> None:
    """Copy a labels file; remove the destination when the source has none."""
    if os.path.exists(source):
        with open(source, "rb") as src, open(destination, "wb") as dst:
            dst.write(src.read())
    elif os.path.exists(destination):
        os.remove(destination)


def remove_labels(path: str) -> None:
    if os.path.exists(path):
        os.remove(path)
