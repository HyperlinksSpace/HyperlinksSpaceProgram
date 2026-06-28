# DLLR on DeDust — TON pool liquidity, $1 target price & multi-chain scaling

Research note for **Hyperlinks Space Program (HSP)** and **DLLR** issuance: how to create a **TON ↔ DLLR** pool on [DeDust](https://dedust.io), how initial liquidity sets (and does *not* guarantee) a **~$1 per DLLR** market price, and how this relates to **scaling on other blockchains**.

**Related HSP docs:**

- [`wallet_telegram_standalone_multichain_proposal.md`](wallet_telegram_standalone_multichain_proposal.md) — DLLR is **TON-first**; other chains are connected wallets, not duplicate issuance
- [`account-and-wallets-mechanics.md`](account-and-wallets-mechanics.md) — primary TON + DLLR wallet UX
- [`dllr/token/`](../dllr/token/) — jetton minter / wallet contracts and deploy scripts

**External references:**

- [DeDust Help — Create pool](https://help.dedust.io/en/liquidity/deposit/create)
- [DeDust Help — Initial liquidity & price warning](https://help.dedust.io/en/launch/add_token/create_pool)
- [DeDust Docs — Adding jettons & liquidity (SDK)](https://docs.dedust.io/docs/adding-new-jettons)
- [DeDust Docs — Liquidity provisioning](https://docs.dedust.io/docs/liquidity-provisioning)

---

## 1) Executive summary

| Question | Answer |
|----------|--------|
| Can I deploy DLLR and list it on DeDust? | **Yes.** Deploy the jetton minter on TON, create a DeDust **vault** for the jetton (automatic on first use), then create a **TON/DLLR** pool and deposit liquidity. |
| How do I make **1 DLLR ≈ $1**? | Set the **initial deposit ratio** so `price(DLLR in TON) × price(TON in USD) ≈ 1`. Example: if TON = **$5**, deposit **1 DLLR : 5 TON** (same USD value on both sides). |
| Is that a hard peg? | **No.** DeDust pools are **CPMM AMMs** (v2 for new pools since Nov 2025). Price moves with every swap. A $1 *target* at launch ≠ permanent $1 without extra mechanisms (reserves, oracle, buyback, or a dedicated stablecoin design). |
| Minimum liquidity? | DeDust UI warns: deposit **at least ~$50 equivalent in TON or USDT** so the token becomes tradable and gets a fiat estimate in the UI. |
| Can I scale to other blockchains? | **Liquidity/trading:** yes indirectly via bridges and wrapped assets on other DEXes. **DLLR product logic:** HSP treats issuance and program rules as **TON-canonical**; other chains are portfolio / bridge / growth surfaces, not a second native DLLR ledger. |

---

## 2) Prerequisites before the pool

### 2.1 Deploy DLLR jetton on TON

Use the repo jetton stack:

1. Configure metadata (name, symbol, decimals) in the deploy flow under `dllr/token/`.
2. Run `acton script contracts/scripts/deploy.tolk` (or the app Deploy page) on **testnet first**, then mainnet.
3. Record **jetton master address** — required for DeDust vault/pool creation and for HSP swap UI token lists.

### 2.2 Treasury wallet

You need a wallet that holds:

- **TON** — gas for deploy, vault creation, pool creation, and liquidity deposit (DeDust recommends **≥ 1.5 TON** available; first deposit can cost up to ~1.1 TON depending on pair).
- **DLLR** — minted supply you are willing to seed into the pool (treasury / LP allocation).

### 2.3 Decide what “$1” means operationally

| Interpretation | What you actually do |
|----------------|----------------------|
| **Marketing target** | Seed pool at ratio that implies $1 at launch; accept market drift. |
| **Soft band** | Operate a **market maker** or periodic **rebalancing LP** (add/remove liquidity when price deviates). Still not a peg. |
| **Hard peg** | Requires **on-chain stablecoin mechanics** (collateral, mint/redeem, oracle, governance) — **not** something a vanilla DeDust volatile pool provides. DLLR’s current jetton template is a standard fungible jetton, not an algorithmic stable. |

For a first launch, most teams choose **marketing target + deep enough liquidity + optional USDT pool** (see §4).

---

## 3) Create TON ↔ DLLR pool on DeDust

### 3.1 UI flow (manual)

1. Open [DeDust Pools](https://dedust.io/pools) → **Create pool**.
2. Select **TON** and **DLLR** (import jetton by master address if not whitelisted).
3. Choose fee tier (e.g. **0.25%**) and fee asset (TON, DLLR, or both per UI options).
4. Confirm pool creation in wallet (~0.26–0.3 TON gas).
5. **Deposit initial liquidity** — both assets in one operation (UI) or two-step vault deposits (SDK).

> **Critical:** DeDust explicitly warns that **the amounts you deposit set the initial token price**. Double-check the ratio before signing.

### 3.2 SDK flow (automatable)

From [DeDust docs](https://docs.dedust.io/docs/adding-new-jettons):

```typescript
// 1) Ensure jetton vault exists
await factory.sendCreateVault(sender, {
  asset: Asset.jetton(DLLR_MASTER_ADDRESS),
});

// 2) Create volatile pool TON + DLLR if not deployed
await factory.sendCreateVolatilePool(sender, {
  assets: [Asset.native(), Asset.jetton(DLLR_MASTER_ADDRESS)],
});

// 3) Deposit liquidity with explicit target balances
const tonAmount = toNano("500");   // example: 500 TON
const dllrAmount = toNano("2500"); // example: 2500 DLLR → 500 TON @ $5/TON ⇒ $1/DLLR
// ... sendDepositLiquidity to native vault + jetton transfer with forward payload
```

Use the same **`targetBalances`** on **both** sides of the deposit; the pool mints LP tokens to your address.

### 3.3 Setting the ratio for ~$1 per DLLR

Let:

- `P_TON` = TON price in USD (from oracle, CEX, or DeDust TON/USDT mid).
- Target `P_DLLR = 1` USD.

Initial pool ratio (volatile CPMM):

```
DLLR per TON  = P_TON / P_DLLR  = P_TON
TON per DLLR  = P_DLLR / P_TON  = 1 / P_TON
```

**Example** (`P_TON = $5`):

| Side | Amount |
|------|--------|
| DLLR | 10,000 |
| TON | 50,000 (= 10,000 × 5) |

After deposit, spot price ≈ **5 TON per DLLR** → **$1 per DLLR** at $5/TON.

**Example** (`P_TON = $3`):

| Side | Amount |
|------|--------|
| DLLR | 10,000 |
| TON | 30,000 |

Recompute **`P_TON` at deposit time** — do not reuse an old ratio after volatility.

### 3.4 What happens after launch

```
                    ┌─────────────────┐
  Buyers swap TON → │  TON / DLLR     │ → price(DLLR↑) if demand
                    │  CPMM pool      │
  Sellers swap DLLR→│  (DeDust v2)    │ → price(DLLR↓) if supply
                    └─────────────────┘
                              │
                              ▼
              Fiat display ≈ mid × TON/USD (from TON/USDT routes)
```

- **Slippage** grows with trade size vs pool depth.
- **Arbitrage** vs other venues (CEX, other DEX pools) will move price toward global TON and DLLR markets.
- **Your LP position** is exposed to **impermanent loss** if DLLR/TON ratio diverges from entry.

---

## 4) Recommended launch stack (beyond a single pool)

| Step | Why |
|------|-----|
| **TON/DLLR pool** | Native path for TON wallet users and HSP “Buy TON for DLLR” messaging. |
| **USDT/DLLR pool** (optional second pool) | Direct dollar-stable routing; DeDust routes swaps via TON or USDT for best price. |
| **≥ $50 USD depth** (DeDust minimum guidance) | Token shows tradable + USD estimate in DeDust UI. |
| **Deeper LP for production** | Rule of thumb: enough depth that a typical user swap (< 1–2% of pool) has acceptable slippage for your product. |
| **Monitor TON/USDT on DeDust** | Your implied DLLR/USD = `(DLLR/TON pool price) × (TON/USD)`. |

HSP Swap today uses **Swap.Coffee** aggregation ([`ui/swap/`](../ui/swap/)); once DLLR is listed on DeDust (and other TON DEXes), aggregators may pick it up — verify with Swap.Coffee token list / routing after pool live.

---

## 5) Maintaining “about $1” (optional operations)

A volatile pool **will drift**. Mitigations (in increasing complexity):

| Approach | Effort | Peg strength |
|----------|--------|--------------|
| **Deep initial LP + communication** | Low | Weak — market sets price |
| **Treasury rebalancing** — add/remove LP when band breached | Medium | Soft band |
| **Dedicated MM bot** — quotes on DeDust + CEX | High | Soft band |
| **Second pool USDT/DLLR** — arb between TON and USDT legs | Medium | Indirect USD anchor |
| **Redeem/mint stable module** (new contracts) | Very high | Strong — product change |

None of these are “set and forget.” Budget **ongoing TON** for rebalancing txs and **inventory** of both TON and DLLR if you market-make.

---

## 6) Multi-chain scaling — what is and is not possible

Align with [`wallet_telegram_standalone_multichain_proposal.md`](wallet_telegram_standalone_multichain_proposal.md):

### 6.1 TON-canonical DLLR

- **Issuance, locks, rewards, compliance hooks** → **TON jetton + program contracts**.
- DeDust **TON/DLLR** is the **primary on-chain liquidity home** for the product token.

### 6.2 Other blockchains (Ethereum, Solana, …)

| Goal | Realistic path |
|------|----------------|
| **User holds assets on other chains** | HSP **connected wallets** (WalletConnect, etc.) — view/sign on those chains; DLLR balance still read from TON. |
| **Trade DLLR on another chain** | **Bridge** TON jetton → wrapped DLLR on target chain → create **that chain’s DEX pool** (Uniswap, Raydium, …). Bridge choice, custody, and liquidity are **separate** projects with security and legal review. |
| **Same $1 price everywhere** | Requires **shared liquidity or arbitrage** across bridge + pools — expensive and slow; not automatic from one DeDust pool. |
| **Duplicate mint on every chain** | **Avoid** unless governance explicitly controls supply across chains; otherwise double-spend and trust assumptions explode. |

**UI rule (already in HSP docs):** show **Primary (TON + DLLR)** first; **Other networks** as secondary connected accounts.

### 6.3 Scaling checklist

1. **Mainnet DLLR** deployed and verified.
2. **DeDust TON/DLLR** (and optionally **USDT/DLLR**) seeded at computed ratio.
3. **Token metadata** + aggregator/listing submissions (Swap.Coffee, Dexscreener, etc.).
4. **HSP swap/send** — jetton master in app token registry; test buy/sell paths.
5. **Bridge** (if required) — audited bridge, wrapped token contract, destination DEX LP — **after** TON liquidity is stable.
6. **Legal/compliance** — stablecoin-like $1 claims may trigger marketing and regulatory scrutiny depending on jurisdiction.

---

## 7) Testnet rehearsal (recommended)

1. Deploy DLLR on **TON testnet**.
2. Create testnet DeDust pool (same steps; use testnet TON faucets).
3. Execute small swaps both directions; verify implied USD in UI.
4. Script liquidity deposit via `@dedust/sdk` with **`targetBalances`** matching intended mainnet ratio.
5. Only then repeat on mainnet with production amounts.

---

## 8) Quick decision table

| You want… | Do this |
|-----------|---------|
| List DLLR for TON swaps | DeDust **TON/DLLR** pool + ≥ ~$50 depth |
| Launch near **$1/DLLR** | Deposit at **`1 DLLR : (P_TON in TON)`** at current TON/USD |
| Keep near $1 long-term | MM / rebalancing / USDT pool — or redesign as stable |
| DLLR on Ethereum too | Bridge + wrapped token + **new** Uniswap-style pool — not DeDust alone |
| HSP app swap support | Register jetton; confirm Swap.Coffee or integrate DeDust route |

---

## 9) Open product questions

- Exact **mainnet mint schedule** and % allocated to LP vs treasury vs rewards.
- Whether **$1** is a **user promise** (stable) or **initial reference price** (volatile jetton).
- **KYC / transfer restrictions** on jetton (if added in contract) affecting DEX composability.
- Whether HSP should **embed DeDust SDK** directly vs rely on **Swap.Coffee** aggregation for DLLR routes.
