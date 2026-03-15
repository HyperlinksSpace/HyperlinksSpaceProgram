import os
import asyncio
import json
import time
import hashlib
import hmac
import re
from aiohttp import web
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, ContextTypes, CallbackQueryHandler, filters
from telegram.error import Conflict, TelegramError, NetworkError, TimedOut, RetryAfter
import asyncpg
import httpx
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
try:
    # Running from bot/ directory (local dev) resolves app.* to bot/app.
    from app.ai_client import post_chat_once, stream_chat
    from app.config import load_env, get_ai_backend_url
    from app.prompts import (
        LANGUAGE_SYSTEM_HINT,
        THINKING_TEXT,
        build_regen_system_prompt,
        build_default_system_prompt,
        detect_language_from_text,
        get_last_user_message_from_history,
    )
except ModuleNotFoundError:
    # Running from repo root needs explicit bot.app.* to avoid root app/ collision.
    from bot.app.ai_client import post_chat_once, stream_chat
    from bot.app.config import load_env, get_ai_backend_url
    from bot.app.prompts import (
        LANGUAGE_SYSTEM_HINT,
        THINKING_TEXT,
        build_regen_system_prompt,
        build_default_system_prompt,
        detect_language_from_text,
        get_last_user_message_from_history,
    )

load_env()

# Database connection pool
_db_pool = None
_db_disabled_notice_printed = False
_message_prompt_map = {}
_stream_cancel_events: dict[tuple[int, int], asyncio.Event] = {}
_active_bot_msg_by_chat: dict[int, int] = {}
_active_stream_tasks: dict[tuple[int, int], asyncio.Task] = {}
_lang_switch_locks: dict[tuple[int, int], asyncio.Lock] = {}
_lang_switch_last_tap: dict[tuple[int, int], float] = {}
_http_runner: web.AppRunner | None = None
LANG_SWITCH_DEBOUNCE_SECONDS = 0.5
DEFAULT_THINKING_TEXT = "Thinking..."


def _mask_secret(value: str, visible: int = 4) -> str:
    if not value:
        return "(missing)"
    if len(value) <= visible * 2:
        return "*" * len(value)
    return f"{value[:visible]}...{value[-visible:]}"


def _key_fingerprint(value: str) -> str:
    if not value:
        return "(missing)"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:6]


def _resolve_inner_calls_key_with_source() -> tuple[str, str]:
    for name in ("INNER_CALLS_KEY", "SELF_API_KEY", "API_KEY", "AI_KEY"):
        raw = (os.getenv(name) or "").strip()
        if raw:
            return raw, name
    return "", "(none)"


def _log_runtime_env_snapshot() -> None:
    ai_backend_url = get_ai_backend_url()
    key, key_source = _resolve_inner_calls_key_with_source()
    app_url_raw = (os.getenv("APP_URL") or "").strip()
    app_url_built = build_app_launch_url()
    http_host = (os.getenv("HTTP_HOST") or "0.0.0.0").strip()
    http_port = (os.getenv("PORT") or os.getenv("HTTP_PORT") or "8080").strip()
    db_set = bool((os.getenv("DATABASE_URL") or "").strip())
    print("[ENV][BOT] runtime configuration snapshot")
    print(f"[ENV][BOT] AI_BACKEND_URL={ai_backend_url}")
    print(f"[ENV][BOT] INNER_CALLS_KEY source={key_source} preview={_mask_secret(key)}")
    print(f"[ENV][BOT] INNER_CALLS_KEY sha256_prefix={_key_fingerprint(key)}")
    print(f"[ENV][BOT] APP_URL raw={app_url_raw or '(missing)'}")
    print(f"[ENV][BOT] APP_URL valid_launch_url={bool(app_url_built)}")
    print(f"[ENV][BOT] HTTP bind host={http_host} port={http_port}")
    print(f"[ENV][BOT] DATABASE_URL configured={db_set}")


def log_timing(label: str, start_time: float) -> float:
    """Log elapsed time and return current time for next measurement."""
    elapsed = time.perf_counter() - start_time
    print(f"[TIMING] {label}: {elapsed*1000:.1f}ms")
    return time.perf_counter()


def build_language_keyboard(message_id: int) -> InlineKeyboardMarkup:
    keyboard = [[
        InlineKeyboardButton("EN", callback_data=f"lang:en:{message_id}"),
        InlineKeyboardButton("RU", callback_data=f"lang:ru:{message_id}")
    ]]
    return InlineKeyboardMarkup(keyboard)


def build_typing_indicator_frames(base_text: str) -> list[str]:
    """Convert a static thinking label into a simple rotating dot animation."""
    normalized = (base_text or "").strip() or DEFAULT_THINKING_TEXT
    stem = normalized.rstrip()
    stem_without_dots = stem.rstrip(".…").rstrip()
    if stem_without_dots:
        stem = stem_without_dots
    return [f"{stem}.", f"{stem}..", f"{stem}..."]


def get_initial_typing_indicator_text(lang: str) -> str:
    return build_typing_indicator_frames(THINKING_TEXT.get(lang, THINKING_TEXT["en"]))[0]


def truncate_telegram_text(text: str, max_length: int = 4096) -> str:
    if len(text) > max_length:
        return text[:max_length - 3] + "..."
    return text


