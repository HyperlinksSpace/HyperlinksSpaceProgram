import asyncio

import pytest

pytest.importorskip("telegram")
pytest.importorskip("aiohttp")

from bot import bot as bot_module


class _DummyMessage:
    def __init__(self):
        self.calls = []

    async def reply_text(self, text, reply_markup=None):
        self.calls.append({"text": text, "reply_markup": reply_markup})


class _DummyUpdate:
    def __init__(self, message):
        self.message = message


def test_start_message_includes_version(monkeypatch):
    monkeypatch.setenv("BOT_VERSION", "123")
    monkeypatch.setenv("APP_URL", "https://example.com")

    msg = _DummyMessage()
    update = _DummyUpdate(msg)

    asyncio.run(bot_module.hello(update, None))
    assert msg.calls, "Expected /start to call reply_text"
    assert "v.123" in msg.calls[0]["text"]

