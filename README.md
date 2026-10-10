# Componere v2: Ephemeral Settlement Mandates

Componere turns approval into a deterministic, non-custodial Tempo access key. The approver signs a disposable P-256 worker key scoped to one recipient, one `transferWithMemo(address,uint256,bytes32)` selector, a 4,500 USD ceiling, and a 300-second window.

## Quick start

```sh
npm install
npm test
npm run typecheck
```

The pure policy engine and canonical SHA-256 decision hash live in `src/core`. `src/chain/access-key.ts` is the Tempo adapter and requires a real `Account` plus an RPC when used against testnet. The attack-scene tests assert the three documented Tempo revert classes without pretending to be an RPC integration test.

Set `NEXT_PUBLIC_TEMPO_RPC_URL` to override the default Moderato endpoint.

## Stage 1 gate spike

The spike uses the official [Tempo access-key guide](https://tempo.xyz/developers/docs/accounts/access-keys) and the AccountKeychain API. Fund the root account from the [Moderato faucet](https://tempo.xyz/developers/docs/quickstart/faucet), copy `.env.example` to `.env`, set `TEMPO_ROOT_PRIVATE_KEY` and `TEMPO_RECIPIENT`, then run:

```sh
npm install
npm run spike
```

It authorizes a P-256 key for 24 hours with a one-time 10 AlphaUSD budget, scoped to `transferWithMemo(address,uint256,bytes32)` and one recipient. The spike prints the remaining limit before and after settlement, decodes the 32-byte memo, exercises wrong-recipient, over-budget, and post-revocation calls, and prints a PASS/FAIL table. Admin keys can authorize and revoke keys but cannot be given expiry, token budgets, or call scopes.
