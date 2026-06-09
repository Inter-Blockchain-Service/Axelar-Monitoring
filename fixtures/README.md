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
2. Fetch REST payload:
   ```bash
   curl "http://YOUR_NODE:1317/cosmos/tx/v1beta1/txs/TX_HASH"
   ```
3. For WebSocket events: capture from node logs or save a `tm.event='Tx'` message from your RPC subscription.
4. Redact private endpoints and real addresses before committing updated fixtures.
5. Keep file names and `_meta` block in sync.

## Fixture index

| File | Type | Used by |
|------|------|---------|
| `evm/confirm-gateway-txs-ws-event.json` | WS `Tx` events | `EvmVoteManager.extractPollIdFromEvents` |
| `evm/vote-refund-msg-request-api.json` | REST tx body | `EvmVoteManager.processVoteMessage` |
| `evm/vote-legacy-voted-ws-event.json` | WS legacy vote | `EvmVoteManager.isOurVoteTransaction` |
| `ampd/poll-started-ws-event.json` | WS poll started | `AmpdManager.processPollStarted` |
| `ampd/voted-ws-event.json` | WS voted | `AmpdManager.processVotesAndSignatures` |
| `ampd/vote-tx-api-response.json` | REST vote tx | `AmpdManager.fetchVoteDetails` |
| `ampd/signature-submitted-ws-event.json` | WS signature | `AmpdManager.processVotesAndSignatures` |
| `ampd/signature-tx-api-response.json` | REST signature tx | `AmpdManager.fetchSignatureDetails` |
| `tendermint/new-block-signed.json` | NewBlock | `ValidatorSignatureManager` |
| `tendermint/new-block-missed.json` | NewBlock | `ValidatorSignatureManager` |
| `tendermint/new-block-proposed.json` | NewBlock | `ValidatorSignatureManager` |

## Next step (Phase 3)

Wire these fixtures into Vitest with helpers:

```ts
import confirmGateway from '../../fixtures/evm/confirm-gateway-txs-ws-event.json';
// evmVoteManager.handleTransaction(adaptWsTx(confirmGateway));
```
