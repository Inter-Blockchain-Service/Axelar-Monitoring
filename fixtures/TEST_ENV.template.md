# Test environment (local copy)

Copy this file to `fixtures/TEST_ENV.md` (gitignored) and fill in your values.

## Network

| Field | Value |
|-------|-------|
| Network | `mainnet` / `testnet` |
| CHAIN_ID | e.g. `axelar-dojo-1` |
| RPC_ENDPOINT | `http://...` (do not commit) |
| AXELAR_API_ENDPOINT | `http://...` (do not commit) |

## Addresses

| Field | Value |
|-------|-------|
| VALIDATOR_ADDRESS | hex consensus address |
| BROADCASTER_ADDRESS | bech32 |
| AMPD_ADDRESS | bech32 |
| VALIDATOR_MONIKER | |

## Monitored chains

| Type | Chains |
|------|--------|
| EVM_SUPPORTED_CHAINS | e.g. `ethereum,polygon` |
| AMPD_SUPPORTED_CHAINS | e.g. `sui,xrpl` |

## Alerts (test)

| Channel | Enabled | Notes |
|---------|---------|-------|
| Discord | yes/no | test webhook sent on |
| Telegram | yes/no | test message sent on |

## Reference transactions (optional)

Replace fixture placeholders with your real hashes for manual replay:

| Scenario | Tx hash | Date collected |
|----------|---------|----------------|
| EVM ConfirmGatewayTxs | | |
| EVM RefundMsgRequest vote | | |
| EVM legacy Voted | | |
| AMPD poll_started | | |
| AMPD voted | | |
| AMPD signature_submitted | | |
