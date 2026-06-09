# Beta manual checklist (`v0.1.0-beta`)

Copy to `CHECKLIST_BETA.md` in the repo root (gitignored).  
Run against tag `v0.1.0-beta` or `main` before starting Phase 1.

**Date:** _______________  
**Operator:** _______________  
**Network:** _______________

## Setup

- [ ] `.env` configured from `env.example`
- [ ] `npm install` OK
- [ ] `npm run dev` — frontend `:3002` + backend `:3001`

## Dashboard — blocks

- [ ] Connection status shows connected (green)
- [ ] Block height increments over 2–3 minutes
- [ ] Sign status grid updates (signed / missed / proposed colors)
- [ ] Metric cards (signed, missed, rate) look consistent

## Dashboard — EVM votes

- [ ] EVM section enabled (`EVM_SUPPORTED_CHAINS` or defaults)
- [ ] At least one chain shows poll squares (not all gray `unknown`)
- [ ] After a vote: orange → green or red within ~5 minutes
- [ ] Click chain opens history modal
- [ ] Vote tx link opens Axelarscan when `txHash` present

## Dashboard — AMPD

- [ ] AMPD section enabled (`AMPD_SUPPORTED_CHAINS` set)
- [ ] Votes and signings rows visible per chain
- [ ] Status colors update after AMPD activity

## Alerts

- [ ] Discord and/or Telegram test notification received
- [ ] Alert message includes validator moniker and timestamp
- [ ] No spurious critical alerts during 30 min stable run

## Resilience

- [ ] Stop RPC or block port briefly → disconnect shown on dashboard
- [ ] Restore RPC → reconnect within cooldown (~10s) without manual restart
- [ ] Metrics resume after reconnection

## Notes / issues found

```
(write observations here — false alerts, wrong colors, missing chains, etc.)
```

## Sign-off

- [ ] Checklist complete — ready for Phase 1 on `refactor/improvements`

**Signed off:** _______________
