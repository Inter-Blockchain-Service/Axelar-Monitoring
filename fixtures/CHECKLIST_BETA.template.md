# Beta manual checklist (`v0.1.0-beta`)

Copy to `CHECKLIST_BETA.md` in the repo root (gitignored).  
Run against tag `v0.1.0-beta` or `main` before starting Phase 1.

**Date:** _______________  
**Operator:** _______________  
**Network:** _______________

## Setup

- [x] `.env` configured from `env.example`
- [x] `npm install` OK
- [x] `npm run dev` — frontend `:3002` + backend `:3001`

## Dashboard — blocks

- [x] Connection status shows connected (green)
- [x] Block height increments over 2–3 minutes
- [x] Sign status grid updates (signed / missed / proposed colors)
- [x] Metric cards (signed, missed, rate) look consistent

## Dashboard — EVM votes

- [x] EVM section enabled (`EVM_SUPPORTED_CHAINS` or defaults)
- [x] At least one chain shows poll squares (not all gray `unknown`)
- [x] After a vote: orange → green or red within ~5 minutes
- [x] Click chain opens history modal
- [x] Vote tx link opens Axelarscan when `txHash` present

## Dashboard — AMPD

- [x] AMPD section enabled (`AMPD_SUPPORTED_CHAINS` set)
- [x] Votes and signings rows visible per chain
- [x] Status colors update after AMPD activity

## Alerts

- [x] Discord and/or Telegram test notification received
- [x] Alert message includes validator moniker and timestamp
- [x] No spurious critical alerts during 30 min stable run

## Resilience

- [x] Stop RPC or block port briefly → disconnect shown on dashboard
- [x] Restore RPC → reconnect within cooldown (~10s) without manual restart
- [x] Metrics resume after reconnection

## Notes / issues found

```
(write observations here — false alerts, wrong colors, missing chains, etc.)
```

## Sign-off

- [x] Checklist complete — ready for Phase 1 on `refactor/improvements`

**Signed off:** _______________
