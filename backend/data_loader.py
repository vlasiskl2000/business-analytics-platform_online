import os
import re
import pandas as pd

# Sample data shipped with the project (read only).
DEFAULT_DATASET = "data/sales.csv"
# Larger sample used by the shared, read-only demo account (see backend/auth.py).
DEMO_DATASET = "data/demo_sales.csv"
DEMO_USERNAME = "demo-visitor"
# Uploaded files and per-user data live in DATA_DIR (a persistent disk in production).
DATA_DIR = os.getenv("DATA_DIR", "data")


def _safe_username(username: str | None) -> str:
    value = username or "default"
    return re.sub(r"[^A-Za-z0-9_.-]", "_", value)


def get_user_data_dir(username: str | None = None):
    folder = os.path.join(DATA_DIR, "users", _safe_username(username))
    os.makedirs(folder, exist_ok=True)
    return folder


def get_active_dataset_path(username: str | None = None):
    return os.path.join(get_user_data_dir(username), "active_dataset.csv")


def load_sales_data(username: str | None = None):
    active_path = get_active_dataset_path(username)

    if os.path.exists(active_path):
        data = pd.read_csv(active_path)
    else:
        data = pd.read_csv(DEMO_DATASET if username == DEMO_USERNAME else DEFAULT_DATASET)

    data["date"] = pd.to_datetime(data["date"])
    return data


def filter_sales_data(data, product=None, region=None, date_from=None, date_to=None):
    filtered_data = data.copy()

    if product:
        filtered_data = filtered_data[filtered_data["product"] == product]

    if region:
        filtered_data = filtered_data[filtered_data["region"] == region]

    if date_from:
        filtered_data = filtered_data[filtered_data["date"] >= date_from]

    if date_to:
        filtered_data = filtered_data[filtered_data["date"] <= date_to]

    return filtered_data