def build_app_launch_url() -> str | None:
    """Build a valid Mini App URL with mode=fullscreen when APP_URL is configured."""
    raw = (os.getenv("APP_URL") or "").strip()
    if not raw:
        return None
    # Default to https:// when no scheme (e.g. myapp.railway.app)
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"

    parsed = urlparse(raw)
    # Reject if scheme/netloc invalid or netloc contains whitespace/control chars (Telegram rejects)
    netloc = (parsed.netloc or "").strip()
    if parsed.scheme not in ("http", "https") or not netloc:
        return None
    if any(ord(c) < 32 or c in " \t\n\r" for c in netloc):
        return None

    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["mode"] = "fullscreen"
    path = (parsed.path or "/").strip() or "/"
    result = urlunparse((
        parsed.scheme,
        netloc,
        path,
        parsed.params,
        urlencode(query),
        parsed.fragment
    ))
    # Final sanity check: no control chars in URL (Telegram can reject)
    if any(ord(c) < 32 for c in result):
        return None
    return result


async def cancel_stream(chat_id: int, message_id: int) -> None:
    """Signal cancellation only. Do not await old task cleanup."""
    key = (chat_id, message_id)
    cancel_start = time.perf_counter()
    event = _stream_cancel_events.get(key)
    if event and not event.is_set():
        event.set()
    task = _active_stream_tasks.pop(key, None)
    if task and not task.done():
        task.cancel()
    log_timing(f"Cancel stream (signal-only) {message_id}", cancel_start)


async def get_db_pool():
    """Get or create database connection pool"""
    global _db_pool, _db_disabled_notice_printed
    if _db_pool is None:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            if not _db_disabled_notice_printed:
                print("Database disabled: DATABASE_URL is not set (history/user persistence off).")
                _db_disabled_notice_printed = True
            return None
        
        # For local development on Windows, handle SSL certificate issues
        # In production (Railway), SSL will work fine
        import ssl
        
        try:
            # Try with SSL first (required for Neon)
            ssl_context = ssl.create_default_context()
            _db_pool = await asyncpg.create_pool(
                database_url,
                ssl=ssl_context
            )
        except Exception as e:
            # If SSL fails on Windows, try with relaxed SSL settings
            print(f"SSL connection failed with default context: {e}")
            print("Trying with relaxed SSL settings for local development...")
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            try:
                _db_pool = await asyncpg.create_pool(
                    database_url,
                    ssl=ssl_context
                )
            except Exception as e2:
                print(f"SSL connection failed even with relaxed settings: {e2}")
                raise
    return _db_pool


async def init_db():
    """Initialize database - create users and messages tables if they don't exist"""
    pool = await get_db_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        # Create users table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                language_code VARCHAR(10),
                created_at TIMESTAMP DEFAULT ((now() AT TIME ZONE 'UTC') + INTERVAL '3 hours'),
                updated_at TIMESTAMP DEFAULT ((now() AT TIME ZONE 'UTC') + INTERVAL '3 hours'),
                last_active_at TIMESTAMP DEFAULT ((now() AT TIME ZONE 'UTC') + INTERVAL '3 hours')
            )
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)
        """)
        await conn.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS has_wallet BOOLEAN NOT NULL DEFAULT FALSE
        """)
        await conn.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS wallet_assigned_at TIMESTAMP NULL
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users((lower(username)))
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_has_wallet ON users(has_wallet)
        """)
        
        # Create messages table for conversation history
        # Each user's messages are stored separately using telegram_id as the key
        # The composite index on (telegram_id, created_at) ensures efficient per-user history retrieval
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT NOT NULL,
                role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT ((now() AT TIME ZONE 'UTC') + INTERVAL '3 hours'),
                FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
            )
        """)
        # Index for filtering messages by user (telegram_id)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_telegram_id ON messages(telegram_id)
        """)
        # Composite index for efficient per-user history retrieval (ordered by timestamp)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(telegram_id, created_at ASC)
        """)
        print("Database initialized: users and messages tables created/verified")
    return True


async def save_user_async(update: Update):
    """Save or update user in database asynchronously (non-blocking)"""
    try:
        pool = await get_db_pool()
        if pool is None:
            return
        user = update.effective_user
        
        async with pool.acquire() as conn:
            # Use PostgreSQL's INSERT ... ON CONFLICT for atomic upsert in ONE query
            # This is much faster than checking existence first
            # All timestamps use UTC+3 timezone (Moscow time)
            await conn.execute("""
                INSERT INTO users (telegram_id, username, first_name, last_name, language_code, last_active_at)
                VALUES ($1, $2, $3, $4, $5, (now() AT TIME ZONE 'UTC') + INTERVAL '3 hours')
                ON CONFLICT (telegram_id) 
                DO UPDATE SET 
                    username = EXCLUDED.username,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    language_code = EXCLUDED.language_code,
                    last_active_at = (now() AT TIME ZONE 'UTC') + INTERVAL '3 hours',
                    updated_at = (now() AT TIME ZONE 'UTC') + INTERVAL '3 hours'
            """, 
                user.id,
                user.username,
                user.first_name,
                user.last_name,
                user.language_code
            )
    except Exception as e:
        print(f"Error saving user to database: {e}")


async def save_message(telegram_id: int, role: str, content: str):
    """
    Save a message to conversation history for a specific user
    Messages are stored separately per user using telegram_id as the key
    """
    try:
        pool = await get_db_pool()
        if pool is None:
            return
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO messages (telegram_id, role, content)
                VALUES ($1, $2, $3)
            """, telegram_id, role, content)
    except Exception as e:
        print(f"Error saving message to database: {e}")


async def get_conversation_history(telegram_id: int, limit: int = 5) -> list:
    """
    Retrieve conversation history for a specific user (separated by telegram_id)
    Each user's conversation is stored and fetched independently
    Returns list of dicts with 'role' and 'content' keys matching AI backend ChatMessage format
    """
    try:
        pool = await get_db_pool()
        if pool is None:
            return []
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT role, content
                FROM messages
                WHERE telegram_id = $1
                ORDER BY created_at ASC
                LIMIT $2
            """, telegram_id, limit)
            
            # Convert to list of dicts in AI backend ChatMessage format: {role, content}
            history = [
                {"role": row["role"], "content": row["content"]} 
                for row in rows
            ]
            return history
    except Exception as e:
        print(f"Error retrieving conversation history: {e}")
        return []


