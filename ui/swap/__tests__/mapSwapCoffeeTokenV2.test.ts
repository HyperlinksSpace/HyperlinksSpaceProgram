import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapSwapCoffeeTokenV2ToJetton,
  mapSwapCoffeeTokensPageV2,
  trustScoreToVerification,
} from "../mapSwapCoffeeTokenV2";

describe("mapSwapCoffeeTokenV2", () => {
  it("maps trust_score bands to verification", () => {
    assert.equal(trustScoreToVerification(100), "WHITELISTED");
    assert.equal(trustScoreToVerification(90), "WHITELISTED");
    assert.equal(trustScoreToVerification(78), "COMMUNITY");
    assert.equal(trustScoreToVerification(32), "UNKNOWN");
    assert.equal(trustScoreToVerification(null), "UNKNOWN");
  });

  it("maps a v2 token into SwapJetton shape", () => {
    const jetton = mapSwapCoffeeTokenV2ToJetton({
      address: "0:abc",
      name: "Toncoin",
      symbol: "TON",
      decimals: 9,
      image: "https://example.com/ton.png",
      price_usd: 1.38,
      price_change_24h: 2.1,
      tvl: 1000,
      holders_count: 10,
      trust_score: 100,
    });
    assert.ok(jetton);
    assert.equal(jetton.address, "0:abc");
    assert.equal(jetton.image_url, "https://example.com/ton.png");
    assert.equal(jetton.verification, "WHITELISTED");
    assert.equal(jetton.market_stats?.price_usd, 1.38);
    assert.equal(jetton.market_stats?.tvl_usd, 1000);
  });

  it("parses a v2 page and reports hasMore from pages", () => {
    const mapped = mapSwapCoffeeTokensPageV2({
      items: [{ address: "0:1", symbol: "A", decimals: 9, trust_score: 50 }],
      page: 1,
      size: 1,
      pages: 3,
      total: 3,
    });
    assert.equal(mapped.items.length, 1);
    assert.equal(mapped.hasMore, true);
  });
});
