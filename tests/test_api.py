import uuid


def register_and_login(client):
    username = f"test_{uuid.uuid4().hex[:8]}"
    password = "StrongPass123!"

    response = client.post(
        "/api/register",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    response = client.post(
        "/api/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["token_type"] == "bearer"
    return username, {"Authorization": f"Bearer {body['access_token']}"}


def test_protected_endpoint_requires_authentication(client):
    response = client.get("/api/kpis")
    assert response.status_code in (401, 403)


def test_authentication_and_kpis(client):
    _, headers = register_and_login(client)

    response = client.get("/api/auth-test", headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True

    response = client.get("/api/kpis", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_revenue"] > 0
    assert body["total_cost"] > 0
    assert body["total_profit"] == body["total_revenue"] - body["total_cost"]


def test_simulator_zero_change_matches_current_values(client):
    _, headers = register_and_login(client)

    kpis = client.get("/api/kpis", headers=headers).json()
    scenario = client.get(
        "/api/simulator",
        params={"price_change": 0, "unit_change": 0, "cost_change": 0},
        headers=headers,
    )

    assert scenario.status_code == 200
    body = scenario.json()
    assert body["scenario"]["revenue"] == kpis["total_revenue"]
    assert body["scenario"]["cost"] == kpis["total_cost"]
    assert body["scenario"]["profit"] == kpis["total_profit"]


def test_simulator_rejects_invalid_values(client):
    _, headers = register_and_login(client)

    response = client.get(
        "/api/simulator",
        params={"price_change": 1000},
        headers=headers,
    )
    assert response.status_code == 400


def test_goals_are_user_scoped(client):
    _, headers = register_and_login(client)

    response = client.post(
        "/api/goals",
        params={"metric": "revenue", "target": 100000},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["success"] is True

    response = client.get("/api/goals", headers=headers)
    assert response.status_code == 200
    goals = response.json()["goals"]
    assert len(goals) == 1
    assert goals[0]["metric"] == "revenue"
    assert goals[0]["target"] == 100000


def test_dashboard_widget_data_uses_sales_column(client):
    _, headers = register_and_login(client)

    response = client.post(
        "/api/dashboard/widgets",
        params={
            "title": "Revenue by Product",
            "widget_type": "bar",
            "metric": "revenue",
            "dimension": "product",
        },
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    widget_id = body["id"]

    response = client.get(
        f"/api/dashboard/widget-data/{widget_id}",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data
    assert all("label" in row and "value" in row for row in data)
    assert all(row["value"] >= 0 for row in data)


def test_report_data(client):
    _, headers = register_and_login(client)

    response = client.get("/api/report-data", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "kpis" in body
    assert "top_product" in body
    assert "top_region" in body
    assert "anomalies" in body
def test_users_cannot_access_each_others_goals(client):
    _, headers_a = register_and_login(client)
    _, headers_b = register_and_login(client)

    # User A creates a goal
    response = client.post(
        "/api/goals",
        params={"metric": "revenue", "target": 50000},
        headers=headers_a,
    )
    assert response.status_code == 200

    # Get User A's goals and find the newly created goal
    response = client.get("/api/goals", headers=headers_a)
    assert response.status_code == 200

    goals_a = response.json()["goals"]
    assert len(goals_a) > 0

    goal_id = goals_a[-1]["id"]

    # User B must not see User A's goal
    response = client.get("/api/goals", headers=headers_b)
    assert response.status_code == 200

    goals_b = response.json()["goals"]

    assert all(
        goal["id"] != goal_id
        for goal in goals_b
    )

    # User A must still see their own goal
    response = client.get("/api/goals", headers=headers_a)
    assert response.status_code == 200

    goals_a = response.json()["goals"]

    assert any(
        goal["id"] == goal_id
        for goal in goals_a
    )
def test_users_cannot_access_each_others_datasets(client):
    _, headers_a = register_and_login(client)
    _, headers_b = register_and_login(client)

    csv_content = (
        "date,product,region,sales,cost,units\n"
        "2026-01-01,Laptop,Athens,1000,600,10\n"
        "2026-01-02,Monitor,Athens,500,300,5\n"
    )

    # User A uploads a dataset
    response = client.post(
        "/api/upload",
        files={
            "file": (
                "user_a_dataset.csv",
                csv_content.encode("utf-8"),
                "text/csv",
            )
        },
        headers=headers_a,
    )

    assert response.status_code == 200
    assert response.json()["success"] is True

    # User A must see the uploaded dataset
    response = client.get(
        "/api/datasets",
        headers=headers_a,
    )

    assert response.status_code == 200
    datasets_a = response.json()["datasets"]

    assert any(
        dataset["filename"] == "user_a_dataset.csv"
        for dataset in datasets_a
    )

    # User B must NOT see User A's dataset
    response = client.get(
        "/api/datasets",
        headers=headers_b,
    )

    assert response.status_code == 200
    datasets_b = response.json()["datasets"]

    assert all(
        dataset["filename"] != "user_a_dataset.csv"
        for dataset in datasets_b
    )
def test_forecast_endpoint(client):
    _, headers = register_and_login(client)

    response = client.get(
        "/api/forecast",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()

    assert "forecast" in body
    assert "historical" in body
    assert "evaluation" in body


def test_anomalies_endpoint(client):
    _, headers = register_and_login(client)

    response = client.get(
        "/api/anomalies",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()

    assert isinstance(body, list)


def test_period_comparison(client):
    _, headers = register_and_login(client)

    response = client.get(
        "/api/compare",
        params={
            "period1_from": "2026-01-01",
            "period1_to": "2026-03-31",
            "period2_from": "2026-04-01",
            "period2_to": "2026-05-31",
        },
        headers=headers,
    )

    print("STATUS:", response.status_code)
    print("BODY:", response.text)

    assert response.status_code == 200

def test_business_analyst(client):
    _, headers = register_and_login(client)

    response = client.post(
        "/api/business-question",
        params={
            "question": "Which product generates the highest revenue?"
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()

    assert body
def test_admin_users_requires_admin_role(client):
    from backend.database import get_user, update_user_role
    from backend.auth import create_access_token

    # Analyst
    username_analyst, headers_analyst = register_and_login(client)

    response = client.get(
        "/api/admin/users",
        headers=headers_analyst
    )

    assert response.status_code == 403

    # Manager
    username_manager, headers_manager = register_and_login(client)

    manager = get_user(username_manager)
    update_user_role(manager[0], "manager")

    manager_token = create_access_token(
        username_manager,
        "manager"
    )

    headers_manager = {
        "Authorization": f"Bearer {manager_token}"
    }

    response = client.get(
        "/api/admin/users",
        headers=headers_manager
    )

    assert response.status_code == 403

    # Admin
    username_admin, headers_admin = register_and_login(client)

    admin = get_user(username_admin)
    update_user_role(admin[0], "admin")

    admin_token = create_access_token(
        username_admin,
        "admin"
    )

    headers_admin = {
        "Authorization": f"Bearer {admin_token}"
    }

    response = client.get(
        "/api/admin/users",
        headers=headers_admin
    )

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert len(data["users"]) >= 3
def test_admin_can_update_user_role(client):
    from backend.database import get_user
    from backend.auth import create_access_token

    # Create analyst
    username_analyst, headers_analyst = register_and_login(client)

    # Analyst cannot update roles
    response = client.put(
        f"/api/admin/users/{get_user(username_analyst)[0]}/role",
        params={"role": "manager"},
        headers=headers_analyst
    )

    assert response.status_code == 403

    # Create manager
    username_manager, headers_manager = register_and_login(client)

    manager = get_user(username_manager)

    # Give manager role directly for testing
    from backend.database import update_user_role

    update_user_role(manager[0], "manager")

    manager_token = create_access_token(
        username_manager,
        "manager"
    )

    headers_manager = {
        "Authorization": f"Bearer {manager_token}"
    }

    # Manager cannot update roles
    response = client.put(
        f"/api/admin/users/{manager[0]}/role",
        params={"role": "admin"},
        headers=headers_manager
    )

    assert response.status_code == 403

    # Create admin
    username_admin, headers_admin = register_and_login(client)

    admin = get_user(username_admin)

    update_user_role(admin[0], "admin")

    admin_token = create_access_token(
        username_admin,
        "admin"
    )

    headers_admin = {
        "Authorization": f"Bearer {admin_token}"
    }

    # Admin can promote analyst to manager
    response = client.put(
        f"/api/admin/users/{get_user(username_analyst)[0]}/role",
        params={"role": "manager"},
        headers=headers_admin
    )

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert data["role"] == "manager"

    # Verify database
    updated_user = get_user(username_analyst)

    assert updated_user[4] == "manager"

    # Invalid role
    response = client.put(
        f"/api/admin/users/{get_user(username_analyst)[0]}/role",
        params={"role": "superadmin"},
        headers=headers_admin
    )

    assert response.status_code == 400
def test_admin_can_update_user_role(client):
    from backend.database import get_user, update_user_role
    from backend.auth import create_access_token

    # Analyst
    username_analyst, headers_analyst = register_and_login(client)

    analyst = get_user(username_analyst)

    # Analyst must NOT be able to change roles
    response = client.put(
        f"/api/admin/users/{analyst[0]}/role",
        params={"role": "manager"},
        headers=headers_analyst
    )

    assert response.status_code == 403

    # Manager
    username_manager, _ = register_and_login(client)

    manager = get_user(username_manager)
    update_user_role(manager[0], "manager")

    manager_token = create_access_token(
        username_manager,
        "manager"
    )

    headers_manager = {
        "Authorization": f"Bearer {manager_token}"
    }

    response = client.put(
        f"/api/admin/users/{analyst[0]}/role",
        params={"role": "manager"},
        headers=headers_manager
    )

    assert response.status_code == 403

    # Admin
    username_admin, _ = register_and_login(client)

    admin = get_user(username_admin)
    update_user_role(admin[0], "admin")

    admin_token = create_access_token(
        username_admin,
        "admin"
    )

    headers_admin = {
        "Authorization": f"Bearer {admin_token}"
    }

    response = client.put(
        f"/api/admin/users/{analyst[0]}/role",
        params={"role": "manager"},
        headers=headers_admin
    )

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert data["user"]["username"] == username_analyst
    assert data["user"]["role"] == "manager"


def test_credentials_in_url_are_not_accepted(client):
    response = client.post("/api/login", params={"username": "a", "password": "b"})
    assert response.status_code == 422


def test_login_is_rate_limited_after_repeated_failures(client):
    from backend import auth

    auth.rate_limit_reset_all()
    username, _ = register_and_login(client)

    for _ in range(auth.LOGIN_MAX_FAILURES):
        response = client.post("/api/login", json={"username": username, "password": "wrong-password"})
        assert response.status_code == 200
        assert response.json()["success"] is False

    blocked = client.post("/api/login", json={"username": username, "password": "StrongPass123!"})
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    auth.rate_limit_reset_all()


def test_landing_page_and_seo_files(client):
    home = client.get("/")
    assert home.status_code == 200
    assert "<title>" in home.text and 'name="description"' in home.text

    robots = client.get("/robots.txt")
    assert robots.status_code == 200
    assert "Sitemap:" in robots.text and "Disallow: /api/" in robots.text

    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert "<loc>" in sitemap.text

    assert client.get("/app").status_code == 200
    assert client.get("/").headers.get("x-content-type-options") == "nosniff"


def test_upload_preview_and_flexible_upload(client):
    from io import BytesIO
    import pandas as pd

    _, headers = register_and_login(client)
    frame = pd.DataFrame({
        "Ημερομηνία": pd.to_datetime(["2025-01-10", "2025-02-10", "2025-03-10"]),
        "Κατηγορία": ["Καφές", "Τσάι", "Καφές"],
        "Πόλη": ["Αθήνα", "Αθήνα", "Λάρισα"],
        "Έσοδα": [100.5, 200.0, 300.0],
        "Σχόλιο": ["a", "b", "c"],
    })
    buffer = BytesIO()
    frame.to_excel(buffer, index=False)
    files = {"file": ("πωλήσεις.xlsx", buffer.getvalue(),
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}

    preview = client.post("/api/upload/preview", files=files, headers=headers).json()
    assert preview["success"] is True
    assert preview["mapping"]["sales"] == "Έσοδα" and preview["mapping"]["date"] == "Ημερομηνία"
    assert [c["name"] for c in preview["columns"]][:2] == ["Ημερομηνία", "Κατηγορία"]

    result = client.post("/api/upload", files=files, headers=headers).json()
    assert result["success"] is True
    assert result["filename"] == "πωλήσεις.csv"
    assert result["summary"]["products"] == ["Καφές", "Τσάι"]
    assert any("cost" in w.lower() for w in result["warnings"])

    kpis = client.get("/api/kpis", headers=headers).json()
    assert kpis["total_revenue"] == 600.5


def test_upload_with_explicit_mapping_and_unreadable_choice(client):
    import json

    _, headers = register_and_login(client)
    csv = b"d,x,y\n2025-01-01,10,5\n2025-01-02,20,6\n"
    files = {"file": ("m.csv", csv, "text/csv")}

    ok = client.post("/api/upload", files=files, headers=headers,
                     data={"mapping": json.dumps({"date": "d", "sales": "y", "cost": "x"})}).json()
    assert ok["success"] is True

    bad = client.post("/api/upload", files=files, headers=headers,
                      data={"mapping": json.dumps({"date": "x", "sales": "y"})}).json()
    assert bad["success"] is False and "dates" in bad["message"]


def test_upload_rejects_unsupported_files(client):
    _, headers = register_and_login(client)
    response = client.post("/api/upload", files={"file": ("a.pdf", b"x", "application/pdf")}, headers=headers)
    assert response.status_code == 400
    response = client.post("/api/upload", files={"file": ("a.xls", b"x", "application/vnd.ms-excel")}, headers=headers)
    assert response.status_code == 400 and ".xlsx" in response.json()["detail"]


def test_labels_follow_the_uploaded_columns(client):
    _, headers = register_and_login(client)

    assert client.get("/api/labels", headers=headers).json() == {"product": "Product", "region": "Region"}

    csv_content = "Ημερομηνία,Κατηγορία,Κατάστημα,Πωλήσεις\n2026-01-01,Καφές,Κέντρο,10\n2026-01-02,Σνακ,Πυλαία,5\n"
    result = client.post(
        "/api/upload",
        files={"file": ("shop.csv", csv_content.encode("utf-8"), "text/csv")},
        headers=headers,
    ).json()
    assert result["success"] is True
    assert client.get("/api/labels", headers=headers).json() == {"product": "Κατηγορία", "region": "Κατάστημα"}

    # another user is not affected
    _, other = register_and_login(client)
    assert client.get("/api/labels", headers=other).json()["product"] == "Product"

    client.post("/api/reset", headers=headers)
    assert client.get("/api/labels", headers=headers).json()["product"] == "Product"
