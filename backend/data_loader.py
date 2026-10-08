import os
import re
import pandas as pd

DEFAULT_DATASET = "data/sales.csv"


def _safe_username(username: str | None) -> str:
    value = username or "default"
    return re.sub(r"[^A-Za-z0-9_.-]", "_", value)


def get_user_data_dir(username: str | None = None):
    folder = os.path.join("data", "users", _safe_username(username))
    os.makedirs(folder, exist_ok=True)
    return folder


def get_active_dataset_path(username: str | None = None):
    return os.path.join(get_user_data_dir(username), "active_dataset.csv")


def load_sales_data(username: str | None = None):
    active_path = get_active_dataset_path(username)

    if os.path.exists(active_path):
        data = pd.read_csv(active_path)
    else:
        data = pd.read_csv(DEFAULT_DATASET)

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
