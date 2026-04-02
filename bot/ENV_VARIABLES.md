# Environment Variables for Telegram Bot

## Required Variables

### `BOT_TOKEN`
- **Description**: Telegram bot token from [@BotFather](https://t.me/botfather)
- **Required**: Yes
- **Example**: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`
- **Usage**: Used to authenticate with Telegram Bot API

### `DATABASE_URL`
- **Description**: PostgreSQL database connection string
- **Required**: Yes
- **Example**: `postgresql://user:password@host:port/database`
- **Usage**: Connects to database for storing user information
- **Note**: Supports SSL (required for cloud databases like Neon, Railway, etc.)

## Conditional Variables (Required for AI Features)

### `AI_BACKEND_URL`
- **Description**: URL of the AI backend API endpoint
- **Required**: Yes (if using AI chat features)
- **Example**: `https://your-ai-backend.com` or `https://api.example.com`
- **Usage**: Endpoint for streaming AI responses to user messages

### `INNER_CALLS_KEY`
- **Description**: API key for authenticating with the AI backend
- **Required**: Yes (if using AI chat features)
- **Example**: `your-secret-api-key-here`
- **Usage**: Sent as `X-API-Key` header in requests to AI backend

## Optional Variables

### `APP_URL`
- **Description**: Frontend application URL for the "Run app" button
- **Required**: No
- **Example**: `https://your-app.vercel.app` or `https://your-domain.com`
- **Usage**: Used in `/start` command to create inline button linking to the app
- **Note**: If not set, button will have `None?mode=fullscreen` as URL

### `BOT_VERSION`
- **Description**: Human-friendly version tag shown in the `/start` message (helps avoid mixing up deployments)
- **Required**: No
- **Example**: `123` (shown as `v.123`)
- **Usage**: Included in the `/start` message so deployers can verify the running version

## Setup Instructions

### Local Development
1. Create a `.env` file in the `bot/` directory
2. Add all required variables:
   ```env
   BOT_TOKEN=your_telegram_bot_token
   DATABASE_URL=postgresql://user:password@host:port/database
   AI_BACKEND_URL=https://your-ai-backend.com
   INNER_CALLS_KEY=your-api-key
   APP_URL=https://your-app.vercel.app
   ```

### Railway Deployment
1. Go to Railway project dashboard
2. Navigate to "Variables" tab
3. Add all required environment variables
4. Or use Railway CLI:
   ```bash
   railway variables set BOT_TOKEN=your_token
   railway variables set DATABASE_URL=your_database_url
   railway variables set AI_BACKEND_URL=your_ai_url
   railway variables set INNER_CALLS_KEY=your_api_key
   railway variables set APP_URL=your_app_url
   ```

## Connecting Bot + AI + RAG

The bot talks only to the **AI backend**. The AI backend can use a **RAG service** when its `RAG_URL` env var is set (the bot does not need a RAG URL). For full setup and env vars for RAG, AI, and bot together, see **[RAG_BOT_AI_INTEGRATION.md](../RAG_BOT_AI_INTEGRATION.md)** in the repo root.

## Notes
- Never commit `.env` files to version control
- Railway environment variables take precedence over `.env` file
- Database connection supports SSL for secure connections
- AI features will fail gracefully if `AI_BACKEND_URL` or `INNER_CALLS_KEY` are missing when needed
