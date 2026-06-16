# Test fixtures

Structured samples for Phase 0 baseline and future unit tests (Phase 3).

## Layout

```
fixtures/
├── README.md
├── TEST_ENV.template.md      # Copy → TEST_ENV.md (local, gitignored)
├── CHECKLIST_BETA.template.md  # Copy → CHECKLIST_BETA.md (local, gitignored)
├── evm/
├── ampd/
└── tendermint/
```

## Placeholder addresses

All fixtures use fake addresses. Replace with your real values only in **local** `TEST_ENV.md` (never commit secrets).

| Variable | Placeholder in fixtures |
|----------|-------------------------|
| Validator (hex) | `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` |
| Broadcaster (bech32) | `axelar1broadcasterplaceholder000000000000` |
| AMPD (bech32) | `axelar1ampdplaceholder00000000000000000` |

## Replacing with production data

1. Find a tx on [Axelarscan](https://axelarscan.io) (or testnet).
2. Fetch REST payload (example IBS endpoints):
   ```bash
   curl "https://axelar.ibs.team/api/cosmos/tx/v1beta1/txs/TX_HASH" -o fixtures/evm/api-tx-....json
   ```
3. Add a `_meta` block (see existing files) and verify parsing:
   ```bash
   node fixtures/evm/verify-real-tx.mjs
   ```
4. For WebSocket events: capture from node logs or save a `tm.event='Tx'` message from your RPC subscription.
5. Redact private endpoints and real addresses before committing updated fixtures.

## EVM fixture index

| File | Type | Used by |
|------|------|---------|
| `evm/api-tx-single-vote-ethereum-3171848.json` | REST tx | Single vote regression |
| `evm/api-tx-batch-vote-base-3171843.json` | REST tx | Batch vote (4 polls) |
| `evm/api-tx-batch-vote-base-3171884.json` | REST tx | Batch vote (5 polls) |
| `evm/api-tx-refund-signature-multisig.json` | REST tx | Multisig signature (not vote) |
| `evm/api-tx-refund-vote-minimal.json` | REST tx | Minimal vote body sample |
| `evm/ws-confirm-gateway-txs.json` | WS `Tx` events | `EvmVoteManager.extractPollIdFromEvents` |
| `evm/ws-batch-vote.json` | WS `Tx` events | `EvmVoteManager.isOurVoteTransaction` |
| `evm/ws-legacy-voted.json` | WS `Tx` events | `EvmVoteManager.isOurVoteTransaction` |
| `evm/ws-confirm-gateway-txs-log.json` | Tx log JSON | Poll extraction fallback path |

## Next step (Phase 3)

Wire these fixtures into Vitest with helpers:

```ts
import confirmGateway from '../../fixtures/evm/ws-confirm-gateway-txs.json';
// evmVoteManager.handleTransaction(adaptWsTx(confirmGateway));
```
