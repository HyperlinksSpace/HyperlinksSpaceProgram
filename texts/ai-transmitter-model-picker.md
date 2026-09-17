# AI Transmitter & model picker (Cursor-style)

How Hyperlinks Space Program chooses an AI backend — same product shape as **Cursor Auto / Composer / named models**.

## Three choices in AI tools

| UI choice | Like Cursor | What happens |
| --------- | ----------- | ------------ |
| **Auto** | Auto | **AI Transmitter** picks per prompt (see ladder below) |
| **Tiny Model** | Composer / built-in agent | **Always Universal Brain** (Hyperlinks built-in generative brain). Never GPT/Claude/Gemini. |
| **Named cloud model** (GPT, Claude, Gemini, …) | Picking a catalog model | **Always that exact id** via Gateway / OpenAI. Never Tiny Model / UB. |

There is **no fourth mystery path**. Confusion usually comes from mixing “Tiny Model” (encoder + RAG *and* Universal Brain product name) with Auto’s free RAG shortcut. This doc separates them.

## Auto ladder (Transmitter)

For each user message when **Auto** is selected:

1. **Program RAG / route templates** (`tinymodel/rag`) — instant, free, only when the prompt is clearly Hyperlinks Space Program help (navigate, DLLR, connect Telegram, strong corpus hit).
2. **Universal Brain** (`tinymodel/universal-brain`) — built-in generative chat for ordinary general questions when `UB_CHAT_URL` (or the default Space) is up and the prompt is not “frontier-hard”.
3. **Cloud mini / frontier** — Vercel AI Gateway, then OpenAI. Used for long / multi-step / code / analysis prompts, or when UB is down.

Pinned cloud models **skip** steps 1–2 entirely (same rule as “explicit model must always apply”).

## Tiny Model (standalone)

Selecting **Tiny Model** means:

- Call **Universal Brain** for **any** question (general-purpose built-in brain).
- Optionally pass encoder/RAG excerpts as grounding context.
- If UB is unreachable → local RAG template fallback (honest degrade), **not** a silent switch to ChatGPT.

Quality goal: train / host UB so it feels peer to Composer — a **first-class built-in**. Cloud models remain available under Auto or by explicit pick when you want frontier vendors.

## Env (ops)

```bash
TINYMODEL_API_URL=...   # optional encoder classify+retrieve sidecar
UB_CHAT_URL=...         # Universal Brain (Gradio Space or horizon2_server); defaults to TinyModel1 Space
AI_GATEWAY_API_KEY=...  # Auto + named models
OPENAI=...              # fallback
```

## File map

| Piece | Role |
| ----- | ---- |
| `ui/components/ai/AiToolsDialog.tsx` | Picker UI (Auto / Tiny Model / cloud list) |
| `ai/transmitter.ts` | Ladder + forced Tiny Model / pinned model |
| `ai/universalBrain.ts` | UB HTTP client |
| `ai/tinymodel.ts` | Encoder + program corpus retrieve |
| `ai/llmRouter.ts` | Gateway/OpenAI model ids + RAG capability gate |

Related: TinyModel repo `texts/hsp-tinymodel-integration-strategy.md`, `plan/07-ai-transmitter.md`.
