## Agent Guidance

- If the `acton` Codex skill is available in this environment, use it for Acton CLI, Tolk, wrappers, tests, scripts, deployment, and `Acton.toml` tasks.
- If the `acton` skill is not available, continue without it. Do not block on installation and do not assume network access is available.
- Treat `contracts/Owner.tolk` and `contracts/types.tolk` as the source of truth for storage, messages, errors, and ABI-facing behavior.
- This contract is the on-chain Owner used by `/owner-deploy` and the Smart Owner form: a controller wallet, a title, a text, and wallet-like sends so other contracts can use this address as their admin.
- Keep `wrappers/Owner.gen.tolk`, `wrappers-ts/Owner.gen.ts`, `tests/owner.test.tolk`, and `scripts/deploy.tolk` aligned with contract changes.
- Treat `wrappers/Owner.gen.tolk` and `wrappers-ts/Owner.gen.ts` as generated output. Prefer regenerating them with `acton wrapper Owner` and `acton wrapper --ts Owner` over hand-editing them when the ABI changes.
- Prefer this validation loop when feasible: `acton build`, `acton test`, `acton run deploy-emulation`.
- Before proposing broadcast deployment changes, verify the script in emulation first.
- When command syntax or flags are unclear, verify them with `acton --help` or `acton <command> --help`.
