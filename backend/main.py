from fastapi import FastAPI, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import pandas as pd
from .data_loader import load_sales_data, filter_sales_data, get_active_dataset_path, get_user_data_dir
from .analytics import (
    calculate_kpis,
    sales_by_product,
    sales_by_region,
    monthly_sales,
    sales_trend,
    monthly_trend,
    detect_anomalies,
    explain_anomaly,
    compare_periods
)
from datetime import datetime
import os
from backend.database import create_user, get_user, get_users
from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_role
)
from .insights import generate_insights
from backend.forecasting import (
    forecast_revenue,
    evaluate_rolling_forecast
)
from backend.business_analyst import answer_business_question
from backend.database import (
    create_tables,
    save_dataset,
    get_datasets,
    delete_dataset,
    set_active_dataset,
    create_goal,
    get_goals,
    delete_goal,
    create_alert,
    get_alerts,
    mark_alert_read,
    clear_active_dataset,
    create_dashboard_widget,
    get_dashboard_widgets,
    delete_dashboard_widget,
    update_dashboard_positions,
    update_user_role
)
create_tables()
app = FastAPI(
    title="Business Analytics Platform",
    description="Business intelligence API",
    version="1.0.0"
)
# Configure allowed frontend origins through CORS_ORIGINS.
# The defaults support the local development setup used by this project.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000,http://localhost:8000,null"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.get("/")
def home():
    return FileResponse(os.path.join(frontend_dir, "index.html"))


