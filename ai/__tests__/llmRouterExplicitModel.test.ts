import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExplicitExternalModelPreference,
  resolveLlmRoute,
} from "../llmRouter.js";

describe("explicit external model preference", () => {
  it("detects pinned external model", () => {
    assert.equal(
      isExplicitExternalModelPreference({
        modelMode: "model",
        modelId: "anthropic/claude-sonnet-4.5",
      }),
      true,
    );
    assert.equal(
      isExplicitExternalModelPreference({ modelMode: "model", modelId: null }),
      false,
    );
    assert.equal(
      isExplicitExternalModelPreference({ modelMode: "auto", modelId: null }),
      false,
    );
    assert.equal(
      isExplicitExternalModelPreference({ modelMode: "tinymodel" }),
      false,
    );
  });

  it("never resolves TinyModel when modelMode is model", () => {
    const prevGateway = process.env.AI_GATEWAY_API_KEY;
    const prevOpenAi = process.env.OPENAI;
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    delete process.env.OPENAI;

    try {
      const route = resolveLlmRoute(
        "how do I swap DLLR",
        {
          configured: true,
          local_corpus: true,
          health_ok: true,
          route: "feature:swap",
          retrieve_hits: [{ score: 0.9, text: "swap help" }],
        },
        {
          preference: {
            modelMode: "model",
            modelId: "anthropic/claude-sonnet-4.5",
          },
        },
      );
      assert.ok(!("error" in route));
      if ("error" in route) return;
      assert.equal(route.backend, "vercel_gateway");
      assert.equal(route.model, "anthropic/claude-sonnet-4.5");
      assert.notEqual(route.backend, "tinymodel");
    } finally {
      if (prevGateway === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = prevGateway;
      if (prevOpenAi === undefined) delete process.env.OPENAI;
      else process.env.OPENAI = prevOpenAi;
    }
  });

  it("does not strip non-OpenAI gateway ids onto OpenAI when gateway missing", () => {
    const prevGateway = process.env.AI_GATEWAY_API_KEY;
    const prevOidc = process.env.VERCEL_OIDC_TOKEN;
    const prevOpenAi = process.env.OPENAI;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.OPENAI = "sk-test";

    try {
      const route = resolveLlmRoute("hello", null, {
        preference: {
          modelMode: "model",
          modelId: "anthropic/claude-sonnet-4.5",
        },
      });
      assert.ok("error" in route);
    } finally {
      if (prevGateway === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = prevGateway;
      if (prevOidc === undefined) delete process.env.VERCEL_OIDC_TOKEN;
      else process.env.VERCEL_OIDC_TOKEN = prevOidc;
      if (prevOpenAi === undefined) delete process.env.OPENAI;
      else process.env.OPENAI = prevOpenAi;
    }
  });
});
