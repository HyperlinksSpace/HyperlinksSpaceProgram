# Owner contract

Wallet-like Gram (TON) contract for the Owner deploy flow. Other contracts can store this address as their admin. Transferring the controller wallet hands off every contract that points here, without rewriting those contracts.

The on-chain state is the Smart Owner form: controller wallet, title, and text. The controller can send Ton and an arbitrary message body from this address, the same way a wallet spends from its own address.

## Layout

- `contracts/Owner.tolk` — message handling
- `contracts/types.tolk` — storage, errors, and messages
- `wrappers/Owner.gen.tolk` — generated Tolk wrapper (do not edit)
- `wrappers-ts/Owner.gen.ts` — generated TypeScript wrapper (do not edit)
- `tests/owner.test.tolk` — controller, transfer, deposits, and forwarded admin calls
- `scripts/deploy.tolk` — emulation deploy with 5 Ton

## Build and test

```bash
acton build
acton test
acton fmt --check
```

Regenerate wrappers after an ABI change:

```bash
acton wrapper Owner
acton wrapper --ts Owner
```

## Emulate a deploy

```bash
acton run deploy-emulation
```

The script uses a wallet named `deployer`. To broadcast on testnet, create that wallet and run:

```bash
acton wallet new --name deployer --local --airdrop
acton script scripts/deploy.tolk --net testnet
```