async def get_last_message_by_role(telegram_id: int, role: str) -> str | None:
    """Fetch latest message content for a user by role."""
    try:
        pool = await get_db_pool()
        if pool is None:
            return None
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT content
                FROM messages
                WHERE telegram_id = $1 AND role = $2
                ORDER BY created_at DESC
                LIMIT 1
            """, telegram_id, role)
            return row["content"] if row else None
    except Exception as e:
        print(f"Error retrieving last {role} message: {e}")
        return None


def _normalize_username(username: str) -> str:
    value = (username or "").strip()
    if value.startswith("@"):
        value = value[1:]
    return value.lower()


async def claim_wallet_for_username(username: str) -> str:
    """
    Atomically mark wallet assignment in the existing users DB.

    Returns one of:
    - assigned
    - already_assigned
    - user_not_found
    - invalid_username
    - db_unavailable
    """
    normalized = _normalize_username(username)
    if not normalized:
        return "invalid_username"

    pool = await get_db_pool()
    if pool is None:
        return "db_unavailable"

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                WITH candidate AS (
                    SELECT telegram_id
                    FROM users
                    WHERE lower(username) = $1
                    ORDER BY last_active_at DESC NULLS LAST, updated_at DESC NULLS LAST
                    LIMIT 1
                    FOR UPDATE
                )
                UPDATE users u
                SET
                    has_wallet = TRUE,
                    wallet_assigned_at = COALESCE(
                        u.wallet_assigned_at,
                        (now() AT TIME ZONE 'UTC') + INTERVAL '3 hours'
                    ),
                    updated_at = (now() AT TIME ZONE 'UTC') + INTERVAL '3 hours'
                FROM candidate c
                WHERE
                    u.telegram_id = c.telegram_id
                    AND COALESCE(u.has_wallet, FALSE) = FALSE
                RETURNING u.telegram_id
            """, normalized)
            if row:
                return "assigned"

            exists = await conn.fetchval("""
                SELECT 1
                FROM users
                WHERE lower(username) = $1
                LIMIT 1
            """, normalized)
            if exists:
                return "already_assigned"
            return "user_not_found"
    except Exception as e:
        print(f"Error claiming wallet for username={normalized}: {e}")
        return "db_unavailable"


async def ensure_user_exists_from_verified_user(user: dict) -> bool:
    """
    Upsert a verified Telegram user into users table.
    Returns True on success, False if DB is unavailable or insert fails.
    """
    telegram_id = user.get("id")
    username = _normalize_username(user.get("username") or "")
    if telegram_id is None or not username:
        return False

    pool = await get_db_pool()
    if pool is None:
        return False

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO users (
                    telegram_id, username, first_name, last_name, language_code, last_active_at
                )
                VALUES ($1, $2, $3, $4, $5, (now() AT TIME ZONE 'UTC') + INTERVAL '3 hours')
                ON CONFLICT (telegram_id)
                DO UPDATE SET
                    username = EXCLUDED.username,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    language_code = EXCLUDED.language_code,
                    last_active_at = (now() AT TIME ZONE 'UTC') + INTERVAL '3 hours',
                    updated_at = (now() AT TIME ZONE 'UTC') + INTERVAL '3 hours'
                """,
                int(telegram_id),
                username,
                user.get("first_name"),
                user.get("last_name"),
                user.get("language_code"),
            )
        return True
    except Exception as e:
        print(f"Error ensuring verified user row: {e}")
        return False


async def ensure_user_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler that ensures user exists in database (runs on all messages, non-blocking)"""
    # Run database operation asynchronously without blocking the response
    asyncio.create_task(save_user_async(update))
    # Don't return anything - let other handlers process the update


def _resolve_bot_api_key() -> str:
    key, _ = _resolve_inner_calls_key_with_source()
    return key


def _hmac_sha256(key: bytes, msg: bytes) -> bytes:
    return hmac.new(key, msg, hashlib.sha256).digest()


def verify_telegram_webapp_init_data(init_data: str, bot_token: str, max_age_seconds: int = 24 * 3600):
    """
    Verify Telegram WebApp initData and return parsed payload on success.
    Returns None if invalid.
    """
    if not init_data or not bot_token:
        return None

    try:
        pairs = parse_qsl(init_data, keep_blank_values=True)
        data = {k: v for k, v in pairs}
    except Exception:
        return None

    received_hash = data.pop("hash", None)
    if not received_hash:
        return None

    auth_date_str = data.get("auth_date")
    if auth_date_str:
        try:
            auth_date = int(auth_date_str)
            now = int(time.time())
            if auth_date > now + 60:
                return None
            if max_age_seconds is not None and (now - auth_date > max_age_seconds):
                return None
        except Exception:
            return None

    items = sorted((k, v) for k, v in data.items())
    data_check_string = "\n".join([f"{k}={v}" for k, v in items]).encode("utf-8")
    secret_key = _hmac_sha256(b"WebAppData", bot_token.encode("utf-8"))
    computed_hash = hmac.new(secret_key, data_check_string, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        return None

    user_raw = data.get("user")
    if user_raw:
        try:
            data["user"] = json.loads(user_raw)
        except Exception:
            return None

    return data


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    }


def _with_cors(resp: web.StreamResponse) -> web.StreamResponse:
    for key, value in _cors_headers().items():
        resp.headers[key] = value
    return resp


