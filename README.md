# Componere

Componere turns an approved invoice into a single-use, expiring payment permission on Tempo Moderato testnet, then produces a receipt anyone can verify. Approval is the permission itself: the chain enforces who may call, how much may move, which vendor may receive it, and when the permission expires.

## Architecture

- `packages/policy-engine`: pure TypeScript rules for vendor, payment and period caps, evidence, PO tolerance, roles, separation of duties, duplicates, token/network allowlists, canonical JSON, and SHA-256 `decisionHash`.
- `apps/api`: Express + SQLite state machine. Every transition appends actor, timestamp, policy version, and decision hash to `audit_log`. Chain calls go through `TempoAdapter`; the live implementation uses official `viem/tempo` APIs and tests use `MockTempoAdapter`.
- `apps/web`: Vite + React + Tailwind settlement studio with request, review/approve, receipt/verifier, activity, and attack-scene views.
- `scripts/spike.ts`: Stage 1 gate against the official access-key API.
- `packages/escrow-core`: chain-agnostic escrow model and separate Tempo/Solana adapters. One agreement may have separate escrows; Componere does not claim cross-chain atomic settlement.
- `contracts/tempo`: Solidity milestone escrow using OpenZeppelin safe ERC-20 transfers and reentrancy protection.
- `apps/solana/programs/componere_escrow`: isolated Anchor/Rust milestone escrow with SPL token decimal checks, approval permissions, release guards, and expiry refunds.

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

### Authenticated demo accounts

The application authentication service is the API's SQLite-backed session store. It supports registration, password login, `/auth/me` session verification, and logout. Passwords are stored only as scrypt hashes; the frontend receives an opaque session token. No external auth provider is configured.

```sh
DEMO_MODE=true WEB_ORIGIN=http://localhost:5173 pnpm api
pnpm web
```

Open `http://localhost:5173`, choose **Explore Demo Accounts**, then continue as either:

- **Demo Client** (`client.demo@example.com`): create/review agreements, fund preview escrow, and approve milestones.
- **Demo Freelancer** (`freelancer.demo@example.com`): view the shared Website Development agreement and submit deliverables.

The development password is `ComponereDemo2026!` when signing in through an API client. The UI also supports creating a client or freelancer account with `/auth/register` and signing in with `/auth/login`; it does not place passwords in browser storage. Set `DEMO_PASSWORD` to override the seeded demo password locally. When `DEMO_MODE=false` (the default), seeded demo users and demo agreement data are not provisioned, but normal registration and login remain available.

The seeded Website Development agreement is explicitly labeled **DEMO DATA**. Its preview funding endpoint never claims a blockchain transaction. Solana wallet connection is available on Devnet, but actual funding/release requires a deployed Anchor program, configured `SOLANA_PROGRAM_ID`, funded wallets, and wallet signatures; no fake signatures are generated. Set `WEB_ORIGIN` to the exact browser origin serving the Vite app so API authentication requests pass CORS validation.

The authenticated dashboard, agreement list, agreement creation wizard, agreement detail view, freelancer assignment, deliverable submission, and client approval actions use the API and SQLite persistence. A client can assign a freelancer who belongs to the same organization; the API enforces that relationship for subsequent reads and actions.

Open `http://localhost:5173`. The seeded demo context is one vendor (`vendor-demo`), two approvers (`bob` / finance and `carol` / controller), and the versioned default policy. Submit a request, approve as finance, settle on Moderato, verify the returned transaction hash, download the receipt JSON, and run the demo-only attack scene.

Tempo uses the current official Moderato configuration: chain ID `42431`, RPC `https://rpc.moderato.tempo.xyz`, and explorer `https://explore.testnet.tempo.xyz`. AlphaUSD is the verified TIP-20 demo token with 6 decimals. Set `TEMPO_ESCROW_ADDRESS` only after deploying and verifying the Solidity escrow.

Solana is isolated behind `SolanaEscrowAdapter`. `SOLANA_CLUSTER=devnet` selects the official Circle devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`; mainnet selects `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. The Anchor program must be deployed and its program ID configured before any wallet transaction is enabled.

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
- Tempo and Solana escrow contracts are source boundaries in this repository; no deployment address or successful testnet transaction is claimed.
- Forge and Anchor CLI toolchains were unavailable in this environment, so Solidity and Rust program tests must be run in a contract-enabled CI or local toolchain.
- The invoice/evidence truth and policy configuration are off-chain responsibilities.
- Root/admin key provisioning is a trust point and private-key custody is outside this repository.
- The live adapter retains the ephemeral signer in process memory for the settlement flow; a production deployment needs secure signer lifecycle storage.
