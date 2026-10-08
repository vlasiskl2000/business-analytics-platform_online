import sqlite3
import os

DATABASE_PATH = "data/business_analytics.db"


def get_connection():
    os.makedirs("data", exist_ok=True)
    return sqlite3.connect(DATABASE_PATH)


def create_tables():
    connection = get_connection()
    cursor = connection.cursor()

    # Datasets
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS datasets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            filename TEXT NOT NULL,
            uploaded_at TEXT NOT NULL,
            rows INTEGER NOT NULL,
            is_active INTEGER DEFAULT 0,
            owner_username TEXT
        )
    """)

    columns = [
        c[1] for c in cursor.execute(
            "PRAGMA table_info(datasets)"
        ).fetchall()
    ]

    if "is_active" not in columns:
        cursor.execute(
            "ALTER TABLE datasets ADD COLUMN is_active INTEGER DEFAULT 0"
        )

    if "owner_username" not in columns:
        cursor.execute(
            "ALTER TABLE datasets ADD COLUMN owner_username TEXT"
        )

    # Users
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'analyst'
        )
    """)

    user_columns = [
        c[1] for c in cursor.execute(
            "PRAGMA table_info(users)"
        ).fetchall()
    ]

    if "role" not in user_columns:
        cursor.execute(
            "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'analyst'"
        )

    # Goals
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            metric TEXT NOT NULL,
            target REAL NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Alerts
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            severity TEXT NOT NULL,
            created_at TEXT NOT NULL,
            is_read INTEGER DEFAULT 0
        )
    """)

    # Dashboard widgets
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_widgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            title TEXT NOT NULL,
            widget_type TEXT NOT NULL,
            metric TEXT NOT NULL,
            dimension TEXT,
            position INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)

    # Existing datasets belong to the first existing account when possible.
    first_user = cursor.execute(
        "SELECT username FROM users ORDER BY id LIMIT 1"
    ).fetchone()

    if first_user:
        cursor.execute(
            "UPDATE datasets SET owner_username = ? "
            "WHERE owner_username IS NULL",
            (first_user[0],)
        )

    connection.commit()
    connection.close()


def create_user(username, password_hash, created_at, role="analyst"):
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO users
        (username, password_hash, created_at, role)
        VALUES (?, ?, ?, ?)
        """,
        (username, password_hash, created_at, role)
    )
    connection.commit()
    connection.close()


def get_user(username):
    connection = get_connection()
    cursor = connection.cursor()
    user = cursor.execute(
        """
        SELECT id, username, password_hash, created_at, role
        FROM users
        WHERE username = ?
        """,
        (username,)
    ).fetchone()
    connection.close()
    return user
def get_users():
    connection = get_connection()
    cursor = connection.cursor()

    users = cursor.execute(
        """
        SELECT id, username, created_at, role
        FROM users
        ORDER BY id ASC
        """
    ).fetchall()

    connection.close()
    return users
def update_user_role(user_id, role):
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        "UPDATE users SET role = ? WHERE id = ?",
        (role, user_id)
    )

    connection.commit()
    connection.close()


def save_dataset(name, filename, uploaded_at, rows, owner_username):
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        "UPDATE datasets SET is_active = 0 WHERE owner_username = ?",
        (owner_username,)
    )
    cursor.execute("""
    INSERT INTO datasets
    (name, filename, uploaded_at, rows, is_active, owner_username)
    VALUES (?, ?, ?, ?, 1, ?)
""", (name, filename, uploaded_at, rows, owner_username))
    connection.commit()
    connection.close()


def get_datasets(owner_username=None):
    connection = get_connection()
    cursor = connection.cursor()

    if owner_username:
        # Claim legacy datasets once for the first authenticated workspace.
        owned = cursor.execute("""
            SELECT id, name, filename, uploaded_at, rows, is_active
            FROM datasets
            WHERE owner_username = ?
            ORDER BY id DESC
        """, (owner_username,)).fetchall()

        if not owned:
            cursor.execute(
                "UPDATE datasets SET owner_username = ? WHERE owner_username IS NULL",
                (owner_username,)
            )
            connection.commit()

        datasets = cursor.execute("""
            SELECT id, name, filename, uploaded_at, rows, is_active
            FROM datasets
            WHERE owner_username = ?
            ORDER BY id DESC
        """, (owner_username,)).fetchall()
    else:
        datasets = cursor.execute("""
            SELECT id, name, filename, uploaded_at, rows, is_active
            FROM datasets
            ORDER BY id DESC
        """).fetchall()

    connection.close()
    return datasets