def _json_response(payload: dict, status: int = 200) -> web.Response:
    return _with_cors(
        web.Response(
            text=json.dumps(payload, ensure_ascii=False),
            status=status,
            content_type="application/json",
        )
    )


def _prompt_unavailable_response() -> web.Response:
    text = "AI service unavailable"
    ndjson_lines = [
        json.dumps({"token": text, "done": False}, ensure_ascii=False),
        json.dumps({"response": text, "done": True}, ensure_ascii=False),
    ]
    return _with_cors(
        web.Response(
            text="\n".join(ndjson_lines) + "\n",
            status=200,
            content_type="application/x-ndjson",
        )
    )


def _authorize_request(request: web.Request) -> tuple[bool, web.Response | None]:
    api_key = _resolve_bot_api_key()
    path = request.path
    if not api_key:
        print(f"[BOT_HTTP_API] auth failed: INNER_CALLS_KEY (or aliases) not configured (path={path})")
        return False, _json_response(
            {"error": "INNER_CALLS_KEY is not configured on this service."},
            status=503
        )
    incoming = (request.headers.get("X-API-Key") or "").strip()
    if not incoming:
        print(f"[BOT_HTTP_API] auth failed: missing X-API-Key header (path={path})")
        return False, _json_response(
            {"error": "X-API-Key header is required."},
            status=401
        )
    if incoming != api_key:
        print(f"[BOT_HTTP_API] auth failed: invalid X-API-Key (path={path})")
        return False, _json_response(
            {"error": "Invalid API key."},
            status=403
        )
    return True, None


async def http_root_handler(request: web.Request) -> web.Response:
    return _json_response({"status": "ok", "service": "bot-api"})


async def http_health_handler(request: web.Request) -> web.Response:
    return _json_response({
        "status": "ok",
        "service": "bot-api",
        "security": {
            "self_api_key_configured": bool(_resolve_bot_api_key()),
        },
    })


async def http_options_handler(request: web.Request) -> web.Response:
    return _with_cors(web.Response(status=200))


async def http_chat_proxy_handler(request: web.Request) -> web.Response:
    print(f"[BOT_HTTP_API] /api/chat request from {request.remote}")
    authorized, auth_error = _authorize_request(request)
    if not authorized:
        return auth_error  # type: ignore[return-value]

    try:
        payload = await request.json()
    except Exception:
        return _json_response({"error": "Invalid JSON body."}, status=400)

    messages = payload.get("messages") if isinstance(payload, dict) else None
    if not isinstance(messages, list) or not messages:
        return _json_response({"error": "messages array cannot be empty."}, status=400)

    # Keep HTTP proxy language behavior consistent with Telegram path:
    # current message language wins; ticker-only inputs can inherit prior user language.
    user_messages = [
        m.get("content", "").strip()
        for m in messages
        if isinstance(m, dict) and m.get("role") == "user" and isinstance(m.get("content"), str)
    ]
    current_user_text = user_messages[-1] if user_messages else ""
    prev_user_text = user_messages[-2] if len(user_messages) >= 2 else ""
    history_lang = detect_language_from_text(prev_user_text) if prev_user_text else "en"
    message_lang = detect_language_from_text(current_user_text, default=history_lang)
    if re.fullmatch(r"\$?[A-Za-z0-9]{2,10}", current_user_text):
        message_lang = history_lang
    proxied_messages = [{"role": "system", "content": build_default_system_prompt(message_lang)}]
    proxied_messages.extend(messages)

    api_key = _resolve_bot_api_key()
    timeout_s = float(os.getenv("HTTP_API_TIMEOUT_SECONDS", "120"))

    try:
        upstream_status, upstream_text, upstream_content_type = await post_chat_once(
            messages=proxied_messages,
            api_key=api_key,
            timeout_s=timeout_s,
        )
    except httpx.TimeoutException:
        return _prompt_unavailable_response()
    except httpx.RequestError as e:
        print(f"[BOT_HTTP_API] AI backend request error: {e}")
        return _prompt_unavailable_response()

    if upstream_status != 200:
        print(f"[BOT_HTTP_API] AI backend status={upstream_status}; returning fallback prompt")
        return _prompt_unavailable_response()

    response_content_type = upstream_content_type
    print(f"[BOT_HTTP_API] upstream status={upstream_status} content-type={response_content_type}")
    return _with_cors(
        web.Response(
            text=upstream_text,
            status=upstream_status,
            content_type=response_content_type.split(";")[0],
        )
    )


