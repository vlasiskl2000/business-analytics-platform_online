import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from dotenv import load_dotenv
from passlib.context import CryptContext

load_dotenv()

# In production, set SECRET_KEY as an environment variable.
# A random development key is generated when no key is configured.
SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_urlsafe(32)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
)

pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str):
    return pwd_context.verify(password, password_hash)


def create_access_token(username: str, role: str = "analyst"):
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": username,
        "role": role,
        "exp": expire
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


security = HTTPBearer()


# ---------------------------------------------------------------------------
# Recovery codes (reset a forgotten password without e-mail) and demo access
# ---------------------------------------------------------------------------
RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"      # no 0/O/1/I
from backend.data_loader import DEMO_USERNAME   # the demo account name lives next to its sample data
DEMO_ROLE = "demo"
RESERVED_USERNAMES = {"demo", "demo-visitor"}


def generate_recovery_code() -> str:
    """16 random characters shown as XXXX-XXXX-XXXX-XXXX (about 80 bits)."""
    raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(16))
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


def normalize_recovery_code(code: str) -> str:
    return "".join(ch for ch in str(code or "").upper() if ch.isalnum())


def hash_recovery_code(code: str) -> str:
    return pwd_context.hash(normalize_recovery_code(code))


def verify_recovery_code(code: str, code_hash) -> bool:
    if not code_hash or len(normalize_recovery_code(code)) != 16:
        return False
    try:
        return pwd_context.verify(normalize_recovery_code(code), code_hash)
    except Exception:
        return False


def token_role(token: str):
    """Role stored in a valid token, or None."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM]).get("role", "analyst")
    except JWTError:
        return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        username = payload.get("sub")

        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token."
            )

        return username

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"}
        )


def get_current_user_with_role(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        username = payload.get("sub")
        role = payload.get("role", "analyst")

        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token."
            )

        return {
            "username": username,
            "role": role
        }

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"}
        )


def require_role(*allowed_roles):
    def role_checker(
        current_user: dict = Depends(get_current_user_with_role)
    ):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions."
            )

        return current_user

    return role_checker


# ---------------------------------------------------------------------------
# Simple in-memory rate limiting (per server process).
# Protects login and registration against password guessing and spam.
# Limits can be changed with environment variables.
# ---------------------------------------------------------------------------
LOGIN_MAX_FAILURES = int(os.getenv("LOGIN_MAX_FAILURES", "5"))
LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "900"))
LOGIN_MAX_FAILURES_PER_IP = int(os.getenv("LOGIN_MAX_FAILURES_PER_IP", "25"))
REGISTER_MAX_PER_WINDOW = int(os.getenv("REGISTER_MAX_PER_WINDOW", "10"))
REGISTER_WINDOW_SECONDS = int(os.getenv("REGISTER_WINDOW_SECONDS", "3600"))

_rate_lock = threading.Lock()
_rate_events: dict[str, list[float]] = {}


def client_ip(request: Request) -> str:
    # Behind a proxy (Render, nginx) the address is in X-Forwarded-For. The proxy
    # appends to the list, so the LAST entry is the one it vouches for; the first
    # entries can be invented by the client.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def _recent(key: str, window: int) -> list[float]:
    now = time.monotonic()
    events = [t for t in _rate_events.get(key, []) if now - t < window]
    if events:
        _rate_events[key] = events
    else:
        _rate_events.pop(key, None)
    return events


def rate_limit_check(key: str, limit: int, window: int):
    """Raise 429 when `key` already used up `limit` events in the window."""
    with _rate_lock:
        events = _recent(key, window)
        if len(events) >= limit:
            wait = int(window - (time.monotonic() - events[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Please try again in {max(1, wait // 60)} minute(s).",
                headers={"Retry-After": str(wait)}
            )


def rate_limit_record(key: str, window: int):
    with _rate_lock:
        _recent(key, window)
        _rate_events.setdefault(key, []).append(time.monotonic())


def rate_limit_clear(key: str):
    with _rate_lock:
        _rate_events.pop(key, None)


def rate_limit_reset_all():
    """Used by the tests."""
    with _rate_lock:
        _rate_events.clear()
