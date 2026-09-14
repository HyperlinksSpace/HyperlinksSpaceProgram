# DLLR ↔ USDT 1:1 + Swap.Coffee multi-hop routing plan

Research note for making **swaps available in the HSP Swap section** by anchoring **DLLR to TON USDT at a strict 1:1 policy**, then routing **DLLR ↔ TON** (and other pairs) as **DLLR ↔ USDT ↔ asset**.

**Related HSP docs:**

- [`swap-coffee-integration-builtin-wallet.md`](swap-coffee-integration-builtin-wallet.md) — quote → build txs → built-in wallet send
- [`dllr-dedust-ton-pool-liquidity-and-multichain.md`](dllr-dedust-ton-pool-liquidity-and-multichain.md) — DeDust **TON/DLLR** volatile pool (≠ hard peg)
- Code already in repo: `ui/swap/swapCoffeeRouting.ts`, `services/swap/executeSwap.ts`, `ui/swap/swapPairTypes.ts`

**External references:**

- [Swap.Coffee Aggregator — Routing](https://docs.swap.coffee/technical-guides/aggregator-api/routing)
- [POST `/v1/route`](https://docs.swap.coffee/technical-guides/aggregator-api-openapi/routing/returns-the-best-route-for-the-given-trade-pair) (`max_length`, `max_splits`)
- [POST `/v2/route/transactions`](https://docs.swap.coffee/technical-guides/aggregator-api-openapi/routing/returns-pre-built-transactions-for-the-given-route-it-is-assumed-that-transactions-will-be-signed-and-sent-by-the-sender-via-wallet)
- [Coffee DEX create pool `POST /v1/dex/pool`](https://docs.swap.coffee/technical-guides/aggregator-api-openapi/dex/build-transactions-to-create-pool-of-the-given-asset-pair)
- [Provide liquidity `POST /v1/liquidity/provision/{address}`](https://docs.swap.coffee/technical-guides/aggregator-api-openapi/liquidityprovisioning/build-transactions-to-provide-liquidity-to-the-given-pool)
- [Tokens hybrid-search](https://docs.swap.coffee/technical-guides/tokens-api/hybrid-search)
- [STON.fi pool types (stableswap)](https://guide.ston.fi/providing-liquidity/liquidity-pool-types)
- OpenAPI: `https://backend.swap.coffee/openapi`

---

## 1) Goal (product)

| User sees | What should happen under the hood |
|-----------|-----------------------------------|
| Swap **DLLR → TON** | Prefer **DLLR → USDT → TON** (multi-hop), not a thin DLLR/TON CPMM |
| Swap **TON → DLLR** | Prefer **TON → USDT → DLLR** |
| Swap **DLLR ↔ any jetton** | Prefer **DLLR → USDT → jetton** (and reverse) when that path exists |
| Rate promise | **1 DLLR = 1 USDT** (strict policy), with fees/slippage disclosed separately |

HSP today already quotes via Swap.Coffee (`buildRoute` / `buildTransactionsV2`) and can execute with the built-in wallet. What is missing for DLLR routes is **real on-chain DLLR liquidity that aggregators can see**, plus a **policy for the 1:1 peg** (a normal AMM pool alone does **not** hard-guarantee 1:1).

**USDT on TON** (already used in app):

- Raw: `0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe`
- Friendly (Swap.Coffee docs example): `EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs`
- Decimals: **6** (`SWAP_USDT_TOKEN` in `ui/swap/swapPairTypes.ts`)

**DLLR in UI today** is still a placeholder row key `jetton:dllr` — Swap.Coffee cannot route it until a **real jetton master** is registered and a pool/bridge exists.

---

## 2) Swap.Coffee API — what we use for “via USDT”

### 2.1 Two hosts (same as existing HSP doc)

| Host | Role |
|------|------|
| `https://backend.swap.coffee` | Aggregator: route, transactions, pools, LP helpers |
| `https://tokens.swap.coffee` | Jetton catalog / hybrid-search / charts / balances |

HSP already calls `RoutingApi.buildRoute` with `max_splits: 4` (`ui/swap/swapCoffeeRouting.ts`).

### 2.2 Multi-hop is native (this is how “through USDT” works)

`POST /v1/route` builds **direct** or **indirect** paths across DeDust, STON.fi, Coffee DEX, etc.

Critical knobs:

| Param | Meaning for HSP |
|-------|-----------------|
| `max_length` | Path length in **tokens**. Default **3** ⇒ allows **A → X → B** (exactly one intermediate). **2** = direct only. **4–5** = more hops. |
| `max_splits` | Parallel paths / messages (v4 wallets ≤ 4). |
| `input_amount` / `output_amount` | Human units (not nano). Exact-out is less flexible (no splits). |
| `pool_selector` | Optional filter: `dexes`, `blockchains`, `max_volatility`. |

So once a **DLLR/USDT** pool is deep enough and indexed:

```
TON  →  USDT  →  DLLR     (max_length ≥ 3)
DLLR →  USDT  →  TON
DLLR →  USDT  →  GRAM/jetton
```

Swap.Coffee will usually pick this automatically if it is the best price — you do **not** need to hardcode “USDT” in every UI call. Optionally force longer hops:

```ts
await routingApi.buildRoute({
  input_token: dllr,
  output_token: { blockchain: "ton", address: "native" },
  input_amount,
  max_length: 3, // or 4 if you want two intermediates
  max_splits: 4,
});
```

Then `buildTransactionsV2({ sender_address, slippage, paths })` → sign with HSP wallet → `waitForRouteResults(route_id)`.

### 2.3 Coffee DEX can create the DLLR/USDT pool via API

Coffee DEX (part of Swap.Coffee’s own DEX surface):

1. Ensure vaults exist for both assets.
2. `POST /v1/dex/pool` with `user_wallet`, `asset_1`, `asset_2`, `asset_1_amount`, `asset_2_amount` → returns messages to sign (**pool creation requires initial liquidity**).
3. Later top-ups: `POST /v1/liquidity/provision/{poolAddress}`.

Supported AMM types in aggregator schemas include **`curve_fi_stable`**, **`cubic_stable`**, **`weighted_stable`**, plus volatile types (`constant_product`, `dedust_v2`, …). Prefer a **stable** AMM for DLLR/USDT if the venue exposes it for that pair.

You can also seed **DeDust stable** or **STON.fi stableswap** pools; Swap.Coffee aggregates across them.

### 2.4 What Swap.Coffee does **not** do

- It does **not** mint/redeem DLLR at 1:1.
- It does **not** guarantee peg; it only routes through whatever pools exist.
- It does **not** (today) do cross-chain swaps (`GET /v1/blockchains` → TON only).

---

## 3) Can a DLLR/USDT pool be “decentralized” and still 1:1?

### Short answer

| Mechanism | Decentralized? | Strict 1:1? |
|-----------|----------------|-------------|
| Volatile CPMM (x·y=k) seeded 1:1 | Yes | **No** — drifts with every trade |
| Stableswap / Curve-like pool | Yes (DEX contracts) | **Soft near-peg** — low slippage near 1:1, **not** a hard guarantee |
| Constant-sum pool + infinite arb treasury | Hybrid | **Operational** 1:1 while inventory lasts |
| Mint/redeem against USDT custody | Centralized or hybrid | **Yes** (by policy + solvency) |
| Wrapped DLLR bridge to another chain’s USDT | Bridge-dependent | Peg = bridge + custody design |

**A public AMM alone cannot “explicitly guarantee” strict 1:1 forever.** Guarantees come from **issuance rules + reserves + redemption**, not from seeding a pool.

---

## 4) Three architecture variants

### A) Decentralized (DEX-first)

**Build:** Deploy mainnet DLLR jetton → create **DLLR/USDT stableswap** (STON.fi and/or DeDust stable and/or Coffee `curve_fi_stable`) with large equal deposits (e.g. 100k DLLR + 100k USDT).

**Routing:** Swap.Coffee multi-hop uses deep **USDT/TON** markets for the TON leg.

**Pros**

- Non-custodial swaps; fits “program on TON” narrative.
- Aggregators pick it up without HSP running a broker.
- Composable with other DeFi.

**Cons**

- Peg is **market-made**, not contractual.
- Large sells of DLLR can still move the pool off 1:1 if amplification/depth is insufficient.
- Impermanent loss / inventory risk for LPs (including treasury LP).
- “Strictly 1:1” in marketing would be **misleading** unless you add redemption.

**When to use:** Liquidity bootstrap + soft $1 reference; disclose “market rate ≈ 1 USDT, subject to slippage.”

---

### B) Hybrid (recommended for HSP product dollar)

**Build both:**

1. **On-chain DLLR/USDT stableswap** (public liquidity for aggregators + trust-minimized path).
2. **Program mint/redeem desk** (or on-chain vault) that always exchanges **1 DLLR ↔ 1 USDT** for signed-in users / KYC tiers, funded by a **USDT treasury**.

**Swap UX in HSP:**

| Path | Behavior |
|------|----------|
| Small / retail swap in Swap UI | Prefer Swap.Coffee route; if quoted DLLR/USDT mid is within band (e.g. ±0.2%), use DEX. |
| Peg enforcement | If DEX mid drifts outside band **or** user selects “Exact 1:1”, use **HSP redeem/mint** (centralized hop) then continue DEX legs for TON/jettons. |
| Display | Always show: *1 DLLR = 1 USDT by program policy*; swap quote shows **fees + TON-leg slippage** separately. |

**Pros**

- Can **honestly** claim program 1:1 (backed by USDT reserves).
- Still gets decentralized depth and Swap.Coffee multi-hop for TON/jettons.
- Can absorb shocks: arb bots + treasury rebalance the stableswap.

**Cons**

- Custody / reserve attestation / solvency risk on the mint-redeem side.
- More ops: reserve monitoring, deposit addresses, audit trail.
- Regulatory attention if marketed as a dollar.

**When to use:** Default for “DLLR is the program dollar” + live Swap section.

---

### C) Centralized (broker / RFQ)

**Build:** HSP (or a partner) holds USDT + DLLR inventory. Swap UI calls **your** quote API: always `out = in` for DLLR↔USDT (minus fee). For DLLR↔TON, server does USDT↔TON via Swap.Coffee / CEX and settles net to user.

**Pros**

- Easiest **strict** 1:1 UX.
- Best control of inventory, limits, compliance freezes (`dllrFrozen` already exists in deal UI).
- No dependence on pool depth for the peg leg.

**Cons**

- Full custody / counterparty risk.
- Not “DeFi”; harder to list on external aggregators for *others*.
- You become the market maker for every DLLR trade.

**When to use:** Early launch, compliance-gated users, or until stableswap depth is funded.

---

## 5) How to **explicitly guarantee** DLLR = USDT 1:1

Treat “guarantee” as a **stack**, not a single pool parameter.

### 5.1 Policy layer (product)

1. **Definition:** 1 DLLR redeemable for 1 TON-USDT (minus optional fee), and 1 USDT mints 1 DLLR, while reserves ≥ liabilities.
2. **UI copy:** Never imply a CPMM “locks” the peg; say “Program rate 1:1; market routes may add DEX fees/slippage on other legs.”
3. **Accounting:** On-chain or off-chain ledger of circulating DLLR vs USDT held.

### 5.2 Hard peg mechanisms (pick ≥1)

| Mechanism | How 1:1 is enforced |
|-----------|---------------------|
| **Mint/redeem** | User sends USDT → mint DLLR; burns DLLR → receive USDT. Rate fixed in contract or server policy. |
| **Collateral vault** | DLLR only mintable against locked USDT (over/under-collateral rules). |
| **Constant-sum AMM + exclusive MM** | Pool always quotes 1:1 until one side depletes; only treasury may LP (or arb restores). Still inventory-limited. |
| **Oracle + circuit breaker** | If DEX mid ≠ 1 within ε, pause public pool routing and force mint/redeem. |

### 5.3 Soft peg aids (never alone)

- Deep stableswap (high amplification **A** on STON.fi).
- Treasury arb: when pool price &lt; 1, buy DLLR with USDT (or mint+sell) until mid returns.
- Dual listing: DLLR/USDT on multiple DEXes so Swap.Coffee finds depth.

### 5.4 What **not** to claim

Seeding a DeDust **volatile** TON/DLLR or USDT/DLLR CPMM at 1:1 **does not** guarantee the rate. Prior note [`dllr-dedust-ton-pool-liquidity-and-multichain.md`](dllr-dedust-ton-pool-liquidity-and-multichain.md) already covers that for TON/DLLR.

---

## 6) Suggested target topology

```
                 ┌──────────────────────────────┐
                 │  HSP mint / redeem (hybrid)  │
                 │  1 DLLR  ⇄  1 USDT (+fee)    │
                 └──────────────┬───────────────┘
                                │ reserves
                                ▼
                 ┌──────────────────────────────┐
                 │  DLLR / USDT stableswap      │  ← DeDust / STON / Coffee
                 │  deep, public, aggregator-   │
                 │  visible                     │
                 └──────────────┬───────────────┘
                                │
         Swap.Coffee multi-hop  │
                                ▼
                 ┌──────────────────────────────┐
                 │  USDT / TON  (+ USDT/jettons)│  ← existing deep TON markets
                 └──────────────────────────────┘
```

**User mental model:** “I swap TON for DLLR.”  
**Actual route (typical):** `TON → USDT → DLLR` (or reverse).  
**Peg leg:** DLLR↔USDT at ~1:1 (stableswap) or exact 1:1 (mint/redeem).

Other pairs: any jetton with a USDT or TON market becomes reachable as `DLLR → USDT → …` once DLLR/USDT exists.

---

## 7) Implementation plan (phased)

### Phase 0 — Preconditions (blocker)

1. **Mainnet (or testnet) DLLR jetton master** with final decimals (UI currently assumes 9; USDT is 6 — convert carefully).
2. Replace `SWAP_DLLR_TOKEN.address = "jetton:dllr"` with the real master for routing.
3. Treasury wallets: USDT inventory + DLLR inventory + gas TON.
4. Decide marketing language: **soft peg** vs **redeemable 1:1** (legal/compliance review).

### Phase 1 — Liquidity that aggregators can route (decentralized base)

1. Create **DLLR/USDT stableswap** on at least one major venue (STON.fi stableswap preferred for amplification; also evaluate DeDust stable / Coffee DEX).
2. Seed **equal USD notionals** (start testnet small; mainnet e.g. tens–hundreds of thousands USDT + matching DLLR).
3. Verify Swap.Coffee sees the pool:
   - `GET /v1/dex/pools?assets=<DLLR>&assets=<USDT>`
   - `POST /v1/route` DLLR→native and native→DLLR with `max_length: 3`; confirm path includes USDT.
4. Optionally skip a dedicated DLLR/TON volatile pool initially (reduces peg confusion); rely on USDT hub.

### Phase 2 — HSP Swap section “available”

1. Wire real execute path (already sketched in `executeSwap` / wallet send) for authenticated users.
2. Quote UX:
   - Show **program rate** 1 DLLR = 1 USDT.
   - Show **expected out** from Swap.Coffee (includes TON-leg impact).
   - Map `no_route` → clear “No pool” (already partially in `useSwapDealActionState`).
3. Set `max_length: 3` (or 4) explicitly for DLLR pairs so multi-hop is allowed.
4. Partner API key (`X-Api-Key`) for rate limits if volume grows.
5. Test matrix: DLLR↔TON, DLLR↔USDT, DLLR↔GRAM/jetton, exact-in and exact-out, slippage abort.

### Phase 3 — Strict 1:1 (hybrid guarantee)

1. Implement **mint/redeem** service (start server-mediated; migrate to on-chain vault later):
   - Deposit USDT → credit/mint DLLR 1:1.
   - Burn/lock DLLR → send USDT 1:1.
2. Peg monitor: compare Swap.Coffee mid DLLR/USDT vs 1.0; if \|mid−1\| &gt; ε, prefer mint/redeem for the DLLR↔USDT leg.
3. Public reserve dashboard (circulating DLLR vs USDT held).
4. Circuit breaker: freeze swaps (`dllrFrozen`) if insolvent or oracle failure.

### Phase 4 — Centralized fallback / RFQ (optional)

1. Internal quote API for guaranteed fills when DEX depth is thin.
2. Server executes USDT↔TON via Swap.Coffee with HSP inventory.
3. Keep this as **failover**, not the only path, if decentralization matters.

### Phase 5 — Ops & listing

1. Submit DLLR metadata to Swap.Coffee / Dexscreener / DEXes.
2. LP top-ups and arb bot for the stableswap.
3. Monitoring: route success rate, peg deviation, reserve ratio, failed slippage.
4. Revisit whether a separate DLLR/TON pool is worth the IL (usually **no** if USDT hub is deep).

---

## 8) Decision table

| You want… | Choose… |
|-----------|---------|
| Fastest path to “swaps work” in UI | Phase 1 stableswap + Phase 2 routing (`max_length ≥ 3`) |
| Honest **strict 1:1** claim | Hybrid mint/redeem (Phase 3) **plus** stableswap |
| Fully non-custodial only | Stableswap + disclose soft peg; no “guaranteed” wording |
| Full control / compliance freezes | Centralized RFQ (Phase 4) for DLLR↔USDT leg |
| TON and other pairs “through USDT” | Do **not** require custom routers — Swap.Coffee multi-hop once DLLR/USDT exists |

---

## 9) Recommended default for HSP

1. **Hybrid:** stableswap DLLR/USDT for decentralized routing **and** mint/redeem for the hard 1:1 product promise.  
2. **Do not** rely on a volatile DLLR/TON pool for the dollar peg.  
3. **Use Swap.Coffee as the router** for everything after the USDT hub (`max_length: 3+`).  
4. **Ship Swap section** only after real DLLR address + verified `DLLR → USDT → TON` route returns non-empty paths.  
5. Keep centralized RFQ as inventory backstop, not as the sole architecture.

---

## 10) Open questions before building

1. Exact mainnet **DLLR master address** and decimals.  
2. Initial **USDT reserve** size and who custodians it.  
3. Fee on mint/redeem (0 vs bps) and who pays TON gas.  
4. Whether DLLR transfer restrictions / freezes must remain DEX-compatible.  
5. Legal stance: program credit vs “stablecoin.”  
6. Prefer STON.fi vs DeDust vs Coffee DEX as the **first** DLLR/USDT venue (can seed more than one).

---

## 11) Minimal success checklist

- [ ] Real DLLR jetton in `SWAP_DLLR_TOKEN`  
- [ ] DLLR/USDT pool live with measurable TVL  
- [ ] `buildRoute(DLLR → native)` returns path via USDT  
- [ ] End-to-end swap in HSP Swap UI succeeds on testnet then mainnet  
- [ ] Peg policy documented in UI (soft vs redeemable)  
- [ ] If claiming strict 1:1: mint/redeem live + reserve monitoring  

This is the research baseline for enabling swaps in the Swap section with **USDT as the hub** and a deliberate choice among **decentralized / hybrid / centralized** peg designs.
