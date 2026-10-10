# Componere

Componere turns an approved invoice into a single-use, expiring payment permission on Tempo Moderato testnet, then produces a receipt anyone can verify. Approval is the permission itself: the chain enforces who may call, how much may move, which vendor may receive it, and when the permission expires.

## Architecture

- `packages/policy-engine`: pure TypeScript rules for vendor, payment and period caps, evidence, PO tolerance, roles, separation of duties, duplicates, token/network allowlists, canonical JSON, and SHA-256 `decisionHash`.
- `apps/api`: Express + SQLite state machine. Every transition appends actor, timestamp, policy version, and decision hash to `audit_log`. Chain calls go through `TempoAdapter`; the live implementation uses official `viem/tempo` APIs and tests use `MockTempoAdapter`.
- `apps/web`: Vite + React + Tailwind settlement studio with request, review/approve, receipt/verifier, activity, and attack-scene views.
- `scripts/spike.ts`: Stage 1 gate against the official access-key API.

## Trust model

Invoice truth, evidence, policy evaluation, and quorum are checked off-chain. Tempo enforces the bounded blast radius: the authorized key is limited to the approved amount, one vendor recipient, one `transferWithMemo` call scope, and a fixed expiry. Invoice contents never go on-chain; only the canonical decision hash is used as the 32-byte memo. This system is not trustless: the API, policy configuration, and key-provisioning authority remain trust points.

## Setup and demo

Testnet only. Fund a root account using the [Moderato faucet](https://tempo.xyz/developers/docs/quickstart/faucet), then configure the environment:

```sh
cp .env.example .env
# Set TEMPO_ROOT_PRIVATE_KEY and TEMPO_RECIPIENT locally; never commit .env.
npm install
npm test
npm run typecheck
```

Run the API and web app in separate terminals:

```sh
npm run api
npm run web
```

Open `http://localhost:5173`. The seeded demo context is one vendor (`vendor-demo`), two approvers (`bob` / finance and `carol` / controller), and the versioned default policy. Submit a request, approve as finance, settle on Moderato, verify the returned transaction hash, download the receipt JSON, and run the demo-only attack scene.

To run the live Stage 1 gate directly:

```sh
npm run spike
```

Without funded credentials the spike intentionally prints a FAIL prerequisite and makes no chain calls. Its fallback is direct backend signing with the decision hash in the memo, with enforcement labeled app-level.

## Verification

```sh
npm test
npm run typecheck
npx vite build --config apps/web/vite.config.ts
npm run build
```

## Limitations

- Moderato testnet only; no production chain deployment or audit.
- The invoice/evidence truth and policy configuration are off-chain responsibilities.
- Root/admin key provisioning is a trust point and private-key custody is outside this repository.
- The live adapter retains the ephemeral signer in process memory for the settlement flow; a production deployment needs secure signer lifecycle storage.
