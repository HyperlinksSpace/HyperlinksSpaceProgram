import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapSwapCoffeeHybridJettonToJetton,
  mapSwapCoffeeHybridSearchPage,
} from "../mapSwapCoffeeHybridSearch";

describe("mapSwapCoffeeHybridSearch", () => {
  it("maps a common jetton with full market_stats", () => {
    const jetton = mapSwapCoffeeHybridJettonToJetton({
      type: "common",
      address: "0:gram",
      name: "Gram",
      symbol: "GRAM",
      decimals: 9,
      image_url: "https://example.com/gram.png",
      verification: "WHITELISTED",
      market_stats: {
        holders_count: 0,
        price_usd: 1.35,
        volume_usd_24h: 2_800_000,
        tvl_usd: 238_000_000,
        fdmc: 6_900_000_000,
        mcap: 6_900_000_000,
        trust_score: 100,
        price_change_24h: -1.5,
      },
    });
    assert.ok(jetton);
    assert.equal(jetton.address, "0:gram");
    assert.equal(jetton.image_url, "https://example.com/gram.png");
    assert.equal(jetton.verification, "WHITELISTED");
    assert.equal(jetton.market_stats?.mcap, 6_900_000_000);
    assert.equal(jetton.market_stats?.volume_usd_24h, 2_800_000);
    assert.equal(jetton.market_stats?.tvl_usd, 238_000_000);
  });

  it("maps memepad fdmc_usd into fdmc/mcap", () => {
    const jetton = mapSwapCoffeeHybridJettonToJetton({
      type: "memepad",
      address: "0:meme",
      symbol: "MEME",
      decimals: 9,
      verification: "COMMUNITY",
      market_stats: {
        price_usd: 0.01,
        tvl_usd: 500,
        fdmc_usd: 12_000,
      },
    });
    assert.ok(jetton);
    assert.equal(jetton.market_stats?.fdmc, 12_000);
    assert.equal(jetton.market_stats?.mcap, 12_000);
  });

  it("parses a bare array page and reports hasMore from size", () => {
    const mapped = mapSwapCoffeeHybridSearchPage(
      [
        {
          type: "common",
          address: "0:1",
          symbol: "A",
          decimals: 9,
          verification: "WHITELISTED",
          market_stats: { mcap: 100 },
        },
      ],
      1,
    );
    assert.equal(mapped.items.length, 1);
    assert.equal(mapped.items[0]?.market_stats?.mcap, 100);
    assert.equal(mapped.hasMore, true);
  });

  it("rejects non-array payloads", () => {
    assert.throws(() => mapSwapCoffeeHybridSearchPage({ items: [] }, 100));
  });
});