@app.get("/api/kpis")
def get_kpis(
    product: str | None = Query(default=None),
    region: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data = filter_sales_data(
        data,
        product=product,
        region=region,
        date_from=date_from,
        date_to=date_to
    )

    return calculate_kpis(data)

@app.get("/api/anomalies")
def get_anomalies(
    product: str | None = Query(default=None),
    region: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data = filter_sales_data(
        data,
        product=product,
        region=region,
        date_from=date_from,
        date_to=date_to
    )

    return detect_anomalies(data)
@app.get("/api/anomalies/{anomaly_date}")
def get_anomaly_explanation(anomaly_date: str,
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    return explain_anomaly(
        data,
        anomaly_date
    )
@app.get("/api/products")
def get_products(
    product: str | None = Query(default=None),
    region: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data = filter_sales_data(
        data,
        product=product,
        region=region,
        date_from=date_from,
        date_to=date_to
    )

    result = sales_by_product(data)

    return result.reset_index().to_dict(orient="records")

@app.get("/api/trend")
def get_sales_trend(
    product: str | None = Query(default=None),
    region: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data = filter_sales_data(
        data,
        product=product,
        region=region,
        date_from=date_from,
        date_to=date_to
    )

    return sales_trend(data)

@app.get("/api/monthly-trend")
def get_monthly_trend(
    product: str | None = Query(default=None),
    region: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data = filter_sales_data(
        data,
        product=product,
        region=region,
        date_from=date_from,
        date_to=date_to
    )

    return monthly_trend(data)

@app.get("/api/regions")
def get_regions(
    product: str | None = Query(default=None),
    region: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data = filter_sales_data(
        data,
        product=product,
        region=region,
        date_from=date_from,
        date_to=date_to
    )

    result = sales_by_region(data)

    return result.reset_index().to_dict(orient="records")


@app.get("/api/monthly")
def get_monthly(
    product: str | None = Query(default=None),
    region: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data = filter_sales_data(
        data,
        product=product,
        region=region,
        date_from=date_from,
        date_to=date_to
    )

    result = monthly_sales(data)

    result.index = result.index.astype(str)

    return result.reset_index().to_dict(orient="records")

@app.get("/api/insights")
def get_insights(
    product: str | None = Query(default=None),
    region: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data = filter_sales_data(
        data,
        product=product,
        region=region,
        date_from=date_from,
        date_to=date_to
    )

    return {
        "insights": generate_insights(data)
    }
@app.post("/api/business-question")
def business_question(question: str,
    current_user: str = Depends(get_current_user)
):

    data = load_sales_data(current_user)

    result = answer_business_question(
        data,
        question
    )

    return result
@app.post("/api/upload")
async def upload_csv(
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user)
):
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        return {"success": False, "message": "Please upload a CSV file."}

    # Keep uploads bounded so a malformed/oversized file cannot consume
    # unlimited memory in the API process.
    max_upload_size = 10 * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_upload_size:
        raise HTTPException(status_code=413, detail="CSV file is too large. Maximum size is 10 MB.")

    try:
        from io import StringIO
        data = pd.read_csv(StringIO(contents.decode("utf-8-sig")))
    except (UnicodeDecodeError, pd.errors.ParserError, ValueError):
        return {"success": False, "message": "Could not read the CSV file. Use a valid UTF-8 CSV."}

    if data.empty:
        return {"success": False, "message": "The CSV file contains no rows."}

    required_columns = ["date", "product", "region", "sales", "cost", "units"]
    missing_columns = [c for c in required_columns if c not in data.columns]
    if missing_columns:
        return {"success": False, "message": "Missing required columns.", "missing_columns": missing_columns}

    try:
        data["date"] = pd.to_datetime(data["date"], errors="raise")
        for column in ["sales", "cost", "units"]:
            data[column] = pd.to_numeric(data[column], errors="raise")
    except (TypeError, ValueError):
        return {"success": False, "message": "Invalid values in date, sales, cost or units columns."}

    if data[["sales", "cost", "units"]].isna().any().any():
        return {"success": False, "message": "Sales, cost and units cannot contain empty values."}

    if not data["sales"].map(pd.notna).all() or not data["cost"].map(pd.notna).all():
        return {"success": False, "message": "Dataset contains invalid numeric values."}

    user_dir = get_user_data_dir(current_user)
    safe_name = os.path.basename(filename)
    dataset_path = os.path.join(user_dir, safe_name)
    active_path = get_active_dataset_path(current_user)

    data.to_csv(dataset_path, index=False)
    data.to_csv(active_path, index=False)

    save_dataset(safe_name, safe_name, datetime.now().isoformat(), len(data), current_user)

    return {
        "success": True,
        "message": "Dataset uploaded successfully.",
        "filename": safe_name,
        "rows": len(data),
        "columns": list(data.columns)
    }

@app.get("/api/datasets")
def list_datasets(current_user: str = Depends(get_current_user)):
    datasets = get_datasets(current_user)
    return {"datasets": [
        {
            "id": d[0], "name": d[1], "filename": d[2],
            "uploaded_at": d[3], "rows": d[4], "is_active": bool(d[5])
        } for d in datasets
    ]}


@app.post("/api/datasets/{dataset_id}/load")
def load_dataset(dataset_id: int, current_user: str = Depends(get_current_user)):
    datasets = get_datasets(current_user)
    selected = next((d for d in datasets if d[0] == dataset_id), None)
    if selected is None:
        return {"success": False, "message": "Dataset not found."}

    filename = selected[2]
    filepath = os.path.join(get_user_data_dir(current_user), os.path.basename(filename))
    if not os.path.exists(filepath):
        return {"success": False, "message": "Dataset file not found."}

    data = pd.read_csv(filepath)
    data["date"] = pd.to_datetime(data["date"])
    data.to_csv(get_active_dataset_path(current_user), index=False)
    set_active_dataset(dataset_id, current_user)

    return {"success": True, "message": "Dataset loaded successfully.", "filename": filename, "rows": len(data)}


@app.delete("/api/datasets/{dataset_id}")
def delete_dataset_endpoint(dataset_id: int, current_user: str = Depends(get_current_user)):
    datasets = get_datasets(current_user)
    selected = next((d for d in datasets if d[0] == dataset_id), None)
    if selected is None:
        return {"success": False, "message": "Dataset not found."}

    filename = selected[2]
    delete_dataset(dataset_id, current_user)

    filepath = os.path.join(get_user_data_dir(current_user), os.path.basename(filename))
    if os.path.exists(filepath):
        os.remove(filepath)

    return {"success": True, "message": "Dataset deleted successfully.", "filename": filename}


@app.post("/api/reset")
def reset_dataset(current_user: str = Depends(get_current_user)):
    active_path = get_active_dataset_path(current_user)
    if os.path.exists(active_path):
        os.remove(active_path)

    clear_active_dataset(current_user)
    return {"success": True, "message": "Dataset reset to default."}


@app.get("/api/metadata")
def get_metadata(current_user: str = Depends(get_current_user)):

    data = load_sales_data(current_user)

    return {
        "products": sorted(data["product"].dropna().unique().tolist()),
        "regions": sorted(data["region"].dropna().unique().tolist()),
        "date_min": data["date"].min().strftime("%Y-%m-%d"),
        "date_max": data["date"].max().strftime("%Y-%m-%d")
    }
@app.get("/api/data")
def get_data(current_user: str = Depends(get_current_user)):

    data = load_sales_data(current_user)

    return {
        "rows": data.to_dict(orient="records"),
        "total_rows": len(data),
        "columns": list(data.columns)
    }
@app.get("/api/compare")
def compare_periods_endpoint(
    period1_from: str,
    period1_to: str,
    period2_from: str,
    period2_to: str,
    current_user: str = Depends(get_current_user)
):
    data = load_sales_data(current_user)

    data["date"] = pd.to_datetime(data["date"])

    return compare_periods(
        data,
        period1_from,
        period1_to,
        period2_from,
        period2_to
    )
@app.get("/api/forecast")
def forecast_endpoint(periods: int = 3, current_user: str = Depends(get_current_user)):

    data = load_sales_data(current_user)

    # Generate anomaly-aware forecast
    result = forecast_revenue(
    data,
    periods=periods
)

    # Evaluate anomaly-aware model
    evaluation = evaluate_rolling_forecast(
    data,
    adjusted=True
)

    historical = []

    for _, row in result["historical"].iterrows():

        historical.append({
            "date": str(row["date"]),
            "revenue": float(row["revenue"])
        })

    forecast = []

    last_period = result["historical"]["date"].iloc[-1]

    for i, prediction in enumerate(
        result["forecast"],
        start=1
    ):

        future_period = last_period + i

        forecast.append({
            "date": str(future_period),
            "revenue": float(prediction),
            "lower_bound": float(
                result["lower_bound"][i - 1]
            ),
            "upper_bound": float(
                result["upper_bound"][i - 1]
            )
        })

    return {
        "historical": historical,

        "forecast": forecast,

        "model": {
            "type": "Linear Regression",
            "anomaly_adjustment": True,
            "threshold": 50
        },

        "evaluation": {
            "mae": evaluation["mae"],
            "rmse": evaluation["rmse"],
            "mape": evaluation["mape"]
        }
    }

# ==============================
# Advanced analytics endpoints
# ==============================

@app.get("/api/product-detail/{product_name}")
def product_detail(product_name: str, current_user: str = Depends(get_current_user)):
    data = load_sales_data(current_user)
    data = data[data["product"].astype(str) == product_name]
    if data.empty:
        return {"success": False, "message": "Product not found."}

    revenue = float(data["sales"].sum())
    cost = float(data["cost"].sum())
    profit = float(data["profit"].sum())
    units = int(data["units"].sum()) if "units" in data.columns else 0

    monthly = (
        data.assign(month=data["date"].dt.to_period("M").astype(str))
        .groupby("month", as_index=False)
        .agg(revenue=("sales", "sum"), profit=("profit", "sum"))
    )

    regions = (
        data.groupby("region", as_index=False)
        .agg(revenue=("sales", "sum"), profit=("profit", "sum"))
        .sort_values("revenue", ascending=False)
    )

    return {
        "success": True,
        "product": product_name,
        "metrics": {
            "revenue": revenue,
            "cost": cost,
            "profit": profit,
            "margin": float(profit / revenue * 100) if revenue else 0,
            "units": units
        },
        "monthly": monthly.to_dict(orient="records"),
        "regions": regions.to_dict(orient="records")
    }


@app.get("/api/data-quality")
def data_quality(current_user: str = Depends(get_current_user)):
    data = load_sales_data(current_user)
    rows = len(data)
    columns = len(data.columns)

    missing = int(data.isna().sum().sum())
    duplicates = int(data.duplicated().sum())

    invalid_dates = 0
    if "date" in data.columns:
        invalid_dates = int(pd.to_datetime(data["date"], errors="coerce").isna().sum())

    negative_sales = int((data["sales"] < 0).sum()) if "sales" in data.columns else 0
    negative_units = int((data["units"] < 0).sum()) if "units" in data.columns else 0

    penalties = (
        min(missing * 2, 30)
        + min(duplicates * 1, 20)
        + min(invalid_dates * 2, 20)
        + min(negative_sales * 2, 15)
        + min(negative_units * 2, 15)
    )
    score = max(0, 100 - penalties)

    return {
        "rows": rows,
        "columns": columns,
        "missing_values": missing,
        "duplicate_rows": duplicates,
        "invalid_dates": invalid_dates,
        "negative_sales": negative_sales,
        "negative_units": negative_units,
        "quality_score": score
    }


@app.get("/api/system-health")
def system_health(current_user: str = Depends(get_current_user)):
    import os
    from backend.database import DATABASE_PATH

    data = load_sales_data(current_user)
    db_ok = os.path.exists(DATABASE_PATH)

    return {
        "api": "online",
        "analytics_engine": "online",
        "database": "online" if db_ok else "ready",
        "dataset": {
            "status": "online" if not data.empty else "empty",
            "rows": int(len(data))
        }
    }


@app.get("/api/forecast-scenarios")
def forecast_scenarios(periods: int = 6, current_user: str = Depends(get_current_user)):
    data = load_sales_data(current_user)
    base = forecast_revenue(data, periods=periods)

    labels = []
    for i, value in enumerate(base["forecast"], start=1):
        labels.append({
            "period": str(base["historical"]["date"].iloc[-1] + i)
        })

    scenarios = {}
    for name, multiplier in [
        ("pessimistic", 0.90),
        ("base", 1.00),
        ("optimistic", 1.10)
    ]:
        scenarios[name] = [
            {
                "date": labels[i]["period"],
                "revenue": float(value * multiplier)
            }
            for i, value in enumerate(base["forecast"])
        ]

    return {
        "periods": periods,
        "scenarios": scenarios
    }



@app.get("/api/simulator")
def simulator(
    price_change: float = 0,
    unit_change: float = 0,
    cost_change: float = 0,
    current_user: str = Depends(get_current_user),
):
    """Run a transparent what-if scenario against the user's active dataset.

    Assumptions:
    - price_change changes average selling price
    - unit_change changes sales volume
    - cost_change changes cost per unit

    This keeps the model interpretable: revenue = price * units and
    cost = cost_per_unit * units.
    """
    for name, value in {
        "price_change": price_change,
        "unit_change": unit_change,
        "cost_change": cost_change,
    }.items():
        if not -100 < value < 1000:
            raise HTTPException(status_code=400, detail=f"Invalid {name} value")

    data = load_sales_data(current_user)
    required = {"sales", "cost", "units"}
    if not required.issubset(data.columns):
        raise HTTPException(status_code=400, detail="Dataset must contain sales, cost and units columns")

    revenue = float(data["sales"].sum())
    cost = float(data["cost"].sum())
    units = float(data["units"].sum())

    if units <= 0:
        raise HTTPException(status_code=400, detail="Dataset contains no positive units")

    current_profit = revenue - cost
    current_margin = current_profit / revenue * 100 if revenue else 0
    avg_price = revenue / units
    avg_cost = cost / units

    scenario_units = units * (1 + unit_change / 100)
    scenario_price = avg_price * (1 + price_change / 100)
    scenario_cost_per_unit = avg_cost * (1 + cost_change / 100)
    scenario_revenue = scenario_units * scenario_price
    scenario_cost = scenario_units * scenario_cost_per_unit
    scenario_profit = scenario_revenue - scenario_cost
    scenario_margin = scenario_profit / scenario_revenue * 100 if scenario_revenue else 0

    def pct_change(new, old):
        return ((new - old) / old * 100) if old else 0

    return {
        "assumptions": {
            "price_change": price_change,
            "unit_change": unit_change,
            "cost_change": cost_change,
        },
        "current": {
            "revenue": revenue,
            "cost": cost,
            "profit": current_profit,
            "margin": current_margin,
            "units": units,
            "average_price": avg_price,
            "average_cost_per_unit": avg_cost,
        },
        "scenario": {
            "revenue": scenario_revenue,
            "cost": scenario_cost,
            "profit": scenario_profit,
            "margin": scenario_margin,
            "units": scenario_units,
            "average_price": scenario_price,
            "average_cost_per_unit": scenario_cost_per_unit,
        },
        "impact": {
            "revenue_change": scenario_revenue - revenue,
            "cost_change": scenario_cost - cost,
            "profit_change": scenario_profit - current_profit,
            "revenue_change_pct": pct_change(scenario_revenue, revenue),
            "cost_change_pct": pct_change(scenario_cost, cost),
            "profit_change_pct": pct_change(scenario_profit, current_profit),
            "margin_change_pp": scenario_margin - current_margin,
        },
    }


@app.get("/api/goals")
def list_goals(current_user: str = Depends(get_current_user)):
    return {"goals": [
        {"id": g[0], "metric": g[1], "target": g[2], "created_at": g[3]}
        for g in get_goals(current_user)
    ]}


@app.post("/api/goals")
def add_goal(metric: str, target: float, current_user: str = Depends(get_current_user)):
    create_goal(current_user, metric, target, datetime.now().isoformat())
    return {"success": True}


@app.delete("/api/goals/{goal_id}")
def remove_goal(goal_id: int, current_user: str = Depends(get_current_user)):
    delete_goal(goal_id, current_user)
    return {"success": True}


@app.get("/api/alerts")
def list_alerts(current_user: str = Depends(get_current_user)):
    alerts = get_alerts(current_user)

    # Generate fresh anomaly alerts when none exist.
    data = load_sales_data(current_user)
    anomalies = detect_anomalies(data)
    if anomalies and not alerts:
        for a in anomalies[:5]:
            date = a.get("date", a.get("anomaly_date", "Unknown"))
            change = a.get("growth_percent", a.get("growth", a.get("change_percent", 0)))
            create_alert(
                current_user,
                f"Revenue anomaly detected — {date}",
                f"Revenue changed by {float(change):.1f}% compared with the previous period.",
                "high" if abs(float(change)) >= 100 else "medium",
                datetime.now().isoformat()
            )
        alerts = get_alerts(current_user)

    return {"alerts": [
        {"id": a[0], "title": a[1], "message": a[2], "severity": a[3],
         "created_at": a[4], "is_read": bool(a[5])}
        for a in alerts
    ]}


@app.post("/api/alerts/{alert_id}/read")
def read_alert(alert_id: int, current_user: str = Depends(get_current_user)):
    mark_alert_read(alert_id, current_user)
    return {"success": True}


@app.get("/api/report-data")
def report_data(current_user: str = Depends(get_current_user)):
    data = load_sales_data(current_user)
    kpis = calculate_kpis(data)
    products = sales_by_product(data).reset_index().to_dict(orient="records")
    regions = sales_by_region(data).reset_index().to_dict(orient="records")
    anomalies = detect_anomalies(data)

    return {
        "generated_at": datetime.now().isoformat(),
        "kpis": kpis,
        "top_product": products[0] if products else None,
        "top_region": regions[0] if regions else None,
        "anomalies": anomalies[:10]
    }


@app.post("/api/register")
def register_user(
    username: str,
    password: str
):

    username = username.strip()

    if not username or not password:

        return {
            "success": False,
            "message": "Username and password are required."
        }

    if len(password) < 6:

        return {
            "success": False,
            "message": "Password must contain at least 6 characters."
        }

    existing_user = get_user(username)

    if existing_user:

        return {
            "success": False,
            "message": "Username already exists."
        }

    password_hash = hash_password(password)

    create_user(
        username,
        password_hash,
        datetime.now().isoformat()
    )

    return {
        "success": True,
        "message": "User registered successfully.",
        "username": username
    }
@app.post("/api/login")
def login_user(
    username: str,
    password: str
):

    user = get_user(username)

    if user is None:

        return {
            "success": False,
            "message": "Invalid username or password."
        }

    password_hash = user[2]

    if not verify_password(
        password,
        password_hash
    ):

        return {
            "success": False,
            "message": "Invalid username or password."
        }

    access_token = create_access_token(
    username,
    user[4]
    )

    return {
        "success": True,
        "message": "Login successful.",
        "access_token": access_token,
        "token_type": "bearer"
    }
@app.get("/api/auth-test")
def auth_test(
    current_user: str = Depends(get_current_user)
):

    return {
        "success": True,
        "message": "Authentication successful.",
        "username": current_user
    }
@app.get("/api/me")
def get_me(
    current_user: dict = Depends(require_role("analyst", "manager", "admin"))
):
    return {
        "success": True,
        "username": current_user["username"],
        "role": current_user["role"]
    }
@app.get("/api/admin/users")
def admin_get_users(
    current_user: dict = Depends(require_role("admin"))
):
    users = get_users()

    return {
        "success": True,
        "users": [
            {
                "id": user[0],
                "username": user[1],
                "created_at": user[2],
                "role": user[3]
            }
            for user in users
        ]
    }
@app.put("/api/admin/users/{user_id}/role")
def admin_update_user_role(
    user_id: int,
    role: str,
    current_user: dict = Depends(require_role("admin"))
):
    allowed_roles = {"analyst", "manager", "admin"}

    if role not in allowed_roles:
        raise HTTPException(
            status_code=400,
            detail="Invalid role."
        )

    from backend.database import get_connection

    connection = get_connection()
    cursor = connection.cursor()

    user = cursor.execute(
        "SELECT id, username, role FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    if user is None:
        connection.close()

        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    cursor.execute(
        "UPDATE users SET role = ? WHERE id = ?",
        (role, user_id)
    )

    connection.commit()
    connection.close()

    return {
        "success": True,
        "message": "User role updated successfully.",
        "user": {
            "id": user[0],
            "username": user[1],
            "role": role
        }
    }
# ---------------- Custom Dashboard Builder ----------------

ALLOWED_WIDGET_TYPES = {"kpi", "bar", "line", "pie", "table"}
ALLOWED_METRICS = {"revenue", "cost", "profit", "units", "margin"}
ALLOWED_DIMENSIONS = {None, "product", "region", "month"}


def _widget_dict(row):
    return {
        "id": row[0], "title": row[1], "widget_type": row[2],
        "metric": row[3], "dimension": row[4], "position": row[5],
        "created_at": row[6]
    }


@app.get("/api/dashboard/widgets")
def list_dashboard_widgets(current_user: str = Depends(get_current_user)):
    return {"widgets": [_widget_dict(r) for r in get_dashboard_widgets(current_user)]}


@app.post("/api/dashboard/widgets")
def add_dashboard_widget(
    title: str,
    widget_type: str,
    metric: str,
    dimension: str | None = None,
    current_user: str = Depends(get_current_user)
):
    widget_type = widget_type.lower().strip()
    metric = metric.lower().strip()
    dimension = dimension.lower().strip() if dimension else None

    if widget_type not in ALLOWED_WIDGET_TYPES:
        return {"success": False, "message": "Unsupported widget type."}
    if metric not in ALLOWED_METRICS:
        return {"success": False, "message": "Unsupported metric."}
    if dimension not in ALLOWED_DIMENSIONS:
        return {"success": False, "message": "Unsupported dimension."}
    if widget_type == "kpi":
        dimension = None
    if widget_type in {"bar", "pie", "line"} and not dimension:
        return {"success": False, "message": "Charts require a dimension."}

    existing = get_dashboard_widgets(current_user)
    position = len(existing)
    widget_id = create_dashboard_widget(
        current_user, title.strip() or metric.title(), widget_type, metric,
        dimension, position, datetime.now().isoformat()
    )
    return {"success": True, "id": widget_id}


@app.delete("/api/dashboard/widgets/{widget_id}")
def remove_dashboard_widget(widget_id: int, current_user: str = Depends(get_current_user)):
    delete_dashboard_widget(widget_id, current_user)
    return {"success": True}


@app.post("/api/dashboard/widgets/reorder")
def reorder_dashboard_widgets(
    positions: list[dict],
    current_user: str = Depends(get_current_user)
):
    clean = []
    for item in positions:
        try:
            clean.append((int(item["id"]), int(item["position"])))
        except (KeyError, TypeError, ValueError):
            continue
    update_dashboard_positions(current_user, clean)
    return {"success": True}


@app.get("/api/dashboard/widget-data/{widget_id}")
def dashboard_widget_data(widget_id: int, current_user: str = Depends(get_current_user)):
    widgets = [r for r in get_dashboard_widgets(current_user) if r[0] == widget_id]
    if not widgets:
        return {"success": False, "message": "Widget not found."}

    widget = _widget_dict(widgets[0])
    data = load_sales_data(current_user).copy()
    data["date"] = pd.to_datetime(data["date"])
    metric = widget["metric"]
    dimension = widget["dimension"]

    if metric == "revenue":
        data["metric_value"] = data["sales"]
    elif metric == "cost":
        data["metric_value"] = data["cost"]
    elif metric == "profit":
        data["metric_value"] = data["sales"] - data["cost"]
    elif metric == "units":
        data["metric_value"] = data["units"]
    else:
        total_revenue = data["sales"].sum()
        total_profit = (data["sales"] - data["cost"]).sum()
        value = (total_profit / total_revenue * 100) if total_revenue else 0
        return {"widget": widget, "data": [{"label": "Margin", "value": round(float(value), 2)}]}

    if dimension is None:
        return {"widget": widget, "data": [{"label": metric.title(), "value": round(float(data["metric_value"].sum()), 2)}]}

    if dimension == "product":
        grouped = data.groupby("product")["metric_value"].sum().sort_values(ascending=False)
    elif dimension == "region":
        grouped = data.groupby("region")["metric_value"].sum().sort_values(ascending=False)
    else:
        grouped = data.assign(month=data["date"].dt.to_period("M")).groupby("month")["metric_value"].sum()
        grouped.index = grouped.index.astype(str)

    rows = [{"label": str(k), "value": round(float(v), 2)} for k, v in grouped.items()]
    return {"widget": widget, "data": rows}


# Serve the frontend from the same FastAPI server.
# This avoids accidentally opening an older frontend from another folder/port.
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

@app.get("/app")
def frontend_app():
    return FileResponse(os.path.join(frontend_dir, "index.html"))

app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
