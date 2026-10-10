# Componere rules

- Tempo Moderato testnet only. Never commit or log private keys; use `TEMPO_ROOT_PRIVATE_KEY`.
- Use official Tempo APIs and selectors only. The verified TIP-20 selector is `transferWithMemo(address,uint256,bytes32)`.
- Amounts are bigint base units. AlphaUSD/TIP-20 USD tokens use 6 decimals. Never use floats.
- Keep the policy engine pure and deterministic: no I/O, clock, randomness, LLM, or chain calls.
- Never put invoice contents on-chain; only the canonical SHA-256 decision hash is used as the bytes32 memo.
- A failed transaction is never success. Settle only after a confirmed successful receipt, then revoke the access key.
- Preserve the legal request state machine and append-only audit log. Requesters cannot approve their own requests.
- Use `TempoAdapter` for chain calls so tests can use `MockTempoAdapter`.
- Keep demo UI and API labels explicit: Testnet only. Use the phrase bounded blast radius, not trustless.