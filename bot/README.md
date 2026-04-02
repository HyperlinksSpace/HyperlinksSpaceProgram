# Telegram Bot (Worker)

Bot service that relays user messages to the AI backend.

## Run Locally

```bash
cd bot
pip install -r requirements.txt
python bot.py
```

## Environment Variables

Required:

- `BOT_TOKEN`
- `DATABASE_URL`
- `AI_BACKEND_URL`
- `INNER_CALLS_KEY` (must match AI backend/RAG/frontend key)

Optional:

- `APP_URL` (used in `/start` button)
- `BOT_VERSION` (shown in `/start` message)

Example:

```env
BOT_TOKEN=123456:telegram-token
DATABASE_URL=postgresql://user:pass@host:5432/db
AI_BACKEND_URL=http://127.0.0.1:8000
INNER_CALLS_KEY=change-me-shared-secret
APP_URL=https://your-frontend-domain
BOT_VERSION=123
```

## Railway

- Root directory: `bot`
- Start command: `python bot.py`

The bot calls only:

- `POST {AI_BACKEND_URL}/api/chat`
- Header `X-API-Key: {INNER_CALLS_KEY}`

## Bot HTTP Endpoint

This service now also exposes an HTTP API so it can have its own Railway domain.

- `GET /health`
- `POST /api/chat` (proxy to AI backend)
- Auth header required: `X-API-Key: {INNER_CALLS_KEY}`

Port behavior:

- Railway: listens on `PORT` automatically
- Local fallback: `HTTP_PORT` (default `8080`)

For Railway domain generation, use target port `8080` (or your custom `HTTP_PORT`).
