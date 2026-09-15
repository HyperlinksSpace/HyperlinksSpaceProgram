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
| Capital constraint | Achieve that **1:1 DLLR↔USDT path with minimum liquidity** — prefer mint/redeem working float over locking deep AMM TVL (see **§6**) |

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

## 6) Achieve **1:1 DLLR ↔ USDT with minimum liquidity**

**Product constraint:** we must deliver a **strict 1 DLLR = 1 USDT** swap path while **minimizing capital locked** in pools or idle inventory — not “bootstrap a deep AMM first.”

### 6.1 Why a thin pool cannot do this

| Approach at low TVL | What happens on a real-size trade |
|---------------------|----------------------------------|
| Volatile CPMM (x·y=k) | Spot leaves 1:1 immediately; slippage is large |
| Stableswap / Curve-like | Near-peg only while trade ≪ depth × amplification; thin pool still breaks “strict 1:1” |
| Dust LP only for listing | Aggregators may see a route, but fills are unusable / high impact |

**Conclusion:** minimum-liquidity **1:1** is an **issuance / settlement** problem, not an AMM-depth problem. Do **not** plan to “guarantee 1:1” by seeding a small public pool.

### 6.2 Preferred min-liquidity design (hybrid / centralized peg leg)

Keep the **DLLR ↔ USDT leg off the AMM** (or only as a tiny optional discovery pool). Enforce 1:1 via **mint/redeem** (or RFQ) against a **working USDT reserve**:

```
User USDT  ──mint──►  +1 DLLR     (1:1, fee optional)
User DLLR  ──burn──►  +1 USDT     (1:1, fee optional)
```

Capital that actually matters:

| Bucket | Purpose | Sizing rule (min) |
|--------|---------|-------------------|
| **Redeem reserve (USDT)** | Pay users who burn DLLR | ≥ expected **peak redeem** over settlement window (e.g. daily P95), not “pool TVL” |
| **Mint capacity (DLLR)** | Issue against incoming USDT | Mint authority / unissued supply; USDT received becomes reserve |
| **Gas (TON)** | Jetton transfers / vault txs | Small operational float |
| **Optional dust pool** | Listing / aggregator discovery only | Venue minimum (e.g. DeDust ~$50 guidance) — **not** used for guaranteed fills |

**Multi-hop to TON still works with min DLLR liquidity:** HSP (or Swap.Coffee after a mint) only needs deep **USDT ↔ TON** markets that **already exist**. Flow:

1. User wants **TON → DLLR**: buy USDT on DEX (existing depth) → **mint DLLR 1:1** against that USDT.  
2. User wants **DLLR → TON**: **redeem DLLR → USDT 1:1** → sell USDT for TON on DEX.  
3. User wants **DLLR ↔ USDT**: mint/redeem only — **zero pool depth required**.

That is the minimum-liquidity path to a true 1:1 DLLR/USDT swap.

### 6.3 Compare capital efficiency

| Design | Capital to claim strict 1:1 on $N trade | Notes |
|--------|----------------------------------------|--------|
| **Mint/redeem** | ~**$N** USDT in redeem float (plus gas) | Same $N can serve many sequential users if flow nets out |
| **Thin stableswap** | Often **≫ $N** TVL to keep impact near zero | Still not a contractual 1:1 |
| **Deep stableswap** | Large locked LP | Good for public DeFi; expensive for “min liquidity” goal |
| **Pure RFQ / broker** | Inventory on both sides | Same idea as mint/redeem; fully custodial |

For HSP’s constraint (**1:1 + min liquidity**), **mint/redeem (or RFQ) first** beats seeding a large DLLR/USDT pool.

### 6.4 Optional: micro on-chain pool without relying on it

If you still want Swap.Coffee to *see* a DLLR/USDT pair:

