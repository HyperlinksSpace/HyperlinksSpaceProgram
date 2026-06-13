# TinyModel / Universal Brain integration

Full strategy (development directions, use cases, phased integration, env vars, file map):

**[`../TinyModel/texts/hsp-tinymodel-integration-strategy.md`](../TinyModel/texts/hsp-tinymodel-integration-strategy.md)**

Quick summary:

- **HSP** = product shell (wallet, swap, GlobalBottomBar, OpenAI today).
- **TinyModel** = routing, RAG, NL controls, encoder; optional full Universal Brain service.
- **First code step:** `TINYMODEL_API_URL` sidecar + extend `ai/transmitter.ts`; replace stub `/ai` with streaming chat.

Golden-prompt regression (TinyModel repo): `python scripts/ub_eval_runner.py --verify`