async def auth_telegram(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return _json_response({"ok": False, "error": "bad_json"}, status=400)

    init_data = body.get("initData") if isinstance(body, dict) else None
    if not init_data or not isinstance(init_data, str):
        return _json_response({"ok": False, "error": "missing_initData"}, status=400)

    bot_token = (os.getenv("BOT_TOKEN") or "").strip()
    verified = verify_telegram_webapp_init_data(init_data, bot_token, max_age_seconds=24 * 3600)
    if not verified:
        return _json_response({"ok": False, "error": "invalid_initdata"}, status=401)

    user = verified.get("user") if isinstance(verified.get("user"), dict) else {}
    username = _normalize_username(user.get("username") or "")
    if not username:
        return _json_response({"ok": False, "error": "username_required"}, status=400)

    ensured = await ensure_user_exists_from_verified_user(user)
    if not ensured:
        return _json_response({"ok": False, "error": "db_unavailable"}, status=503)

    claim_status = await claim_wallet_for_username(username)
    if claim_status in {"assigned", "already_assigned"}:
        print(f"auth_telegram username={username} wallet_status={claim_status}")
        return _json_response(
            {
                "ok": True,
                "user": {
                    "id": user.get("id"),
                    "username": username,
                    "first_name": user.get("first_name"),
                    "last_name": user.get("last_name"),
                    "language_code": user.get("language_code"),
                },
                "wallet_status": claim_status,
                "newly_assigned": claim_status == "assigned",
            },
            status=200,
        )
    if claim_status == "user_not_found":
        return _json_response({"ok": False, "error": "user_not_found"}, status=404)
    if claim_status == "invalid_username":
        return _json_response({"ok": False, "error": "invalid_username"}, status=400)
    if claim_status == "db_unavailable":
        return _json_response({"ok": False, "error": "db_unavailable"}, status=503)
    return _json_response({"ok": False, "error": "wallet_claim_unknown_status"}, status=500)


async def http_wallet_ensure_handler(request: web.Request) -> web.Response:
    authorized, auth_error = _authorize_request(request)
    if not authorized:
        return auth_error  # type: ignore[return-value]

    try:
        payload = await request.json()
    except Exception:
        return _json_response({"error": "Invalid JSON body."}, status=400)

    username = payload.get("username") if isinstance(payload, dict) else None
    if not isinstance(username, str):
        return _json_response({"error": "username is required."}, status=400)

    result = await claim_wallet_for_username(username)
    if result == "assigned":
        return _json_response(
            {"status": "ok", "wallet_status": "assigned", "newly_assigned": True},
            status=200,
        )
    if result == "already_assigned":
        return _json_response(
            {"status": "ok", "wallet_status": "already_assigned", "newly_assigned": False},
            status=200,
        )
    if result == "user_not_found":
        return _json_response({"error": "user_not_found"}, status=404)
    if result == "invalid_username":
        return _json_response({"error": "invalid_username"}, status=400)
    return _json_response({"error": "database_unavailable"}, status=503)


async def start_http_api_server() -> None:
    global _http_runner
    if _http_runner is not None:
        return

    app = web.Application()
    app.router.add_get("/", http_root_handler)
    app.router.add_get("/health", http_health_handler)
    app.router.add_post("/auth/telegram", auth_telegram)
    app.router.add_post("/api/chat", http_chat_proxy_handler)
    app.router.add_post("/wallet/ensure", http_wallet_ensure_handler)
    app.router.add_options("/auth/telegram", http_options_handler)
    app.router.add_options("/api/chat", http_options_handler)
    app.router.add_options("/wallet/ensure", http_options_handler)
    app.router.add_options("/", http_options_handler)
    app.router.add_options("/health", http_options_handler)

    _http_runner = web.AppRunner(app)
    await _http_runner.setup()
    host = os.getenv("HTTP_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("HTTP_PORT", "8080")))
    site = web.TCPSite(_http_runner, host=host, port=port)
    await site.start()
    print(f"Bot HTTP API started at http://{host}:{port}")


async def stop_http_api_server() -> None:
    global _http_runner
    if _http_runner is not None:
        await _http_runner.cleanup()
        _http_runner = None
        print("Bot HTTP API stopped")


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    err = context.error
    if isinstance(err, Conflict):
        print(f"[bot_error] fatal Conflict: {err}")
        print("Stopping bot: another instance is already consuming updates for this token.")
        if context.application:
            asyncio.create_task(context.application.stop())
        return
    if isinstance(err, (NetworkError, TimedOut, RetryAfter)):
        print(f"[bot_error] transient: {type(err).__name__}: {err}")
        return
    print(f"[bot_error] {type(err).__name__}: {err}")


async def hello(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start: always send a reply; use Run app button only when APP_URL is valid."""
    app_launch_url = build_app_launch_url()
    message_text = "That's @HyperlinksSpaceBot, you can use AI in bot and explore the app for more features"

    if app_launch_url:
        try:
            keyboard = [[InlineKeyboardButton("Run app", url=app_launch_url)]]
            await update.message.reply_text(
                message_text,
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            return
        except Exception as e:
            print(f"[BOT] /start: reply with button failed ({e}), falling back to text-only")
    # No valid APP_URL or button failed: send text so /start always responds
    if app_launch_url:
        await update.message.reply_text(message_text)
    else:
        await update.message.reply_text(
            f"{message_text}\n\nMini app URL is not configured. Set APP_URL (for example via Tunnel/railway.env)."
        )


async def stream_ai_response(
    messages: list,
    bot,
    chat_id: int,
    message_id: int,
    telegram_id: int,
    thinking_text: str | None = None,
):
    """
    Stream AI response and edit message as chunks arrive
    messages: List of message dicts with 'role' and 'content' (AI backend ChatMessage format)
    """
    stream_start = time.perf_counter()
    api_key, key_source = _resolve_inner_calls_key_with_source()
    ai_backend_url = get_ai_backend_url()
    if not api_key:
        raise ValueError("Set one of INNER_CALLS_KEY, SELF_API_KEY, API_KEY, or AI_KEY")
    
    accumulated_text = ""
    last_edit_time = asyncio.get_event_loop().time()
    edit_interval = float(os.getenv("EDIT_INTERVAL_SECONDS", "1"))
    typing_interval = float(os.getenv("THINKING_ANIMATION_INTERVAL_SECONDS", "0.35"))
    typing_frames = build_typing_indicator_frames(thinking_text or DEFAULT_THINKING_TEXT)
    last_sent_text = (thinking_text or "").strip()
    first_response_sent = False
    current_message_id = message_id
    key = (chat_id, message_id)
    tracked_keys = {key}
    cancel_event = asyncio.Event()
    typing_stop_event = asyncio.Event()
    _stream_cancel_events[key] = cancel_event
    current_task = asyncio.current_task()
    if current_task:
        _active_stream_tasks.setdefault(key, current_task)
    message_edit_lock = asyncio.Lock()
    typing_task: asyncio.Task | None = None

    async def stop_typing_indicator():
        nonlocal typing_task
        if typing_stop_event.is_set():
            return
        typing_stop_event.set()
        if typing_task and not typing_task.done():
            typing_task.cancel()
            try:
                await typing_task
            except asyncio.CancelledError:
                pass

    async def animate_typing_indicator():
        nonlocal last_sent_text
        if not typing_frames or typing_interval <= 0:
            return
        frame_index = 1 if last_sent_text == typing_frames[0] and len(typing_frames) > 1 else 0
        try:
            while not cancel_event.is_set() and not typing_stop_event.is_set():
                await asyncio.sleep(typing_interval)
                if cancel_event.is_set() or typing_stop_event.is_set():
                    return
                next_text = typing_frames[frame_index % len(typing_frames)]
                frame_index += 1
                if next_text == last_sent_text:
                    continue
                try:
                    async with message_edit_lock:
                        if cancel_event.is_set() or typing_stop_event.is_set():
                            return
                        await bot.edit_message_text(
                            chat_id=chat_id,
                            message_id=current_message_id,
                            text=next_text,
                            reply_markup=build_language_keyboard(current_message_id),
                        )
                        last_sent_text = next_text
                except TelegramError as e:
                    if "not modified" not in str(e).lower():
                        print(f"Warning: Could not animate typing indicator for message {current_message_id}: {e}")
        except asyncio.CancelledError:
            raise

    async def edit_or_fallback_send(text: str):
        nonlocal current_message_id, last_sent_text, tracked_keys
        if not text or text == last_sent_text:
            return
        if cancel_event.is_set():
            return
        try:
            async with message_edit_lock:
                kwargs = {
                    "chat_id": chat_id,
                    "message_id": current_message_id,
                    "text": text,
                    "reply_markup": build_language_keyboard(current_message_id),
                }
                await bot.edit_message_text(**kwargs)
                last_sent_text = text
                return
        except TelegramError as e:
            if "not modified" in str(e).lower():
                return
            print(f"Warning: Could not edit message {current_message_id}: {e}. Falling back to send_message.")
        try:
            send_kwargs = {
                "chat_id": chat_id,
                "text": text,
                "reply_markup": build_language_keyboard(0),
            }
            sent = await bot.send_message(**send_kwargs)
            current_message_id = sent.message_id
            tracked_keys.add((chat_id, current_message_id))
            _stream_cancel_events[(chat_id, current_message_id)] = cancel_event
            if current_task:
                _active_stream_tasks[(chat_id, current_message_id)] = current_task
            _active_bot_msg_by_chat[chat_id] = current_message_id
            await bot.edit_message_reply_markup(
                chat_id=chat_id,
                message_id=current_message_id,
                reply_markup=build_language_keyboard(current_message_id)
            )
            last_sent_text = text
        except TelegramError as e:
            print(f"Warning: Could not send fallback message: {e}")

    if typing_frames and typing_interval > 0:
        typing_task = asyncio.create_task(animate_typing_indicator())
    
    try:
        async with stream_chat(messages=messages, api_key=api_key, timeout_s=60.0) as (ai_backend_url, response):
            log_timing("HTTP stream opened", stream_start)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                status_code = e.response.status_code if e.response is not None else "unknown"
                response_text = ""
                if e.response is not None:
                    try:
                        response_text = (await e.response.aread()).decode("utf-8", errors="replace")
                    except Exception:
                        try:
                            response_text = e.response.text
                        except Exception:
                            response_text = ""
                print(f"[AI_BACKEND_ERROR] status={status_code} body={response_text[:2000]}")
                print(
                    "[AI_BACKEND_ERROR] "
                    f"ai_backend_url={ai_backend_url} key_source={key_source} key_preview={_mask_secret(api_key)}"
                )
                await stop_typing_indicator()
                await edit_or_fallback_send(f"AI backend error (status {status_code}). Please try again.")
                return
            
            async for line in response.aiter_lines():
                if cancel_event.is_set():
                    return
                if line:
                    try:
                        data = json.loads(line)
                        # Log first chunk timing once
                        if not accumulated_text and "token" in data:
                            log_timing("First AI chunk received", stream_start)
                        if "error" in data:
                            error_text = f"Error: {data['error']}"
                            await stop_typing_indicator()
                            await edit_or_fallback_send(error_text)
                            return
                        
                        # Parse streaming response: token field contains partial content
                        if "token" in data:
                            accumulated_text += data["token"]
                        elif "response" in data:
                            accumulated_text = data["response"]

                        display_text = truncate_telegram_text(accumulated_text)
                        if display_text and not first_response_sent:
                            await stop_typing_indicator()
                            await edit_or_fallback_send(display_text)
                            last_edit_time = asyncio.get_event_loop().time()
                            first_response_sent = True
                            typing_task = None
                        
                        # Edit message periodically to avoid rate limits.
                        current_time = asyncio.get_event_loop().time()
                        if current_time - last_edit_time >= edit_interval:
                            if cancel_event.is_set():
                                return
                            if display_text and display_text != last_sent_text:
                                await edit_or_fallback_send(display_text)
                                last_edit_time = current_time
                        
                        if data.get("done", False):
                            break
                    except json.JSONDecodeError:
                        continue
                
            # Final edit with complete response as-is from backend
            response_text = truncate_telegram_text(accumulated_text)
            if cancel_event.is_set():
                return
            final_text = response_text
            if cancel_event.is_set():
                return
            
            await stop_typing_indicator()
            await edit_or_fallback_send(final_text)
            log_timing("Stream complete -> final edit sent", stream_start)
            
            # Save assistant response to conversation history
            if accumulated_text:
                asyncio.create_task(save_message(telegram_id, "assistant", accumulated_text))
            
            if not final_text:
                no_response_text = "Sorry, I didn't receive a response."
                await edit_or_fallback_send(no_response_text)
    except httpx.TimeoutException:
        error_text = "Sorry, the AI took too long to respond. Please try again."
        await stop_typing_indicator()
        await edit_or_fallback_send(error_text)
    except httpx.RequestError as e:
        error_text = (
            f"Sorry, I couldn't connect to the AI service at {ai_backend_url}. "
            f"Error: {str(e)}"
        )
        await stop_typing_indicator()
        await edit_or_fallback_send(error_text)
    except asyncio.CancelledError:
        print(f"Stream cancelled for message {message_id}")
        raise
    except Exception as e:
        error_text = f"Sorry, an error occurred: {str(e)}"
        await stop_typing_indicator()
        await edit_or_fallback_send(error_text)
    finally:
        await stop_typing_indicator()
        for tracked_key in list(tracked_keys):
            if _stream_cancel_events.get(tracked_key) is cancel_event:
                _stream_cancel_events.pop(tracked_key, None)
            if current_task and _active_stream_tasks.get(tracked_key) is current_task:
                _active_stream_tasks.pop(tracked_key, None)
            if _active_bot_msg_by_chat.get(chat_id) == tracked_key[1]:
                _active_bot_msg_by_chat.pop(chat_id, None)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle arbitrary text messages with AI responses"""
    if not update.message or not update.message.text:
        return
    
    message_text = update.message.text.strip()
    timing_start = time.perf_counter()
    timing_checkpoint = timing_start
    
    # Skip if message is empty or is a command
    if not message_text or message_text.startswith('/'):
        return
    
    telegram_id = update.effective_user.id
    chat_id = update.effective_chat.id
    prev_msg_id = _active_bot_msg_by_chat.get(chat_id)
    if prev_msg_id:
        await cancel_stream(chat_id, prev_msg_id)
    
    # Retrieve conversation history (before saving current message)
    history = await get_conversation_history(telegram_id, limit=5)
    last_user_message = get_last_user_message_from_history(history)

    # Prefer current message language.
    # For ticker-only inputs like "$TON" keep conversation language continuity.
    history_lang = detect_language_from_text(last_user_message) if last_user_message else "en"
    message_lang = detect_language_from_text(message_text, default=history_lang)
    if re.fullmatch(r"\$?[A-Za-z0-9]{2,10}", message_text.strip()):
        message_lang = history_lang
    
    # Build messages array according to AI backend API spec
    messages = [{
        "role": "system",
        "content": build_default_system_prompt(message_lang)
    }]
    
    # Add conversation history
    messages.extend(history)
    
    # Add current user message
    user_message = {"role": "user", "content": message_text}
    messages.append(user_message)
    
    # Save user message to database (async, non-blocking)
    asyncio.create_task(save_message(telegram_id, "user", message_text))
    
    # Send initial thinking message with immediate keyboard, then bind callback_data to the real message_id.
    thinking_text = get_initial_typing_indicator_text(message_lang)
    sent_message = await update.message.reply_text(
        thinking_text,
        reply_markup=build_language_keyboard(0),
    )
    try:
        await context.bot.edit_message_reply_markup(
            chat_id=sent_message.chat_id,
            message_id=sent_message.message_id,
            reply_markup=build_language_keyboard(sent_message.message_id),
        )
    except TelegramError as e:
        print(f"Warning: Could not update thinking keyboard binding: {e}")
    timing_checkpoint = log_timing("Message received -> Thinking sent", timing_start)
    _message_prompt_map[(sent_message.chat_id, sent_message.message_id)] = message_text
    _active_bot_msg_by_chat[sent_message.chat_id] = sent_message.message_id
    
    # Run stream generation in background so callback updates can be processed mid-stream.
    stream_task = asyncio.create_task(stream_ai_response(
        messages,
        context.bot,
        sent_message.chat_id,
        sent_message.message_id,
        telegram_id,
        thinking_text=thinking_text,
    ))
    _active_stream_tasks[(sent_message.chat_id, sent_message.message_id)] = stream_task
    log_timing("Stream task created", timing_checkpoint)


async def handle_language_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Regenerate response in selected language using original prompt when available."""
    query = update.callback_query
    if not query or not query.data:
        return
    # Always ack callback immediately to prevent Telegram retry/spinner loops.
    try:
        await query.answer()
    except TelegramError:
        pass

    parts = query.data.split(":", 2)
    if len(parts) != 3 or parts[0] != "lang":
        return

    lang = parts[1].lower()
    if lang not in LANGUAGE_SYSTEM_HINT:
        try:
            await query.answer("Unsupported language", show_alert=False)
        except TelegramError:
            pass
        return

    try:
        target_message_id = int(parts[2])
    except ValueError:
        try:
            await query.answer("Invalid request", show_alert=False)
        except TelegramError:
            pass
        return

    if not query.message or not update.effective_user:
        return

    telegram_id = update.effective_user.id
    chat_id = query.message.chat_id
    key = (chat_id, target_message_id)

    # Ignore rapid duplicate taps on the same message.
    now = time.monotonic()
    last_tap = _lang_switch_last_tap.get(key, 0.0)
    if now - last_tap < LANG_SWITCH_DEBOUNCE_SECONDS:
        return
    _lang_switch_last_tap[key] = now
    # Prune stale debounce entries to avoid unbounded map growth.
    prune_before = now - 60
    for stale_key, ts in list(_lang_switch_last_tap.items()):
        if ts < prune_before:
            _lang_switch_last_tap.pop(stale_key, None)

    lock = _lang_switch_locks.setdefault(key, asyncio.Lock())

    try:
        async with lock:
            await cancel_stream(chat_id, target_message_id)

            thinking_text = get_initial_typing_indicator_text(lang)
            active_message_id = target_message_id
            try:
                await context.bot.edit_message_text(
                    chat_id=chat_id,
                    message_id=target_message_id,
                    text=thinking_text,
                    reply_markup=build_language_keyboard(target_message_id)
                )
            except TelegramError as e:
                if "not modified" in str(e).lower():
                    pass
                else:
                    print(f"Warning: Could not edit callback target message {target_message_id}: {e}. Falling back to new message.")
                    sent_message = await context.bot.send_message(chat_id=chat_id, text=thinking_text)
                    active_message_id = sent_message.message_id
                    try:
                        await context.bot.edit_message_reply_markup(
                            chat_id=chat_id,
                            message_id=active_message_id,
                            reply_markup=build_language_keyboard(active_message_id)
                        )
                    except TelegramError as e2:
                        print(f"Warning: Could not attach keyboard to fallback message: {e2}")

            source_text = _message_prompt_map.get((chat_id, target_message_id))
            if not source_text:
                source_text = await get_last_message_by_role(telegram_id, "user")

            if not source_text:
                missing_text = "Sorry, I couldn't find text to regenerate."
                try:
                    await context.bot.edit_message_text(
                        chat_id=chat_id,
                        message_id=active_message_id,
                        text=missing_text,
                        reply_markup=build_language_keyboard(active_message_id)
                    )
                except TelegramError as e:
                    print(f"Warning: Could not edit missing-source text: {e}. Sending fallback message.")
                    missing_msg = await context.bot.send_message(chat_id=chat_id, text=missing_text)
                    try:
                        await context.bot.edit_message_reply_markup(
                            chat_id=chat_id,
                            message_id=missing_msg.message_id,
                            reply_markup=build_language_keyboard(missing_msg.message_id)
                        )
                    except TelegramError as e2:
                        print(f"Warning: Could not attach keyboard to missing-source message: {e2}")
                return

            user_content = source_text

            messages = [
                {"role": "system", "content": build_regen_system_prompt(lang)},
                {"role": "user", "content": user_content}
            ]

            _message_prompt_map[(chat_id, active_message_id)] = source_text
            _active_bot_msg_by_chat[chat_id] = active_message_id

            stream_task = asyncio.create_task(stream_ai_response(
                messages,
                context.bot,
                chat_id,
                active_message_id,
                telegram_id,
                thinking_text=thinking_text,
            ))
            _active_stream_tasks[(chat_id, active_message_id)] = stream_task
    finally:
        _lang_switch_locks.pop(key, None)


async def post_init(app):
    """Delete webhook and initialize database on startup"""
    # Delete webhook before starting polling to avoid conflicts
    try:
        await app.bot.delete_webhook(drop_pending_updates=True)
        print("Webhook deleted (if it existed)")
        # Small delay to ensure webhook deletion is processed
        await asyncio.sleep(1)
    except Exception as e:
        print(f"Note: Could not delete webhook: {e}")
    
    # Initialize database
    try:
        if await init_db():
            print("Database connection established")
        else:
            print("Bot will continue without database persistence")
    except Exception as e:
        print(f"Warning: Could not initialize database: {e}")
        print("Bot will continue but user data won't be saved")

    # Start optional HTTP API so this service can expose a Railway domain.
    # If port is in use, another bot instance is likely running — exit to avoid duplicate /start replies.
    try:
        await start_http_api_server()
    except OSError as e:
        if e.errno in (98, 10048):  # Address already in use (Unix, Windows)
            print("Another bot instance is using the HTTP port. Exiting to avoid duplicate replies.")
            import sys
            sys.exit(1)
        raise
    except Exception as e:
        print(f"Warning: Could not start HTTP API server: {e}")


async def shutdown(app):
    """Close database pool on shutdown"""
    global _db_pool
    await stop_http_api_server()
    if _db_pool:
        await _db_pool.close()
        print("Database connection closed")


def main():
    bot_token = os.getenv('BOT_TOKEN')
    if not bot_token:
        raise ValueError("Environment variable 'BOT_TOKEN' is not set")
    ai_backend_url = get_ai_backend_url()
    api_key, key_source = _resolve_inner_calls_key_with_source()
    key_preview = _mask_secret(api_key)
    
    app = ApplicationBuilder().token(bot_token).post_init(post_init).post_shutdown(shutdown).build()
    app.add_error_handler(error_handler)
    
    # Add handler to ensure user exists in DB on every message (non-blocking)
    # This runs first, before command handlers
    app.add_handler(MessageHandler(filters.ALL, ensure_user_handler), group=-1)
    
    # Add command handlers
    app.add_handler(CommandHandler("start", hello))
    app.add_handler(CallbackQueryHandler(handle_language_callback, pattern=r"^lang:(en|ru):\d+$"))
    
    # Add handler for arbitrary text messages (AI responses)
    # This should run after command handlers, so commands are processed first
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    print("Bot starting...")
    print(f"AI_BACKEND_URL={ai_backend_url}")
    print(f"BOT->AI key preview={key_preview} (from {key_source})")
    _log_runtime_env_snapshot()
    try:
        app.run_polling(drop_pending_updates=True, allowed_updates=Update.ALL_TYPES)
    except Conflict as e:
        print("Error: Another bot instance is already running or webhook conflict exists.")
        print("This usually resolves automatically. If it persists, check for other running instances.")
        print(f"Details: {e}")
        # Don't re-raise, just exit gracefully
        return
    except KeyboardInterrupt:
        print("\nBot stopped by user")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()