1. Seed **venue-minimum** liquidity only (listing / optics).  
2. In HSP Swap UI, **do not** use that pool for the peg leg when `exact 1:1` is required — route DLLR↔USDT through mint/redeem.  
3. Use Swap.Coffee only for **USDT ↔ TON / jettons**.  
4. If an external aggregator quotes the dust pool, accept that *external* users may get soft rates; **in-app** policy stays 1:1.

### 6.5 Operational guardrails at min liquidity

1. **Per-tx and daily caps** on mint/redeem until reserves grow.  
2. **Reserve ratio** `USDT_held / DLLR_circulating ≥ 1` (or policy band); else freeze redeems / show `dllrFrozen`.  
3. **Netting:** batch or delay non-urgent redemptions if needed; never promise infinite instant redeem beyond reserve.  
4. **Fee:** optional small bps on mint/redeem to fund gas and float — still quote “1:1 before fee” clearly.  
5. **Grow liquidity later:** once volume justifies it, add a real stableswap for public/aggregator depth; keep mint/redeem as the **guarantee** backstop.

### 6.6 Phase implication

Under a **minimum-liquidity** mandate, reorder delivery:

1. Real DLLR jetton + mint/redeem 1:1 (min USDT float).  
2. HSP Swap: DLLR↔USDT via desk; DLLR↔TON = redeem/mint + Swap.Coffee USDT↔TON.  
3. Only then (optional) seed public DLLR/USDT for decentralized discovery — not as the 1:1 enforcer.

---

## 7) Suggested target topology

Under **minimum liquidity** (§6), the mint/redeem box is mandatory and the stableswap box is optional / later. With more capital, both run together.

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

## 8) Implementation plan (phased)

### Phase 0 — Preconditions (blocker)

1. **Mainnet (or testnet) DLLR jetton master** with final decimals (UI currently assumes 9; USDT is 6 — convert carefully).
2. Replace `SWAP_DLLR_TOKEN.address = "jetton:dllr"` with the real master for routing.
3. Treasury wallets: **minimum USDT redeem float** + DLLR mint capacity + gas TON (see §6 — not a deep LP budget).
4. Decide marketing language: **soft peg** vs **redeemable 1:1** (legal/compliance review). Prefer redeemable if claiming strict 1:1 at min liquidity.

### Phase 1 — Min-liquidity 1:1 peg leg (before deep LP)

1. Ship **mint/redeem** (or RFQ) so **DLLR ↔ USDT is always 1:1** with only working USDT reserves (§6).
2. Wire Swap UI: DLLR↔USDT through desk; DLLR↔TON = mint/redeem + Swap.Coffee **USDT↔TON** (existing depth).
3. Optional: venue-minimum dust DLLR/USDT pool for listing only — **not** used for guaranteed fills.
4. Skip funding a large public DLLR/USDT or DLLR/TON pool until volume justifies it.

### Phase 2 — Liquidity that aggregators can route (optional scale-up)

1. When ready to leave min-liquidity mode for public DeFi, create **DLLR/USDT stableswap** (STON.fi / DeDust / Coffee) with meaningful equal deposits.
2. Verify Swap.Coffee sees the pool:
   - `GET /v1/dex/pools?assets=<DLLR>&assets=<USDT>`
   - `POST /v1/route` DLLR→native and native→DLLR with `max_length: 3`; confirm path includes USDT.
3. Keep mint/redeem as peg backstop when mid drifts or for “Exact 1:1.”

### Phase 3 — HSP Swap section polish

1. Wire real execute path (already sketched in `executeSwap` / wallet send) for authenticated users.
2. Quote UX:
   - Show **program rate** 1 DLLR = 1 USDT.
   - Show **expected out** for TON/jetton legs from Swap.Coffee (impact only on those legs).
   - Map `no_route` → clear “No pool” (already partially in `useSwapDealActionState`).
3. Set `max_length: 3` (or 4) when using aggregator multi-hop for non-peg legs.
4. Partner API key (`X-Api-Key`) for rate limits if volume grows.
5. Test matrix: DLLR↔USDT at 1:1 (desk), DLLR↔TON, DLLR↔GRAM/jetton, caps, slippage abort, reserve freeze.