def delete_dataset(dataset_id, owner_username=None):
    connection = get_connection()
    cursor = connection.cursor()
    if owner_username:
        cursor.execute(
            "DELETE FROM datasets WHERE id = ? AND owner_username = ?",
            (dataset_id, owner_username)
        )
    else:
        cursor.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
    connection.commit()
    connection.close()


def set_active_dataset(dataset_id, owner_username=None):
    connection = get_connection()
    cursor = connection.cursor()

    if owner_username:
        cursor.execute(
            "UPDATE datasets SET is_active = 0 WHERE owner_username = ?",
            (owner_username,)
        )
        cursor.execute(
            "UPDATE datasets SET is_active = 1 WHERE id = ? AND owner_username = ?",
            (dataset_id, owner_username)
        )
    else:
        cursor.execute("UPDATE datasets SET is_active = 0")
        cursor.execute(
            "UPDATE datasets SET is_active = 1 WHERE id = ?",
            (dataset_id,)
        )

    connection.commit()
    connection.close()


def create_goal(username, metric, target, created_at):
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        "INSERT INTO goals (username, metric, target, created_at) VALUES (?, ?, ?, ?)",
        (username, metric, target, created_at)
    )
    connection.commit()
    connection.close()


def get_goals(username):
    connection = get_connection()
    rows = connection.cursor().execute(
        "SELECT id, metric, target, created_at FROM goals WHERE username = ? ORDER BY id DESC",
        (username,)
    ).fetchall()
    connection.close()
    return rows


def delete_goal(goal_id, username):
    connection = get_connection()
    connection.cursor().execute(
        "DELETE FROM goals WHERE id = ? AND username = ?",
        (goal_id, username)
    )
    connection.commit()
    connection.close()


def create_alert(username, title, message, severity, created_at):
    connection = get_connection()
    connection.cursor().execute("""
        INSERT INTO alerts (username, title, message, severity, created_at, is_read)
        VALUES (?, ?, ?, ?, ?, 0)
    """, (username, title, message, severity, created_at))
    connection.commit()
    connection.close()


def get_alerts(username):
    connection = get_connection()
    rows = connection.cursor().execute("""
        SELECT id, title, message, severity, created_at, is_read
        FROM alerts WHERE username = ? ORDER BY id DESC
    """, (username,)).fetchall()
    connection.close()
    return rows


def mark_alert_read(alert_id, username):
    connection = get_connection()
    connection.cursor().execute(
        "UPDATE alerts SET is_read = 1 WHERE id = ? AND username = ?",
        (alert_id, username)
    )
    connection.commit()
    connection.close()


def clear_active_dataset(owner_username):
    connection = get_connection()
    connection.cursor().execute(
        "UPDATE datasets SET is_active = 0 WHERE owner_username = ?",
        (owner_username,)
    )
    connection.commit()
    connection.close()


def create_dashboard_widget(username, title, widget_type, metric, dimension, position, created_at):
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute("""
        INSERT INTO dashboard_widgets
        (username, title, widget_type, metric, dimension, position, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (username, title, widget_type, metric, dimension, position, created_at))
    widget_id = cursor.lastrowid
    connection.commit()
    connection.close()
    return widget_id


def get_dashboard_widgets(username):
    connection = get_connection()
    rows = connection.cursor().execute("""
        SELECT id, title, widget_type, metric, dimension, position, created_at
        FROM dashboard_widgets
        WHERE username = ?
        ORDER BY position ASC, id ASC
    """, (username,)).fetchall()
    connection.close()
    return rows


def delete_dashboard_widget(widget_id, username):
    connection = get_connection()
    connection.cursor().execute(
        "DELETE FROM dashboard_widgets WHERE id = ? AND username = ?",
        (widget_id, username)
    )
    connection.commit()
    connection.close()


def update_dashboard_positions(username, positions):
    connection = get_connection()
    cursor = connection.cursor()
    for widget_id, position in positions:
        cursor.execute(
            "UPDATE dashboard_widgets SET position = ? WHERE id = ? AND username = ?",
            (position, widget_id, username)
        )
    connection.commit()
    connection.close()
