import asyncio
import json

import pytest

pytest.importorskip("telegram")
pytest.importorskip("aiohttp")

from bot import bot as bot_module


class FakeResponse:
    def raise_for_status(self):
        return None

    async def aiter_lines(self):
        await asyncio.sleep(0.03)
        yield json.dumps({"token": "Hi", "done": True})


class FakeStreamContext:
    async def __aenter__(self):
        return "http://test", FakeResponse()

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakeBot:
    def __init__(self):
        self.edits: list[str] = []

    async def edit_message_text(self, **kwargs):
        self.edits.append(kwargs["text"])

    async def send_message(self, **kwargs):
        raise AssertionError("stream_ai_response should not need fallback send in this test")

    async def edit_message_reply_markup(self, **kwargs):
        return None


async def _noop_save_message(_telegram_id: int, _role: str, _text: str):
    return None


def test_build_typing_indicator_frames_rotates_dots():
    assert bot_module.build_typing_indicator_frames("Thinking...") == [
        "Thinking.",
        "Thinking..",
        "Thinking...",
    ]


def test_stream_ai_response_animates_before_first_chunk(monkeypatch):
    monkeypatch.setenv("INNER_CALLS_KEY", "test-key")
    monkeypatch.setenv("THINKING_ANIMATION_INTERVAL_SECONDS", "0.01")
    monkeypatch.setenv("EDIT_INTERVAL_SECONDS", "1")
    monkeypatch.setattr(bot_module, "stream_chat", lambda **_kwargs: FakeStreamContext())
    monkeypatch.setattr(bot_module, "save_message", _noop_save_message)

    fake_bot = FakeBot()

    asyncio.run(
        bot_module.stream_ai_response(
            messages=[{"role": "user", "content": "hello"}],
            bot=fake_bot,
            chat_id=1,
            message_id=10,
            telegram_id=123,
            thinking_text="Thinking.",
        )
    )

    assert "Hi" in fake_bot.edits
    first_response_index = fake_bot.edits.index("Hi")
    assert any(text in {"Thinking..", "Thinking..."} for text in fake_bot.edits[:first_response_index])
    assert fake_bot.edits[-1] == "Hi"