### Phase 4 — Strict peg ops (hybrid guarantee)

1. Harden mint/redeem (server → on-chain vault when ready).
2. Peg monitor vs any public pool mid; circuit breaker → `dllrFrozen` if insolvent.
3. Public reserve dashboard (circulating DLLR vs USDT held).

### Phase 5 — Centralized RFQ failover (optional)

1. Internal quote API when mint/redeem or DEX legs are thin.
2. Server executes USDT↔TON via Swap.Coffee with HSP inventory.

### Phase 6 — Ops & listing

1. Submit DLLR metadata to Swap.Coffee / Dexscreener / DEXes.
2. Grow stableswap TVL only as volume requires; arb bot if public pool exists.
3. Monitoring: reserve ratio, redeem latency, route success, peg deviation.

---

## 9) Decision table

| You want… | Choose… |
|-----------|---------|
| **1:1 DLLR↔USDT with minimum liquidity** | **Mint/redeem (or RFQ) first** (§6); do **not** rely on a thin AMM |
| Fastest path to “swaps work” in UI | §6 desk for peg + Swap.Coffee for USDT↔TON |
| Later public / aggregator depth | Optional stableswap scale-up (Phase 2) **plus** keep mint/redeem |
| Honest **strict 1:1** claim | Redeemable against USDT reserves (hybrid), not CPMM seed ratio |
| Fully non-custodial only | Stableswap + disclose soft peg; cannot promise strict 1:1 at low TVL |
| Full control / compliance freezes | Centralized RFQ for DLLR↔USDT leg |
| TON and other pairs “through USDT” | Peg via desk or pool → then Swap.Coffee multi-hop on USDT hub |

---

## 10) Recommended default for HSP

1. **Min-liquidity mandate:** enforce **1:1 DLLR↔USDT via mint/redeem** (working USDT float), not via a deep pool.  
2. **Hybrid:** optional dust or later stableswap for discovery; mint/redeem remains the guarantee.  
3. **Do not** rely on a volatile DLLR/TON pool for the dollar peg.  
4. **Use Swap.Coffee** for **USDT ↔ TON / jettons** (`max_length: 3+` when DLLR is also on DEX).  
5. **Ship Swap section** once mint/redeem 1:1 works and USDT↔TON routes succeed — public DLLR/USDT TVL is **not** a blocker for in-app 1:1.  
6. Keep RFQ as inventory backstop under caps.

---

## 11) Open questions before building

1. Exact mainnet **DLLR master address** and decimals.  
2. Initial **minimum USDT redeem float** and who custodians it (see §6 sizing).  
3. Fee on mint/redeem (0 vs bps) and who pays TON gas.  
4. Whether DLLR transfer restrictions / freezes must remain DEX-compatible.  
5. Legal stance: program credit vs “stablecoin.”  
6. Whether a **dust** public DLLR/USDT pool is required for optics, or in-app desk-only is enough at launch.  
7. Prefer STON.fi vs DeDust vs Coffee DEX when/if scaling beyond min liquidity.

---

## 12) Minimal success checklist

- [ ] Real DLLR jetton in `SWAP_DLLR_TOKEN`  
- [ ] **DLLR ↔ USDT mint/redeem at 1:1** with documented min reserve (§6)  
- [ ] In-app swap: DLLR↔TON via redeem/mint + USDT↔TON route  
- [ ] Caps + freeze when reserves insufficient  
- [ ] Peg policy documented in UI (redeemable 1:1 at min liquidity)  
- [ ] Optional later: DLLR/USDT pool + `buildRoute(DLLR → native)` via USDT for public depth  

This is the research baseline for enabling swaps in the Swap section with **USDT as the hub**, **strict 1:1 at minimum liquidity** via mint/redeem, and a deliberate choice among **decentralized / hybrid / centralized** peg designs.
